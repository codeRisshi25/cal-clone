/**
 * Bookings API — integration tests
 * Covers admin bookings (list, cancel, reschedule) and the public booking flow
 * (slots, book, double-booking prevention).
 *
 * Redis is mocked — all cache reads return null (cache miss) so every test
 * hits the DB, which is what we want to verify.
 */

import request from "supertest";
import app from "../src/index";
import { createTestFixture, cleanup, prisma, time } from "./helpers";

jest.mock("../src/lib/redis", () => ({
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  TTL: { EVENT_TYPES: 30, PROFILE: 300, BOOKINGS: 30, SLOTS: 120 },
}));

jest.mock("../src/lib/email", () => ({
  sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
  sendCancellationEmail: jest.fn().mockResolvedValue(undefined),
  sendRescheduleEmail: jest.fn().mockResolvedValue(undefined),
}));

// ---- helpers ----

// Creates a booking directly in the DB for a given event type
async function makeBooking(
  eventTypeId: string,
  userId: string,
  startTime: Date,
  length: number,
  status: "ACCEPTED" | "CANCELLED" | "PENDING" = "ACCEPTED"
) {
  const endTime = new Date(startTime.getTime() + length * 60 * 1000);
  return prisma.booking.create({
    data: {
      title: "Test Meeting",
      startTime,
      endTime,
      status,
      eventTypeId,
      userId,
      attendee: {
        create: { name: "Alice", email: "alice@test.com", timezone: "UTC" },
      },
    },
    include: { attendee: true },
  });
}

// ---- test state ----
let userId: string;
let eventTypeId: string;
let scheduleId: string;

beforeAll(async () => {
  const { user, eventType, schedule } = await createTestFixture();
  userId = user.id;
  eventTypeId = eventType.id;
  scheduleId = schedule.id;
});

afterAll(async () => {
  await cleanup();
});

// Clean up bookings between tests so they don't bleed into each other
afterEach(async () => {
  await prisma.attendee.deleteMany();
  await prisma.booking.deleteMany();
});

// ======================================================
// Admin bookings list
// ======================================================

describe("GET /api/admin/bookings", () => {
  it("returns upcoming bookings (future ACCEPTED)", async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days ahead
    await makeBooking(eventTypeId, userId, future, 30);

    const res = await request(app).get("/api/admin/bookings?status=upcoming");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0]).toHaveProperty("status", "ACCEPTED");
    expect(res.body[0]).toHaveProperty("attendee");
  });

  it("returns past bookings (past start time or CANCELLED)", async () => {
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    await makeBooking(eventTypeId, userId, past, 30);

    const res = await request(app).get("/api/admin/bookings?status=past");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it("defaults to upcoming when status param is omitted", async () => {
    const res = await request(app).get("/api/admin/bookings");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ======================================================
// Cancel booking
// ======================================================

describe("POST /api/admin/bookings/:id/cancel", () => {
  it("cancels an ACCEPTED booking and sets status to CANCELLED", async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const booking = await makeBooking(eventTypeId, userId, future, 30);

    const res = await request(app)
      .post(`/api/admin/bookings/${booking.id}/cancel`)
      .send({ reason: "Host unavailable" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "CANCELLED");
    expect(res.body).toHaveProperty("cancellationNote", "Host unavailable");
  });

  it("cancels without a reason (reason is optional)", async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const booking = await makeBooking(eventTypeId, userId, future, 30);

    const res = await request(app)
      .post(`/api/admin/bookings/${booking.id}/cancel`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "CANCELLED");
  });

  it("returns 409 when booking is already cancelled", async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const booking = await makeBooking(eventTypeId, userId, future, 30, "CANCELLED");

    const res = await request(app)
      .post(`/api/admin/bookings/${booking.id}/cancel`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("error", "Already cancelled");
  });

  it("returns 404 for an unknown booking id", async () => {
    const res = await request(app)
      .post("/api/admin/bookings/nonexistent-booking-id/cancel")
      .send({});
    expect(res.status).toBe(404);
  });
});

// ======================================================
// Reschedule booking
// ======================================================

describe("POST /api/admin/bookings/:id/reschedule", () => {
  it("marks old booking as RESCHEDULED and creates a new ACCEPTED booking", async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const booking = await makeBooking(eventTypeId, userId, future, 30);

    const newStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const res = await request(app)
      .post(`/api/admin/bookings/${booking.id}/reschedule`)
      .send({ newStartTime: newStart.toISOString() });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ACCEPTED");
    expect(res.body).toHaveProperty("rescheduledFrom", booking.uid);

    // Old booking should now be RESCHEDULED
    const old = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(old?.status).toBe("RESCHEDULED");
  });

  it("returns 409 when trying to reschedule a cancelled booking", async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const booking = await makeBooking(eventTypeId, userId, future, 30, "CANCELLED");

    const res = await request(app)
      .post(`/api/admin/bookings/${booking.id}/reschedule`)
      .send({ newStartTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString() });

    expect(res.status).toBe(409);
  });

  it("returns 400 when newStartTime is not a valid datetime", async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const booking = await makeBooking(eventTypeId, userId, future, 30);

    const res = await request(app)
      .post(`/api/admin/bookings/${booking.id}/reschedule`)
      .send({ newStartTime: "not-a-date" });

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown booking id", async () => {
    const res = await request(app)
      .post("/api/admin/bookings/does-not-exist/reschedule")
      .send({ newStartTime: new Date().toISOString() });
    expect(res.status).toBe(404);
  });
});

