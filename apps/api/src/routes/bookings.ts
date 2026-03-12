import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { cacheGet, cacheSet, cacheDel, TTL } from "../lib/redis";
import { sendCancellationEmail, sendRescheduleEmail } from "../lib/email";

const router: RouterType = Router();
const ADMIN_USERNAME = "risshi";

const cancelSchema = z.object({
  reason: z.string().optional(),
});

const rescheduleSchema = z.object({
  newStartTime: z.string().datetime(),
});

// GET /api/admin/bookings?status=upcoming|past
router.get("/", async (req: Request, res: Response) => {
  const status = (req.query.status as string) || "upcoming";
  const cacheKey = `bookings:admin:${status}`;

  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const user = await prisma.user.findUnique({ where: { username: ADMIN_USERNAME } });
  if (!user) return res.status(404).json({ error: "Admin user not found" });

  const now = new Date();

  const bookings = await prisma.booking.findMany({
    where: {
      userId: user.id,
      ...(status === "upcoming"
        ? { startTime: { gte: now }, status: "ACCEPTED" }
        : { OR: [{ startTime: { lt: now } }, { status: "CANCELLED" }] }),
    },
    include: { attendee: true, eventType: true },
    orderBy: { startTime: status === "upcoming" ? "asc" : "desc" },
  });

  await cacheSet(cacheKey, bookings, TTL.BOOKINGS);
  return res.json(bookings);
});

// POST /api/admin/bookings/:id/cancel
router.post("/:id/cancel", async (req: Request, res: Response) => {
  const parse = cancelSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { attendee: true, eventType: true, user: true },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.status === "CANCELLED") return res.status(409).json({ error: "Already cancelled" });

  const updated = await prisma.booking.update({
    where: { id: req.params.id },
    data: { status: "CANCELLED", cancellationNote: parse.data.reason },
  });

  await cacheDel("bookings:admin:upcoming", "bookings:admin:past");

  // Send cancellation email — fire and forget, don't block the response
  if (booking.attendee) {
    sendCancellationEmail({
      attendeeName: booking.attendee.name,
      attendeeEmail: booking.attendee.email,
      hostName: booking.user.name,
      eventTitle: booking.eventType.title,
      startTime: booking.startTime,
      timezone: booking.attendee.timezone,
      reason: parse.data.reason,
    }).catch(console.error);
  }

  return res.json(updated);
});

// POST /api/admin/bookings/:id/reschedule
router.post("/:id/reschedule", async (req: Request, res: Response) => {
  const parse = rescheduleSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { eventType: true, attendee: true },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.status === "CANCELLED") return res.status(409).json({ error: "Cannot reschedule a cancelled booking" });

  const newStart = new Date(parse.data.newStartTime);
  const newEnd = new Date(newStart.getTime() + booking.eventType.length * 60 * 1000);

  // Mark old booking as RESCHEDULED
  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "RESCHEDULED" },
  });

  // Create new booking
  const newBooking = await prisma.booking.create({
    data: {
      title: booking.title,
      startTime: newStart,
      endTime: newEnd,
      status: "ACCEPTED",
      eventTypeId: booking.eventTypeId,
      userId: booking.userId,
      rescheduledFrom: booking.uid,
      attendee: booking.attendee
        ? {
            create: {
              name: booking.attendee.name,
              email: booking.attendee.email,
              timezone: booking.attendee.timezone,
            },
          }
        : undefined,
    },
    include: { attendee: true },
  });

  await cacheDel("bookings:admin:upcoming", "bookings:admin:past");

  // Send reschedule notification email — fire and forget
  if (booking.attendee) {
    sendRescheduleEmail({
      attendeeName: booking.attendee.name,
      attendeeEmail: booking.attendee.email,
      hostName: "Risshi",
      eventTitle: booking.eventType.title,
      oldStartTime: booking.startTime,
      newStartTime: newStart,
      timezone: booking.attendee.timezone,
      newBookingUid: newBooking.uid,
    }).catch(console.error);
  }

  return res.json(newBooking);
});

export default router;
