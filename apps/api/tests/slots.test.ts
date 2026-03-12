/**
 * Unit tests for the slot calculator (lib/slots.ts).
 *
 * These tests are pure — no database, no network, no Redis.
 * They construct in-memory availability rows and assert on the output.
 *
 * Coverage:
 *  - getDayOfWeekInTimezone: correct weekday for various IANA timezones
 *  - localToUtc: correct UTC conversion across timezones (including DST)
 *  - buildSlots: correct number and timing of slots
 *  - calculateSlots: recurring rules, date overrides, blocked days, no schedule
 */

import {
  calculateSlots,
  buildSlots,
  getDayOfWeekInTimezone,
  localToUtc,
  type AvailabilityRow,
  type SlotEventType,
} from "../src/lib/slots";

// Helper: create a @db.Time Date object (only UTC hours/minutes matter)
function time(h: number, m: number): Date {
  const d = new Date(0);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

// Helper: make a date override row (date stored as noon UTC for the given YYYY-MM-DD)
function dateOverride(date: string, opts: { isBlocked: boolean; startH?: number; startM?: number; endH?: number; endM?: number }): AvailabilityRow {
  return {
    days: [],
    startTime: time(opts.startH ?? 0, opts.startM ?? 0),
    endTime: time(opts.endH ?? 0, opts.endM ?? 0),
    date: new Date(`${date}T12:00:00.000Z`),
    isBlocked: opts.isBlocked,
  };
}

// Helper: make a recurring availability row
function recurring(days: number[], startH: number, startM: number, endH: number, endM: number): AvailabilityRow {
  return {
    days,
    startTime: time(startH, startM),
    endTime: time(endH, endM),
    date: null,
    isBlocked: false,
  };
}

// ── getDayOfWeekInTimezone ──────────────────────────────────────────────────

describe("getDayOfWeekInTimezone", () => {
  it("returns correct weekday for UTC", () => {
    // 2025-01-06 is a Monday
    expect(getDayOfWeekInTimezone("2025-01-06", "UTC")).toBe(1);
  });

  it("returns Sunday (0) for a known Sunday in UTC", () => {
    // 2025-01-05 is a Sunday
    expect(getDayOfWeekInTimezone("2025-01-05", "UTC")).toBe(0);
  });

  it("returns correct weekday across timezone offset (Asia/Kolkata, +5:30)", () => {
    // 2025-01-06 is Monday in IST as well
    expect(getDayOfWeekInTimezone("2025-01-06", "Asia/Kolkata")).toBe(1);
  });

  it("handles DST timezone (America/New_York) correctly", () => {
    // 2025-03-10 is a Monday
    expect(getDayOfWeekInTimezone("2025-03-10", "America/New_York")).toBe(1);
  });

  it("returns Saturday (6) correctly", () => {
    // 2025-01-04 is a Saturday
    expect(getDayOfWeekInTimezone("2025-01-04", "UTC")).toBe(6);
  });
});

// ── localToUtc ─────────────────────────────────────────────────────────────

describe("localToUtc", () => {
  it("converts IST time to UTC (IST = UTC+5:30)", () => {
    // 09:00 IST = 03:30 UTC
    const result = localToUtc("2025-01-06T09:00:00", "Asia/Kolkata");
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2025-01-06T03:30:00.000Z");
  });

  it("converts UTC+0 correctly (no offset)", () => {
    const result = localToUtc("2025-01-06T09:00:00", "UTC");
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2025-01-06T09:00:00.000Z");
  });

  it("converts EST time to UTC (EST = UTC-5)", () => {
    // 09:00 EST = 14:00 UTC
    const result = localToUtc("2025-01-06T09:00:00", "America/New_York");
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2025-01-06T14:00:00.000Z");
  });

  it("handles DST: EDT is UTC-4 (summer)", () => {
    // 09:00 EDT (summer) = 13:00 UTC
    const result = localToUtc("2025-07-01T09:00:00", "America/New_York");
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe("2025-07-01T13:00:00.000Z");
  });

  it("returns null for invalid timezone", () => {
    const result = localToUtc("2025-01-06T09:00:00", "Not/ATimezone");
    expect(result).toBeNull();
  });
});

// ── buildSlots ─────────────────────────────────────────────────────────────

describe("buildSlots", () => {
  it("generates correct slots for 30-min events in a 2-hour window (UTC)", () => {
    // 09:00–11:00 UTC, 30-min slots → [09:00, 09:30, 10:00, 10:30]
    const slots = buildSlots("2025-01-06", time(9, 0), time(11, 0), 30, "UTC");
    expect(slots).toHaveLength(4);
    expect(slots[0]).toBe("2025-01-06T09:00:00.000Z");
    expect(slots[1]).toBe("2025-01-06T09:30:00.000Z");
    expect(slots[2]).toBe("2025-01-06T10:00:00.000Z");
    expect(slots[3]).toBe("2025-01-06T10:30:00.000Z");
  });

  it("generates correct slots in IST (09:00–11:00 IST = 03:30–05:30 UTC)", () => {
    const slots = buildSlots("2025-01-06", time(9, 0), time(11, 0), 30, "Asia/Kolkata");
    expect(slots).toHaveLength(4);
    expect(slots[0]).toBe("2025-01-06T03:30:00.000Z");
    expect(slots[3]).toBe("2025-01-06T05:00:00.000Z");
  });

  it("returns empty array when window is too small for even one slot", () => {
    // 09:00–09:15 with 30-min events → 0 slots
    const slots = buildSlots("2025-01-06", time(9, 0), time(9, 15), 30, "UTC");
    expect(slots).toHaveLength(0);
  });

  it("generates exactly 1 slot when window equals duration", () => {
    // 09:00–09:30 with 30-min events → 1 slot
    const slots = buildSlots("2025-01-06", time(9, 0), time(9, 30), 30, "UTC");
    expect(slots).toHaveLength(1);
    expect(slots[0]).toBe("2025-01-06T09:00:00.000Z");
  });

  it("handles 15-min events in a 1-hour window → 4 slots", () => {
    const slots = buildSlots("2025-01-06", time(9, 0), time(10, 0), 15, "UTC");
    expect(slots).toHaveLength(4);
  });

  it("handles 60-min events in an 8-hour window → 8 slots", () => {
    const slots = buildSlots("2025-01-06", time(9, 0), time(17, 0), 60, "UTC");
    expect(slots).toHaveLength(8);
  });
});

// ── calculateSlots ─────────────────────────────────────────────────────────

describe("calculateSlots", () => {
  function makeEventType(opts: {
    length: number;
    timezone: string;
    availability: AvailabilityRow[];
  }): SlotEventType {
    return {
      length: opts.length,
      schedule: { timezone: opts.timezone, availability: opts.availability },
    };
  }

  it("returns empty array when eventType has no schedule", () => {
    const et: SlotEventType = { length: 30, schedule: null };
    expect(calculateSlots({ eventType: et, date: "2025-01-06", timezone: "UTC" })).toEqual([]);
  });

  it("returns empty array for a weekend day with Mon–Fri rule", () => {
    // 2025-01-04 is a Saturday
    const et = makeEventType({
      length: 30,
      timezone: "UTC",
      availability: [recurring([1, 2, 3, 4, 5], 9, 0, 17, 0)],
    });
    expect(calculateSlots({ eventType: et, date: "2025-01-04", timezone: "UTC" })).toHaveLength(0);
  });

  it("returns correct slots for a weekday with Mon–Fri rule (UTC, 30-min, 9–17)", () => {
    // 09:00–17:00, 30 min → 16 slots
    const et = makeEventType({
      length: 30,
      timezone: "UTC",
      availability: [recurring([1, 2, 3, 4, 5], 9, 0, 17, 0)],
    });
    // 2025-01-06 is Monday
    const slots = calculateSlots({ eventType: et, date: "2025-01-06", timezone: "UTC" });
    expect(slots).toHaveLength(16);
    expect(slots[0]).toBe("2025-01-06T09:00:00.000Z");
    expect(slots[15]).toBe("2025-01-06T16:30:00.000Z");
  });

  it("uses schedule timezone (IST) to build slots, not viewer timezone", () => {
    // Schedule in IST (UTC+5:30): 09:00–17:00 IST = 03:30–11:30 UTC → 16 slots
    const et = makeEventType({
      length: 30,
      timezone: "Asia/Kolkata",
      availability: [recurring([1, 2, 3, 4, 5], 9, 0, 17, 0)],
    });
    const slots = calculateSlots({ eventType: et, date: "2025-01-06", timezone: "UTC" });
    expect(slots).toHaveLength(16);
    expect(slots[0]).toBe("2025-01-06T03:30:00.000Z");
  });

  it("blocked date override returns no slots even on a normally-available day", () => {
    const et = makeEventType({
      length: 30,
      timezone: "UTC",
      availability: [
        recurring([1, 2, 3, 4, 5], 9, 0, 17, 0),
        dateOverride("2025-01-06", { isBlocked: true }),
      ],
    });
    expect(calculateSlots({ eventType: et, date: "2025-01-06", timezone: "UTC" })).toHaveLength(0);
  });

  it("date override with custom hours overrides the recurring rule", () => {
    // Normal Mon rule: 09:00–17:00 (16 × 30-min slots)
    // Override on 2025-01-06: 14:00–16:00 (4 slots)
    const et = makeEventType({
      length: 30,
      timezone: "UTC",
      availability: [
        recurring([1, 2, 3, 4, 5], 9, 0, 17, 0),
        dateOverride("2025-01-06", { isBlocked: false, startH: 14, startM: 0, endH: 16, endM: 0 }),
      ],
    });
    const slots = calculateSlots({ eventType: et, date: "2025-01-06", timezone: "UTC" });
    expect(slots).toHaveLength(4);
    expect(slots[0]).toBe("2025-01-06T14:00:00.000Z");
    expect(slots[3]).toBe("2025-01-06T15:30:00.000Z");
  });

  it("date override adds availability on a normally-unavailable day", () => {
    // No recurring rule covers Saturday; override on 2025-01-04 gives 09:00–11:00 (4 slots)
    const et = makeEventType({
      length: 30,
      timezone: "UTC",
      availability: [
        recurring([1, 2, 3, 4, 5], 9, 0, 17, 0),
        dateOverride("2025-01-04", { isBlocked: false, startH: 9, startM: 0, endH: 11, endM: 0 }),
      ],
    });
    // 2025-01-04 is Saturday
    expect(calculateSlots({ eventType: et, date: "2025-01-04", timezone: "UTC" })).toHaveLength(4);
  });

  it("slot times are identical regardless of viewer timezone (schedule tz is authoritative)", () => {
    const et = makeEventType({
      length: 60,
      timezone: "Asia/Kolkata",
      availability: [recurring([1, 2, 3, 4, 5], 9, 0, 17, 0)],
    });
    const fromNY  = calculateSlots({ eventType: et, date: "2025-01-06", timezone: "America/New_York" });
    const fromUTC = calculateSlots({ eventType: et, date: "2025-01-06", timezone: "UTC" });
    expect(fromNY).toEqual(fromUTC);
  });

  it("handles viewer in a far-western timezone where day-of-week resolution still correct", () => {
    // 2025-01-06 is Monday everywhere; Mon-only rule at 09:00–10:00 UTC → 2 slots (30-min)
    const et = makeEventType({
      length: 30,
      timezone: "UTC",
      availability: [recurring([1], 9, 0, 10, 0)],
    });
    const slots = calculateSlots({ eventType: et, date: "2025-01-06", timezone: "America/New_York" });
    expect(slots).toHaveLength(2);
  });
});