// ======================================================
// Public: GET slots
// ======================================================

describe("GET /api/public/:username/:slug/slots", () => {
  it("returns 400 when date param is missing", async () => {
    const res = await request(app).get("/api/public/risshi/quick-sync/slots");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when date format is wrong", async () => {
    const res = await request(app).get("/api/public/risshi/quick-sync/slots?date=06-01-2026");
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown user", async () => {
    const res = await request(app).get("/api/public/nobody/quick-sync/slots?date=2026-06-02");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown slug", async () => {
    const res = await request(app).get("/api/public/risshi/nonexistent-slug/slots?date=2026-06-02");
    expect(res.status).toBe(404);
  });

  it("returns an array of slot strings for a weekday with availability", async () => {
    // 2026-06-01 is a Monday — schedule covers Mon–Fri 09:00–17:00 IST
    const res = await request(app).get(
      "/api/public/risshi/quick-sync/slots?date=2026-06-01&tz=Asia/Kolkata"
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("slots");
    expect(Array.isArray(res.body.slots)).toBe(true);
    expect(res.body.slots.length).toBeGreaterThan(0);
    // Each slot should be a valid ISO date string
    expect(() => new Date(res.body.slots[0])).not.toThrow();
  });

  it("returns empty slots for a weekend", async () => {
    // 2026-06-06 is a Saturday
    const res = await request(app).get(
      "/api/public/risshi/quick-sync/slots?date=2026-06-06&tz=Asia/Kolkata"
    );
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(0);
  });

  it("excludes already-booked slots", async () => {
    // Book the very first slot on 2026-06-01 (09:00 IST = 03:30 UTC)
    const slotStart = new Date("2026-06-01T03:30:00.000Z");
    await makeBooking(eventTypeId, userId, slotStart, 30);

    const res = await request(app).get(
      "/api/public/risshi/quick-sync/slots?date=2026-06-01&tz=Asia/Kolkata"
    );
    expect(res.status).toBe(200);
    // 03:30 UTC should not appear in the free slots
    expect(res.body.slots).not.toContain("2026-06-01T03:30:00.000Z");
  });
});

// ======================================================
// Public: POST book
// ======================================================

describe("POST /api/public/:username/:slug/book", () => {
  it("creates a booking and returns 201 with attendee", async () => {
    const startTime = new Date("2026-06-01T04:00:00.000Z"); // 09:30 IST

    const res = await request(app)
      .post("/api/public/risshi/quick-sync/book")
      .send({
        name: "Bob Smith",
        email: "bob@example.com",
        startTime: startTime.toISOString(),
        timezone: "Asia/Kolkata",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("status", "ACCEPTED");
    expect(res.body.attendee).toHaveProperty("name", "Bob Smith");
    expect(res.body.attendee).toHaveProperty("email", "bob@example.com");
  });

  it("prevents double-booking the same slot (returns 409)", async () => {
    const startTime = new Date("2026-06-01T04:30:00.000Z"); // 10:00 IST

    // First booking succeeds
    const first = await request(app)
      .post("/api/public/risshi/quick-sync/book")
      .send({ name: "Alice", email: "a@a.com", startTime: startTime.toISOString(), timezone: "UTC" });
    expect(first.status).toBe(201);

    // Second booking on the same slot must fail
    const second = await request(app)
      .post("/api/public/risshi/quick-sync/book")
      .send({ name: "Carol", email: "c@c.com", startTime: startTime.toISOString(), timezone: "UTC" });
    expect(second.status).toBe(409);
    expect(second.body).toHaveProperty("error", "This slot is no longer available");
  });

  it("returns 400 for missing required fields", async () => {
    const res = await request(app)
      .post("/api/public/risshi/quick-sync/book")
      .send({ name: "No Email" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email", async () => {
    const res = await request(app)
      .post("/api/public/risshi/quick-sync/book")
      .send({
        name: "Bad Email",
        email: "not-an-email",
        startTime: new Date().toISOString(),
        timezone: "UTC",
      });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown slug", async () => {
    const res = await request(app)
      .post("/api/public/risshi/ghost-event/book")
      .send({
        name: "Test",
        email: "t@t.com",
        startTime: new Date().toISOString(),
        timezone: "UTC",
      });
    expect(res.status).toBe(404);
  });
});

// ======================================================
// Public: GET booking by uid + cancel
// ======================================================

describe("GET /api/public/bookings/:uid", () => {
  it("returns a booking by uid", async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const booking = await makeBooking(eventTypeId, userId, future, 30);

    const res = await request(app).get(`/api/public/bookings/${booking.uid}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("uid", booking.uid);
    expect(res.body).toHaveProperty("attendee");
  });

  it("returns 404 for unknown uid", async () => {
    const res = await request(app).get("/api/public/bookings/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/public/bookings/:uid/cancel", () => {
  it("allows attendee to cancel their booking by uid", async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const booking = await makeBooking(eventTypeId, userId, future, 30);

    const res = await request(app)
      .post(`/api/public/bookings/${booking.uid}/cancel`)
      .send({ reason: "Changed my mind" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "CANCELLED");
  });

  it("returns 409 when booking is already cancelled", async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const booking = await makeBooking(eventTypeId, userId, future, 30, "CANCELLED");

    const res = await request(app)
      .post(`/api/public/bookings/${booking.uid}/cancel`)
      .send({});

    expect(res.status).toBe(409);
  });
});
