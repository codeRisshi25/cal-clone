import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { cacheGet, cacheSet, cacheDel, TTL } from "../lib/redis";

const router: RouterType = Router();

// The default admin user seeded in the DB
const ADMIN_USERNAME = "risshi";

const createSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  length: z.number().int().positive(),
  color: z.string().optional(),
  scheduleId: z.string().optional(),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// GET /api/admin/event-types
router.get("/", async (_req: Request, res: Response) => {
  const cacheKey = "event-types:admin";

  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const user = await prisma.user.findUnique({ where: { username: ADMIN_USERNAME } });
  if (!user) return res.status(404).json({ error: "Admin user not found" });

  const eventTypes = await prisma.eventType.findMany({
    where: { userId: user.id },
    include: { schedule: true },
    orderBy: { createdAt: "asc" },
  });

  await cacheSet(cacheKey, eventTypes, TTL.EVENT_TYPES);
  return res.json(eventTypes);
});

// GET /api/admin/event-types/:id
router.get("/:id", async (req: Request, res: Response) => {
  const eventType = await prisma.eventType.findUnique({
    where: { id: req.params.id },
    include: { schedule: { include: { availability: true } } },
  });
  if (!eventType) return res.status(404).json({ error: "Event type not found" });
  return res.json(eventType);
});

// POST /api/admin/event-types
router.post("/", async (req: Request, res: Response) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const user = await prisma.user.findUnique({ where: { username: ADMIN_USERNAME } });
  if (!user) return res.status(404).json({ error: "Admin user not found" });

  // Check slug uniqueness for this user
  const existing = await prisma.eventType.findUnique({
    where: { userId_slug: { userId: user.id, slug: parse.data.slug } },
  });
  if (existing) return res.status(409).json({ error: "Slug already in use" });

  const eventType = await prisma.eventType.create({
    data: { ...parse.data, userId: user.id },
  });

  // Invalidate list cache
  await cacheDel("event-types:admin");
  return res.status(201).json(eventType);
});

// PUT /api/admin/event-types/:id
router.put("/:id", async (req: Request, res: Response) => {
  const parse = updateSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const existing = await prisma.eventType.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Event type not found" });

  // If slug is changing, check uniqueness
  if (parse.data.slug && parse.data.slug !== existing.slug) {
    const slugTaken = await prisma.eventType.findUnique({
      where: { userId_slug: { userId: existing.userId, slug: parse.data.slug } },
    });
    if (slugTaken) return res.status(409).json({ error: "Slug already in use" });
  }

  const updated = await prisma.eventType.update({
    where: { id: req.params.id },
    data: parse.data,
  });

  await cacheDel("event-types:admin");
  return res.json(updated);
});

// DELETE /api/admin/event-types/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const existing = await prisma.eventType.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Event type not found" });

  // Delete associated bookings (and their attendees) first to avoid FK constraint
  const bookings = await prisma.booking.findMany({
    where: { eventTypeId: req.params.id },
    select: { id: true },
  });
  if (bookings.length > 0) {
    const bookingIds = bookings.map((b: any) => b.id);
    await prisma.attendee.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.booking.deleteMany({ where: { eventTypeId: req.params.id } });
  }

  await prisma.eventType.delete({ where: { id: req.params.id } });
  await cacheDel("event-types:admin");
  return res.status(204).send();
});

export default router;
