/**
 * Slot Calculator
 *
 * Given an event type (with its linked schedule + availability rows) and a
 * requested date (YYYY-MM-DD) in a viewer's IANA timezone, this module returns
 * an array of ISO datetime strings (UTC) representing available slot start times.
 *
 * Algorithm:
 *  1. Look for a date override in availability rows (date field set + matches requested date).
 *     a. If found and isBlocked → return [] (whole day blocked).
 *     b. If found with custom hours → use those hours to build slots.
 *  2. No override → find the recurring rule whose `days[]` includes the day-of-week
 *     of the requested date (computed in the viewer's timezone).
 *     If no rule matches → return [] (not a working day).
 *  3. buildSlots: generate slots from window start to window end, stepping by
 *     `eventType.length` minutes. Times are converted from the schedule timezone
 *     to UTC using the Intl API (handles DST correctly, no external lib needed).
 *
 * Note: existing-booking filtering (to remove already-taken slots) is done in
 * the route handler after this function returns, because it requires a DB query.
 */

export interface AvailabilityRow {
  days: number[];       // 0=Sun…6=Sat; empty array = this is a date override
  startTime: Date;      // Only the time portion matters (@db.Time stored as epoch+time)
  endTime: Date;
  date: Date | null;    // Set for date overrides
  isBlocked: boolean;
}

export interface SlotEventType {
  length: number;       // duration in minutes
  schedule: {
    timezone: string;   // IANA tz, e.g. "Asia/Kolkata"
    availability: AvailabilityRow[];
  } | null;
}

/**
 * Main entry point.
 * Returns UTC ISO datetime strings for each open slot on `date`.
 */
export function calculateSlots(opts: {
  eventType: SlotEventType;
  date: string;     // YYYY-MM-DD
  timezone: string; // viewer's IANA timezone (used to resolve day-of-week)
}): string[] {
  const { eventType, date, timezone } = opts;
  const schedule = eventType.schedule;

  if (!schedule) return [];

  const { availability } = schedule;

  // Step 1: check for a date override
  // The date column is stored as noon UTC to avoid day-boundary shifts, so we
  // compare the YYYY-MM-DD slice of the stored ISO string to the requested date.
  const override = availability.find(
    (a) => a.date !== null && a.date.toISOString().slice(0, 10) === date
  );

  if (override) {
    if (override.isBlocked) return [];
    return buildSlots(date, override.startTime, override.endTime, eventType.length, schedule.timezone);
  }

  // Step 2: find the recurring rule for this day-of-week
  const dayOfWeek = getDayOfWeekInTimezone(date, timezone);

  const recurring = availability.find(
    (a) => a.date === null && a.days.includes(dayOfWeek)
  );

  if (!recurring) return [];

  // Step 3: build slots using the schedule's own timezone
  return buildSlots(date, recurring.startTime, recurring.endTime, eventType.length, schedule.timezone);
}

/**
 * Build an array of ISO UTC datetime strings from the availability window.
 *
 * @param date           YYYY-MM-DD string
 * @param startTimeRow   Date object with only UTC hours/minutes set (from @db.Time)
 * @param endTimeRow     Same
 * @param durationMins   Event type length in minutes
 * @param scheduleTimezone  IANA tz for the schedule owner
 */
export function buildSlots(
  date: string,
  startTimeRow: Date,
  endTimeRow: Date,
  durationMins: number,
  scheduleTimezone: string
): string[] {
  const slots: string[] = [];

  // Extract HH:MM from the @db.Time value (stored as UTC epoch + time offset)
  const startH = startTimeRow.getUTCHours();
  const startM = startTimeRow.getUTCMinutes();
  const endH = endTimeRow.getUTCHours();
  const endM = endTimeRow.getUTCMinutes();

  // Convert "date at HH:MM in scheduleTimezone" → UTC Date
  const windowStart = localToUtc(`${date}T${pad(startH)}:${pad(startM)}:00`, scheduleTimezone);
  const windowEnd   = localToUtc(`${date}T${pad(endH)}:${pad(endM)}:00`, scheduleTimezone);

  if (!windowStart || !windowEnd) return [];

  const step = durationMins * 60 * 1000;
  let current = windowStart.getTime();

  // A slot is valid only if its entire duration fits within the window
  while (current + step <= windowEnd.getTime()) {
    slots.push(new Date(current).toISOString());
    current += step;
  }

  return slots;
}

/**
 * Convert a "naive" local datetime string (no tz suffix) expressed in `timezone`
 * into an actual UTC Date.
 *
 * Strategy: we use Intl.DateTimeFormat to find what local clock the naive UTC
 * instant corresponds to, compute the offset, then correct for it.
 * This handles DST transitions correctly without any external library.
 *
 * Returns null if the conversion fails (bad tz, etc.).
 */
export function localToUtc(localDatetime: string, timezone: string): Date | null {
  try {
    // Treat the string as UTC initially (just to get a numeric epoch to feed Intl)
    const naiveUtc = new Date(localDatetime + "Z");

    // Ask Intl what "local time" that UTC instant corresponds to in `timezone`
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(naiveUtc);
    const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0");

    const localYear  = get("year");
    const localMonth = get("month") - 1; // 0-indexed
    const localDay   = get("day");
    const localHour  = get("hour") % 24; // hour12:false can return 24 for midnight
    const localMin   = get("minute");
    const localSec   = get("second");

    // offset = naiveUtc_ms - Date.UTC(localParts)
    // i.e. how many ms ahead UTC is compared to the local time readout
    const offsetMs = naiveUtc.getTime() - Date.UTC(localYear, localMonth, localDay, localHour, localMin, localSec);

    // The caller wants the UTC time for `localDatetime` expressed in `timezone`,
    // so we add the offset back to the naive UTC epoch
    return new Date(naiveUtc.getTime() + offsetMs);
  } catch {
    return null;
  }
}

/**
 * Return the day-of-week (0=Sun … 6=Sat) for a YYYY-MM-DD date as seen
 * in `timezone`. We use noon UTC to avoid any date-line ambiguity.
 */
export function getDayOfWeekInTimezone(date: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).formatToParts(new Date(`${date}T12:00:00Z`));

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? 0;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
