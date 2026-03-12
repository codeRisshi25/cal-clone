/**
 * Event Types API — integration tests
 * Uses supertest to hit the Express app directly (no real HTTP server).
 * Requires a real Postgres DB pointed at by DATABASE_URL in .env.test.
 * Redis calls are mocked so we don't need a real Redis instance.
 */

import request from "supertest";
import app from "../src/index";
import { createTestFixture, cleanup, prisma } from "./helpers";

// Mock Redis so cache helpers are no-ops — we test DB behaviour, not caching
jest.mock("../src/lib/redis", () => ({
  cacheGet: jest.fn().mockResolvedValue(null), // always miss
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  TTL: { EVENT_TYPES: 30, PROFILE: 300, BOOKINGS: 30, SLOTS: 120 },
}));

// Mock email so we don't send real emails
jest.mock("../src/lib/email", () => ({
  sendBookingConfirmation: jest.fn().mockResolvedValue(undefined),
  sendCancellationEmail: jest.fn().mockResolvedValue(undefined),
}));

let eventTypeId: string;

beforeAll(async () => {
  const { eventType } = await createTestFixture();
  eventTypeId = eventType.id;
});

afterAll(async () => {
  await cleanup();
});

describe("GET /api/admin/event-types", () => {
  it("returns a list containing the seeded event type", async () => {
    const res = await request(app).get("/api/admin/event-types");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty("title", "Quick Sync");
  });
});

describe("GET /api/admin/event-types/:id", () => {
  it("returns the event type with schedule included", async () => {
    const res = await request(app).get(`/api/admin/event-types/${eventTypeId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", eventTypeId);
    // schedule is included with availability
    expect(res.body).toHaveProperty("schedule");
    expect(res.body.schedule).toHaveProperty("availability");
  });

  it("returns 404 for an unknown id", async () => {
    const res = await request(app).get("/api/admin/event-types/nonexistent-id-123");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/admin/event-types", () => {
  it("creates a new event type and returns 201", async () => {
    const res = await request(app)
      .post("/api/admin/event-types")
      .send({ title: "Deep Work", slug: "deep-work", length: 60, color: "#10b981" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("slug", "deep-work");
    expect(res.body).toHaveProperty("length", 60);
    // Clean up this extra event type
    await prisma.eventType.delete({ where: { id: res.body.id } });
  });

  it("returns 409 when slug is already in use", async () => {
    const res = await request(app)
      .post("/api/admin/event-types")
      .send({ title: "Duplicate", slug: "quick-sync", length: 15 });
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty("error", "Slug already in use");
  });

  it("returns 400 for invalid slug characters", async () => {
    const res = await request(app)
      .post("/api/admin/event-types")
      .send({ title: "Bad Slug", slug: "Has Spaces!", length: 30 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/admin/event-types")
      .send({ title: "No Length" });
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/admin/event-types/:id", () => {
  it("updates an existing event type", async () => {
    const res = await request(app)
      .put(`/api/admin/event-types/${eventTypeId}`)
      .send({ title: "Quick Sync Updated", length: 20 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("title", "Quick Sync Updated");
    expect(res.body).toHaveProperty("length", 20);
  });

  it("can toggle isActive to false", async () => {
    const res = await request(app)
      .put(`/api/admin/event-types/${eventTypeId}`)
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("isActive", false);
    // Restore
    await request(app)
      .put(`/api/admin/event-types/${eventTypeId}`)
      .send({ isActive: true, title: "Quick Sync" });
  });

  it("returns 404 for unknown id", async () => {
    const res = await request(app)
      .put("/api/admin/event-types/bad-id-xyz")
      .send({ title: "Ghost" });
    expect(res.status).toBe(404);
  });

  it("returns 409 when changing slug to one already taken", async () => {
    // Create a second event type to take the slug
    const other = await prisma.eventType.create({
      data: {
        title: "Other",
        slug: "other-slug",
        length: 30,
        userId: (await prisma.user.findUniqueOrThrow({ where: { username: "risshi" } })).id,
      },
    });

    const res = await request(app)
      .put(`/api/admin/event-types/${eventTypeId}`)
      .send({ slug: "other-slug" });
    expect(res.status).toBe(409);

    await prisma.eventType.delete({ where: { id: other.id } });
  });
});

describe("DELETE /api/admin/event-types/:id", () => {
  it("deletes an event type and returns 204", async () => {
    // Create a throwaway event type to delete
    const tmp = await prisma.eventType.create({
      data: {
        title: "To Delete",
        slug: "to-delete",
        length: 10,
        userId: (await prisma.user.findUniqueOrThrow({ where: { username: "risshi" } })).id,
      },
    });

    const res = await request(app).delete(`/api/admin/event-types/${tmp.id}`);
    expect(res.status).toBe(204);

    // Confirm it's gone
    const check = await prisma.eventType.findUnique({ where: { id: tmp.id } });
    expect(check).toBeNull();
  });

  it("returns 404 when deleting a non-existent id", async () => {
    const res = await request(app).delete("/api/admin/event-types/does-not-exist");
    expect(res.status).toBe(404);
  });
});
