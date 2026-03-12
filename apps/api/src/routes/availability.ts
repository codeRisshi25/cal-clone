import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { z } from "zod";
import prisma from "../lib/prisma";
import { cacheDel } from "../lib/redis";

const router: RouterType = Router();
const ADMIN_USERNAME = "risshi";

const availabilityUpdateSchema = z.object({
  scheduleId: z.string(),
  timezone: z.string(),
  availability: z.array(
    z.object({
      days: z.array(z.number().int().min(0).max(6)),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    })
  ),
});

const overrideSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isBlocked: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  scheduleId: z.string(),
});

// Helper: parse HH:MM into a Date object (using a fixed base date, only time matters for @db.Time)
function parseTime(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(0); // epoch date — only the time portion is stored
  d.setUTCHours(h, m, 0, 0);
  return d;
}

// GET /api/admin/availability
// Returns all schedules for the admin user, with their availability rows
router.get("/", async (_req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { username: ADMIN_USERNAME },
    include: {
      schedules: {
        include: { availability: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!user) return res.status(404).json({ error: "Admin user not found" });
  return res.json({ schedules: user.schedules, defaultScheduleId: user.defaultScheduleId });
});

// PUT /api/admin/availability
// Replaces all non-override availability rows for a given schedule
router.put("/", async (req: Request, res: Response) => {
  const parse = availabilityUpdateSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const { scheduleId, timezone, availability } = parse.data;

  // Update schedule timezone
  await prisma.schedule.update({
    where: { id: scheduleId },
    data: { timezone },
  });

  // Delete all existing non-override rows (rows without a date)
  await prisma.availability.deleteMany({
    where: { scheduleId, date: null },
  });

  // Re-create them
  await prisma.availability.createMany({
    data: availability.map((row) => ({
      days: row.days,
      startTime: parseTime(row.startTime),
      endTime: parseTime(row.endTime),
      scheduleId,
    })),
  });

  // Invalidate all slot caches for this schedule — we use a wildcard pattern
  // (ioredis scan-based delete, but for simplicity we just delete known keys)
  // In production you'd use Redis SCAN to find and delete all matching keys
  await cacheDel("event-types:admin");

  const updated = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { availability: true },
  });
  return res.json(updated);
});

// POST /api/admin/availability/overrides
// Add a date override for a schedule
router.post("/overrides", async (req: Request, res: Response) => {
  const parse = overrideSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });

  const { date, isBlocked, startTime, endTime, scheduleId } = parse.data;

  if (!isBlocked && (!startTime || !endTime)) {
    return res.status(400).json({ error: "startTime and endTime required when not blocked" });
  }

  // Parse date — use noon UTC to avoid timezone-shifting it to the wrong day
  const dateObj = new Date(`${date}T12:00:00.000Z`);

  const override = await prisma.availability.create({
    data: {
      days: [],           // empty days = this is a date override
      startTime: isBlocked ? parseTime("00:00") : parseTime(startTime!),
      endTime: isBlocked ? parseTime("00:00") : parseTime(endTime!),
      date: dateObj,
      isBlocked,
      scheduleId,
    },
  });

  return res.status(201).json(override);
});

// DELETE /api/admin/availability/overrides/:id
router.delete("/overrides/:id", async (req: Request, res: Response) => {
  const existing = await prisma.availability.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Override not found" });

  await prisma.availability.delete({ where: { id: req.params.id } });
  return res.status(204).send();
});

export default router;
