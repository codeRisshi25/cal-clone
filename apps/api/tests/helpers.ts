// Test helpers — shared utilities for creating test fixtures
import { PrismaClient } from "@cal-clone/db";

export const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

// Helper: parse HH:MM to a Date with only the time portion set (UTC epoch base)
export function time(hh: number, mm: number): Date {
  const d = new Date(0);
  d.setUTCHours(hh, mm, 0, 0);
  return d;
}

// Create a minimal user + schedule + event type for test purposes
export async function createTestFixture() {
  // Clean up first
  await prisma.attendee.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.eventType.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: {
      username: "risshi",
      name: "Risshi",
      email: "risshi@test.com",
      timezone: "Asia/Kolkata",
    },
  });

  const schedule = await prisma.schedule.create({
    data: {
      name: "Working Hours",
      timezone: "Asia/Kolkata",
      userId: user.id,
      availability: {
        create: [{ days: [1, 2, 3, 4, 5], startTime: time(9, 0), endTime: time(17, 0) }],
      },
    },
  });

  const eventType = await prisma.eventType.create({
    data: {
      title: "Quick Sync",
      slug: "quick-sync",
      length: 30,
      color: "#0ea5e9",
      userId: user.id,
      scheduleId: schedule.id,
    },
  });

  return { user, schedule, eventType };
}

export async function cleanup() {
  await prisma.attendee.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.eventType.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
}
