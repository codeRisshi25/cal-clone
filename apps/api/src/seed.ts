/**
 * Seed script — populates the DB with:
 *   - 1 admin user: risshi
 *   - 1 schedule: Working Hours (Mon-Fri 09:00-17:00 IST)
 *   - 3 event types: Quick Sync (15m), 30 Min Meeting (30m), 1 Hour Session (60m)
 *   - 8 bookings: 5 upcoming ACCEPTED, 2 past CANCELLED, 1 past ACCEPTED
 *
 * Run: pnpm --filter @cal-clone/api seed
 * (or: ts-node src/seed.ts from apps/api)
 */

import "dotenv/config";
import { PrismaClient } from "@cal-clone/db";

const prisma = new PrismaClient();

// Helper to create a Date with only time portion (for @db.Time columns)
function time(hh: number, mm: number): Date {
  const d = new Date(0);
  d.setUTCHours(hh, mm, 0, 0);
  return d;
}

// Helper to get a date relative to today
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(10, 0, 0, 0); // 10am
  return d;
}

async function main() {
  console.log("Seeding database...");

  // Wipe in safe order (respects FK constraints)
  await prisma.attendee.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.eventType.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.user.deleteMany();

  // ── User ──────────────────────────────────────────────────────────────────
  const user = await prisma.user.create({
    data: {
      username: "risshi",
      name: "Risshi",
      email: "risshi@example.com",
      timezone: "Asia/Kolkata",
    },
  });

  // ── Schedule ──────────────────────────────────────────────────────────────
  const schedule = await prisma.schedule.create({
    data: {
      name: "Working Hours",
      timezone: "Asia/Kolkata",
      userId: user.id,
      availability: {
        create: [
          // Mon–Fri (days 1–5), 09:00–17:00
          {
            days: [1, 2, 3, 4, 5],
            startTime: time(9, 0),
            endTime: time(17, 0),
          },
        ],
      },
    },
  });

  // Set as user's default schedule
  await prisma.user.update({
    where: { id: user.id },
    data: { defaultScheduleId: schedule.id },
  });

  // ── Event Types ───────────────────────────────────────────────────────────
  const quickSync = await prisma.eventType.create({
    data: {
      title: "Quick Sync",
      slug: "quick-sync",
      description: "A short 15-minute check-in call.",
      length: 15,
      color: "#0ea5e9",
      userId: user.id,
      scheduleId: schedule.id,
    },
  });

  const thirtyMin = await prisma.eventType.create({
    data: {
      title: "30 Min Meeting",
      slug: "30-min-meeting",
      description: "A standard half-hour meeting.",
      length: 30,
      color: "#8b5cf6",
      userId: user.id,
      scheduleId: schedule.id,
    },
  });

  const oneHour = await prisma.eventType.create({
    data: {
      title: "1 Hour Session",
      slug: "1-hour-session",
      description: "A deep-dive or mentoring session.",
      length: 60,
      color: "#f59e0b",
      userId: user.id,
      scheduleId: schedule.id,
    },
  });

  // ── Bookings ──────────────────────────────────────────────────────────────
  // Helper to create a booking with an attendee in one go
  async function createBooking(opts: {
    eventTypeId: string;
    startTime: Date;
    durationMins: number;
    status: "ACCEPTED" | "CANCELLED";
    attendeeName: string;
    attendeeEmail: string;
    cancellationNote?: string;
  }) {
    const endTime = new Date(opts.startTime.getTime() + opts.durationMins * 60 * 1000);
    return prisma.booking.create({
      data: {
        title: `${opts.attendeeName} / ${
          opts.eventTypeId === quickSync.id
            ? "Quick Sync"
            : opts.eventTypeId === thirtyMin.id
            ? "30 Min Meeting"
            : "1 Hour Session"
        }`,
        startTime: opts.startTime,
        endTime,
        status: opts.status,
        cancellationNote: opts.cancellationNote,
        eventTypeId: opts.eventTypeId,
        userId: user.id,
        attendee: {
          create: {
            name: opts.attendeeName,
            email: opts.attendeeEmail,
            timezone: "Asia/Kolkata",
          },
        },
      },
    });
  }

  // 5 upcoming ACCEPTED bookings
  await createBooking({ eventTypeId: quickSync.id,  startTime: daysFromNow(1),  durationMins: 15, status: "ACCEPTED", attendeeName: "Alice Roy",    attendeeEmail: "alice@example.com" });
  await createBooking({ eventTypeId: thirtyMin.id,  startTime: daysFromNow(2),  durationMins: 30, status: "ACCEPTED", attendeeName: "Bob Sharma",   attendeeEmail: "bob@example.com" });
  await createBooking({ eventTypeId: oneHour.id,    startTime: daysFromNow(3),  durationMins: 60, status: "ACCEPTED", attendeeName: "Carol Singh",  attendeeEmail: "carol@example.com" });
  await createBooking({ eventTypeId: quickSync.id,  startTime: daysFromNow(5),  durationMins: 15, status: "ACCEPTED", attendeeName: "Dev Patel",    attendeeEmail: "dev@example.com" });
  await createBooking({ eventTypeId: thirtyMin.id,  startTime: daysFromNow(7),  durationMins: 30, status: "ACCEPTED", attendeeName: "Eva Nair",     attendeeEmail: "eva@example.com" });

  // 2 past CANCELLED bookings
  await createBooking({ eventTypeId: quickSync.id,  startTime: daysFromNow(-3), durationMins: 15, status: "CANCELLED", attendeeName: "Frank Das",   attendeeEmail: "frank@example.com", cancellationNote: "Rescheduling needed" });
  await createBooking({ eventTypeId: thirtyMin.id,  startTime: daysFromNow(-7), durationMins: 30, status: "CANCELLED", attendeeName: "Grace Menon", attendeeEmail: "grace@example.com", cancellationNote: "No show" });

  // 1 past ACCEPTED booking
  await createBooking({ eventTypeId: oneHour.id,    startTime: daysFromNow(-5), durationMins: 60, status: "ACCEPTED", attendeeName: "Hari Iyer",   attendeeEmail: "hari@example.com" });

  console.log("Done! Seeded:");
  console.log("  1 user (risshi), 1 schedule, 3 event types, 8 bookings");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
