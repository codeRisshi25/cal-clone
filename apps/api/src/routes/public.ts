import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { cacheGet, cacheSet, cacheDel, TTL } from "../lib/redis";
import { sendBookingConfirmation, sendCancellationEmail } from "../lib/email";
import { calculateSlots } from "../lib/slots";

const router: RouterType = Router();

const bookingSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  startTime: z.string().datetime(),
  timezone: z.string(),
  notes: z.string().optional(),
});

const cancelSchema = z.object({
  reason: z.string().optional(),
});

// IMPORTANT: /bookings/:uid routes must be registered BEFORE /:username to
// prevent Express from matching "bookings" as a :username param.

// GET /api/public/bookings/:uid — fetch a booking by uid (for success page + reschedule)
router.get("/bookings/:uid", async (req: Request, res: Response) => {
  const booking = await prisma.booking.findUnique({
    where: { uid: req.params.uid },
    include: { attendee: true, eventType: true, user: true },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  return res.json(booking);
});

// POST /api/public/bookings/:uid/cancel — attendee cancels their own booking
router.post("/bookings/:uid/cancel", async (req: Request, res: Response) => {
  const parse = cancelSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const booking = await prisma.booking.findUnique({
    where: { uid: req.params.uid },
    include: { attendee: true, eventType: true, user: true },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.status === "CANCELLED") return res.status(409).json({ error: "Already cancelled" });

  const updated = await prisma.booking.update({
    where: { uid: req.params.uid },
    data: { status: "CANCELLED", cancellationNote: parse.data.reason },
  });

  await cacheDel("bookings:admin:upcoming", "bookings:admin:past");

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

// GET /api/public/:username
// Returns the user's public profile + active event types
router.get("/:username", async (req: Request, res: Response) => {
  const { username } = req.params;
  const cacheKey = `profile:${username}`;

  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, name: true, avatarUrl: true, timezone: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  const eventTypes = await prisma.eventType.findMany({
    where: { userId: user.id, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  const result = { user, eventTypes };
  await cacheSet(cacheKey, result, TTL.PROFILE);
  return res.json(result);
});

// GET /api/public/:username/:slug
// Returns a single event type (for the booking page header)
router.get("/:username/:slug", async (req: Request, res: Response) => {
  const { username, slug } = req.params;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const eventType = await prisma.eventType.findUnique({
    where: { userId_slug: { userId: user.id, slug } },
    include: { schedule: { include: { availability: true } } },
  });
  if (!eventType || !eventType.isActive) return res.status(404).json({ error: "Event type not found" });

  return res.json({ user: { username: user.username, name: user.name, timezone: user.timezone }, eventType });
});

// GET /api/public/:username/:slug/slots?date=YYYY-MM-DD&tz=America/New_York
// Returns available time slots for a given date
router.get("/:username/:slug/slots", async (req: Request, res: Response) => {
  const { username, slug } = req.params;
  const { date, tz } = req.query as { date?: string; tz?: string };

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "date query param required (YYYY-MM-DD)" });
  }

  const timezone = tz || "UTC";

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const eventType = await prisma.eventType.findUnique({
    where: { userId_slug: { userId: user.id, slug } },
    include: { schedule: { include: { availability: true } } },
  });
  if (!eventType || !eventType.isActive) return res.status(404).json({ error: "Event type not found" });

  const cacheKey = `slots:${eventType.id}:${date}:${timezone}`;
  const cached = await cacheGet<string[]>(cacheKey);
  if (cached) return res.json({ slots: cached });

  // --- Slot calculation ---
  const slots = calculateSlots({ eventType, date, timezone });

  // Filter out already-booked slots
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  const existingBookings = await prisma.booking.findMany({
    where: {
      userId: user.id,
      status: { in: ["ACCEPTED", "PENDING"] },
      startTime: { gte: dayStart, lte: dayEnd },
    },
  });

  const freeSlots = slots.filter((slotTime) => {
    const slotStart = new Date(slotTime);
    const slotEnd = new Date(slotStart.getTime() + eventType.length * 60 * 1000);
    // A slot is taken if any existing booking overlaps with it
    return !existingBookings.some(
      (b: { startTime: Date; endTime: Date }) => b.startTime < slotEnd && b.endTime > slotStart
    );
  });

  await cacheSet(cacheKey, freeSlots, TTL.SLOTS);
  return res.json({ slots: freeSlots });
});

// POST /api/public/:username/:slug/book
router.post("/:username/:slug/book", async (req: Request, res: Response) => {
  const { username, slug } = req.params;

  const parse = bookingSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const eventType = await prisma.eventType.findUnique({
    where: { userId_slug: { userId: user.id, slug } },
  });
  if (!eventType || !eventType.isActive) return res.status(404).json({ error: "Event type not found" });

  const startTime = new Date(parse.data.startTime);
  const endTime = new Date(startTime.getTime() + eventType.length * 60 * 1000);

  // Double-booking check and creation wrapped in an atomic serializable transaction
  // to prevent Time-Of-Check to Time-Of-Use (TOCTOU) race conditions.
  let booking;
  try {
    booking = await prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          userId: user.id,
          status: { in: ["ACCEPTED", "PENDING"] },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });
      
      if (conflict) throw new Error("CONFLICT");

      return tx.booking.create({
        data: {
          title: `${parse.data.name} / ${eventType.title}`,
          startTime,
          endTime,
          status: "ACCEPTED",
          eventTypeId: eventType.id,
          userId: user.id,
          attendee: {
            create: {
              name: parse.data.name,
              email: parse.data.email,
              timezone: parse.data.timezone,
            },
          },
        },
        include: { attendee: true, eventType: true },
      });
    }, { isolationLevel: "Serializable" });
  } catch (err: any) {
    if (err.message === "CONFLICT") {
      return res.status(409).json({ error: "This slot is no longer available" });
    }
    // Let Express error boundary catch real database crashes
    throw err;
  }

  // Invalidate admin bookings cache and the slot cache for this date
  const dateStr = startTime.toISOString().slice(0, 10);
  await cacheDel(
    "bookings:admin:upcoming",
    "bookings:admin:past",
    `slots:${eventType.id}:${dateStr}:${parse.data.timezone}`
  );

  // Send confirmation email — fire and forget
  sendBookingConfirmation({
    attendeeName: parse.data.name,
    attendeeEmail: parse.data.email,
    hostName: user.name,
    eventTitle: eventType.title,
    startTime,
    endTime,
    timezone: parse.data.timezone,
    bookingUid: booking.uid,
  }).catch(console.error);

  return res.status(201).json(booking);
});

export default router;
