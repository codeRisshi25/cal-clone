"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Save, Copy, Check } from "lucide-react";
import type { Schedule, Availability, DateOverrideBody } from "@cal-clone/types";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Common IANA timezones
const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
];

// Generate time options in 15-minute increments: "00:00" through "23:45"
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_OPTIONS.push(
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    );
  }
}

// Display "9:00 AM" from "09:00"
function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Per-day working hours state
type DayRow = {
  day: number; // 0 = Sun … 6 = Sat
  enabled: boolean;
  startTime: string; // HH:MM
  endTime: string;
};

function buildDayRows(availability: Availability[]): DayRow[] {
  const recurring = availability.filter((a) => !a.date);

  return Array.from({ length: 7 }, (_, day) => {
    const rule = recurring.find((r) => r.days.includes(day));
    return {
      day,
      enabled: !!rule,
      startTime: rule ? rule.startTime : "09:00",
      endTime: rule ? rule.endTime : "17:00",
    };
  });
}

function buildDateOverrides(availability: Availability[]): Availability[] {
  return availability.filter((a) => !!a.date);
}

// ── Time Select dropdown (Cal.com uses small styled selects, not native inputs)
function TimeSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[100px] h-9 text-xs" aria-label={label}>
        <SelectValue>{formatTime12(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {TIME_OPTIONS.map((t) => (
          <SelectItem key={t} value={t} className="text-xs">
            {formatTime12(t)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Copy-times popover (pick which days to copy to) ──────────────────

function CopyTimesDialog({
  open,
  onClose,
  sourceDay,
  dayRows,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  sourceDay: number;
  dayRows: DayRow[];
  onCopy: (targetDays: number[]) => void;
}) {
  const [targets, setTargets] = useState<number[]>([]);

  function toggle(day: number) {
    setTargets((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function selectAll() {
    setTargets(
      Array.from({ length: 7 }, (_, i) => i).filter((d) => d !== sourceDay)
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Copy {DAY_ABBR[sourceDay]} times to...
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {DAY_NAMES.map((name, i) => {
            if (i === sourceDay) return null;
            return (
              <label
                key={i}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={targets.includes(i)}
                  onChange={() => toggle(i)}
                  className="rounded border-cal-border-subtle"
                />
                {name}
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs">
            Select all
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={targets.length === 0}
              onClick={() => {
                onCopy(targets);
                onClose();
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dayRows, setDayRows] = useState<DayRow[]>([]);
  const [timezone, setTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Date override modal
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideForm, setOverrideForm] = useState<DateOverrideBody>({
    date: "",
    isBlocked: true,
    startTime: "09:00",
    endTime: "17:00",
  });
  const [savingOverride, setSavingOverride] = useState(false);

  // Copy-times dialog
  const [copySource, setCopySource] = useState<number | null>(null);

  useEffect(() => {
    loadSchedules();
  }, []);

  async function loadSchedules() {
    try {
      setLoading(true);
      const schedules = await api.getSchedules();
      const s = schedules[0] ?? null;
      if (s) {
        setSchedule(s);
        setDayRows(buildDayRows(s.availability));
        setTimezone(s.timezone);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load availability");
    } finally {
      setLoading(false);
    }
  }

  function toggleDay(day: number) {
    setDayRows((rows) =>
      rows.map((r) => (r.day === day ? { ...r, enabled: !r.enabled } : r))
    );
  }

  function updateDayTime(
    day: number,
    field: "startTime" | "endTime",
    value: string
  ) {
    setDayRows((rows) =>
      rows.map((r) => (r.day === day ? { ...r, [field]: value } : r))
    );
  }

  // Copy one day's times to selected target days
  const handleCopyTimes = useCallback(
    (targetDays: number[]) => {
      if (copySource === null) return;
      const source = dayRows[copySource];
      setDayRows((rows) =>
        rows.map((r) =>
          targetDays.includes(r.day)
            ? { ...r, enabled: true, startTime: source.startTime, endTime: source.endTime }
            : r
        )
      );
    },
    [copySource, dayRows]
  );

  async function handleSaveWorkingHours() {
    if (!schedule) return;
    setSaving(true);
    setSaved(false);
    try {
      const enabledRows = dayRows.filter((r) => r.enabled);
      await api.updateAvailability({
        scheduleId: schedule.id,
        timezone,
        availability: enabledRows.map((r) => ({
          days: [r.day],
          startTime: r.startTime,
          endTime: r.endTime,
        })),
      });
      await loadSchedules();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddOverride() {
    setSavingOverride(true);
    try {
      await api.addDateOverride(overrideForm);
      await loadSchedules();
      setOverrideOpen(false);
      setOverrideForm({
        date: "",
        isBlocked: true,
        startTime: "09:00",
        endTime: "17:00",
      });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to add override");
    } finally {
      setSavingOverride(false);
    }
  }

  async function handleDeleteOverride(id: string) {
    try {
      await api.deleteDateOverride(id);
      await loadSchedules();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  // ── Loading skeleton ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-3xl">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-10 bg-cal-bg-subtle rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !schedule) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-destructive text-sm">{error || "No schedule found"}</p>
        <Button className="mt-4" onClick={loadSchedules}>
          Retry
        </Button>
      </div>
    );
  }

  const overrides = buildDateOverrides(schedule.availability);

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-cal-text-emphasis">
          Availability
        </h1>
        <p className="text-sm text-cal-text-subtle mt-0.5">
          Configure times when you are available for bookings.
        </p>
      </div>

      {/* ── Schedule card ────────────────────────────────────── */}
      <div className="border border-cal-border-subtle rounded-md bg-cal-bg overflow-hidden">
        {/* Timezone bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-cal-border-subtle bg-cal-bg-muted">
          <p className="text-xs font-medium text-cal-text-subtle uppercase tracking-wider">
            {schedule.name}
          </p>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz} className="text-xs">
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Day rows */}
        <div className="divide-y divide-cal-border-subtle">
          {dayRows.map((row) => (
            <div
              key={row.day}
              className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-6 px-4 sm:px-6 py-3"
            >
              {/* Day label + toggle */}
              <div className="flex items-center justify-between sm:justify-start sm:w-32 min-w-[88px]">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`day-${row.day}`}
                    checked={row.enabled}
                    onCheckedChange={() => toggleDay(row.day)}
                  />
                  <Label
                    htmlFor={`day-${row.day}`}
                    className={cn(
                      "text-sm capitalize cursor-pointer",
                      row.enabled
                        ? "text-cal-text-emphasis font-medium"
                        : "text-cal-text-muted"
                    )}
                  >
                    {DAY_ABBR[row.day]}
                  </Label>
                </div>
              </div>

              {/* Time pickers + copy button */}
              {row.enabled ? (
                <div className="flex items-center gap-2 flex-1">
                  <TimeSelect
                    value={row.startTime}
                    onChange={(v) => updateDayTime(row.day, "startTime", v)}
                    label={`${DAY_ABBR[row.day]} start time`}
                  />
                  <span className="text-cal-text-muted text-xs">-</span>
                  <TimeSelect
                    value={row.endTime}
                    onChange={(v) => updateDayTime(row.day, "endTime", v)}
                    label={`${DAY_ABBR[row.day]} end time`}
                  />

                  {/* Copy times to other days */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-cal-text-muted hover:text-cal-text-emphasis ml-1"
                    title="Copy times to other days"
                    onClick={() => setCopySource(row.day)}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <span className="text-sm text-cal-text-muted">Unavailable</span>
              )}
            </div>
          ))}
        </div>

        {/* Save bar */}
        <div className="flex justify-end px-4 sm:px-6 py-3 border-t border-cal-border-subtle bg-cal-bg-muted">
          <Button
            onClick={handleSaveWorkingHours}
            disabled={saving}
            size="sm"
            className="gap-1.5"
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Saved
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                {saving ? "Saving..." : "Save"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── Date overrides ───────────────────────────────────── */}
      <div className="border border-cal-border-subtle rounded-md bg-cal-bg overflow-hidden mt-6">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-cal-border-subtle bg-cal-bg-muted">
          <div>
            <p className="text-xs font-medium text-cal-text-subtle uppercase tracking-wider">
              Date overrides
            </p>
            <p className="text-xs text-cal-text-muted mt-0.5">
              Block specific dates or set different hours
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOverrideOpen(true)}
            className="gap-1.5 h-8 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </Button>
        </div>

        {overrides.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-cal-text-muted">No date overrides yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-cal-border-subtle">
            {overrides.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between px-4 sm:px-6 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-cal-text-emphasis">
                    {o.date
                      ? new Date(o.date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                  <p className="text-xs text-cal-text-muted mt-0.5">
                    {o.isBlocked
                      ? "Blocked — no bookings"
                      : `${formatTime12(o.startTime)} – ${formatTime12(o.endTime)}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive/60 hover:text-destructive"
                  onClick={() => handleDeleteOverride(o.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add override modal ───────────────────────────────── */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add date override</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="override-date">Date</Label>
              <Input
                id="override-date"
                type="date"
                value={overrideForm.date}
                onChange={(e) =>
                  setOverrideForm((f) => ({ ...f, date: e.target.value }))
                }
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="override-blocked"
                checked={overrideForm.isBlocked}
                onCheckedChange={(checked) =>
                  setOverrideForm((f) => ({ ...f, isBlocked: checked }))
                }
              />
              <Label htmlFor="override-blocked">Block this date entirely</Label>
            </div>

            {!overrideForm.isBlocked && (
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label>Start</Label>
                  <TimeSelect
                    value={overrideForm.startTime || "09:00"}
                    onChange={(v) =>
                      setOverrideForm((f) => ({ ...f, startTime: v }))
                    }
                    label="Override start time"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label>End</Label>
                  <TimeSelect
                    value={overrideForm.endTime || "17:00"}
                    onChange={(v) =>
                      setOverrideForm((f) => ({ ...f, endTime: v }))
                    }
                    label="Override end time"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddOverride}
              disabled={savingOverride || !overrideForm.date}
            >
              {savingOverride ? "Adding..." : "Add override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Copy times dialog ────────────────────────────────── */}
      {copySource !== null && (
        <CopyTimesDialog
          open
          onClose={() => setCopySource(null)}
          sourceDay={copySource}
          dayRows={dayRows}
          onCopy={handleCopyTimes}
        />
      )}
    </div>
  );
}
