import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { cacheGet, cacheSet, cacheDel, TTL } from "../lib/redis";
import { sendBookingConfirmation, sendCancellationEmail } from "../lib/email";

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
      eventTypeId: eventType.id,
      status: { in: ["ACCEPTED", "PENDING"] },
      startTime: { gte: dayStart, lte: dayEnd },
    },
  });

  const freeSlots = slots.filter((slotTime) => {
    const slotStart = new Date(slotTime);
    const slotEnd = new Date(slotStart.getTime() + eventType.length * 60 * 1000);
    // A slot is taken if any existing booking overlaps with it
    return !existingBookings.some(
      (b) => b.startTime < slotEnd && b.endTime > slotStart
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

  // Double-booking check — ensure no ACCEPTED/PENDING booking overlaps this slot
  const conflict = await prisma.booking.findFirst({
    where: {
      eventTypeId: eventType.id,
      status: { in: ["ACCEPTED", "PENDING"] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });
  if (conflict) return res.status(409).json({ error: "This slot is no longer available" });

  const booking = await prisma.booking.create({
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

// ---------------------------------------------------------------------------
// Slot Calculator
// Calculates available time slots for a given event type on a given date.
// Extracted here for M1; will be moved to lib/slots.ts in M2 with full tests.
// ---------------------------------------------------------------------------
function calculateSlots(opts: {
  eventType: {
    length: number;
    schedule: {
      timezone: string;
      availability: Array<{
        days: number[];
        startTime: Date;
        endTime: Date;
        date: Date | null;
        isBlocked: boolean;
      }>;
    } | null;
  };
  date: string;   // YYYY-MM-DD (in the viewer's timezone)
  timezone: string;
}): string[] {
  const { eventType, date, timezone } = opts;
  const schedule = eventType.schedule;

  if (!schedule) return [];

  const { availability } = schedule;

  // Check for a date override first
  // We compare the date part of the override (stored as noon UTC) to the requested date
  const override = availability.find((a) => {
    if (!a.date) return false;
    return a.date.toISOString().slice(0, 10) === date;
  });

  if (override) {
    // If the day is blocked, return no slots
    if (override.isBlocked) return [];
    // Otherwise use the override's custom hours
    return buildSlots(date, override.startTime, override.endTime, eventType.length, timezone);
  }

  // No override — use the recurring rule for this day of week
  // We need to figure out the day of week IN the viewer's timezone
  // JS Date gives us day in local system time, so we use Intl to get the correct weekday
  const dayOfWeek = getDayOfWeekInTimezone(date, timezone); // 0=Sun ... 6=Sat

  const recurring = availability.find(
    (a) => !a.date && a.days.includes(dayOfWeek)
  );

  if (!recurring) return []; // no availability on this day

  return buildSlots(date, recurring.startTime, recurring.endTime, eventType.length, timezone);
}

// Build an array of ISO datetime strings (UTC) from start to end, stepping by `durationMins`
// startTimeRow / endTimeRow are Date objects with only the time part set (UTC, base epoch date)
function buildSlots(
  date: string,
  startTimeRow: Date,
  endTimeRow: Date,
  durationMins: number,
  timezone: string
): string[] {
  const slots: string[] = [];

  // Extract HH:MM from the Time columns (stored as epoch + time offset)
  const startH = startTimeRow.getUTCHours();
  const startM = startTimeRow.getUTCMinutes();
  const endH = endTimeRow.getUTCHours();
  const endM = endTimeRow.getUTCMinutes();

  // Build a Date in the schedule's timezone representing the start of the work window
  // We construct an ISO string for that timezone, then let the engine convert to UTC
  const startIso = toUtcFromTimezone(`${date}T${pad(startH)}:${pad(startM)}:00`, timezone);
  const endIso = toUtcFromTimezone(`${date}T${pad(endH)}:${pad(endM)}:00`, timezone);

  if (!startIso || !endIso) return [];

  let current = startIso.getTime();
  const windowEnd = endIso.getTime();
  const step = durationMins * 60 * 1000;

  // Generate slots: [current, current+duration) must fit inside the window
  while (current + step <= windowEnd) {
    slots.push(new Date(current).toISOString());
    current += step;
  }

  return slots;
}

// Convert a "local" datetime string (no timezone info) in a given IANA tz to a UTC Date
// Strategy: use Intl to find the UTC offset at that moment, then subtract it
function toUtcFromTimezone(localDatetime: string, timezone: string): Date | null {
  try {
    // Create a Date from the localDatetime as if it were UTC, then compute the actual offset
    const naiveDate = new Date(localDatetime + "Z");

    // Format that naive date in the target timezone to see what "local time" it corresponds to
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).formatToParts(naiveDate);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
    const localYear = parseInt(get("year"));
    const localMonth = parseInt(get("month")) - 1;
    const localDay = parseInt(get("day"));
    const localHour = parseInt(get("hour")) % 24;
    const localMin = parseInt(get("minute"));
    const localSec = parseInt(get("second"));

    // The offset is: naiveDate (UTC epoch) - Date.UTC(localParts)
    const offsetMs = naiveDate.getTime() - Date.UTC(localYear, localMonth, localDay, localHour, localMin, localSec);

    // Actual UTC time for the requested local datetime
    const requestedLocal = new Date(localDatetime + "Z").getTime();
    return new Date(requestedLocal + offsetMs);
  } catch {
    return null;
  }
}

// Get day of week (0=Sun) for a YYYY-MM-DD date in a given IANA timezone
function getDayOfWeekInTimezone(date: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).formatToParts(new Date(`${date}T12:00:00Z`));
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday ?? "Sun"] ?? 0;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Re-export for M2 tests (slots.ts will import these)
export { calculateSlots, buildSlots, getDayOfWeekInTimezone };

export default router;
