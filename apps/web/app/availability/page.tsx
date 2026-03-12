"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Save } from "lucide-react";
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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Common IANA timezones to show in the selector
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

// Per-day working hours state
type DayRow = {
  day: number;       // 0 = Sun … 6 = Sat
  enabled: boolean;
  startTime: string; // HH:MM
  endTime: string;
};

function buildDayRows(availability: Availability[]): DayRow[] {
  // Filter to only recurring rules (no date override — date is null)
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

export default function AvailabilityPage() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dayRows, setDayRows] = useState<DayRow[]>([]);
  const [timezone, setTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Date override modal state
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideForm, setOverrideForm] = useState<DateOverrideBody>({
    date: "",
    isBlocked: true,
    startTime: "09:00",
    endTime: "17:00",
  });
  const [savingOverride, setSavingOverride] = useState(false);

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

  function updateDayTime(day: number, field: "startTime" | "endTime", value: string) {
    setDayRows((rows) =>
      rows.map((r) => (r.day === day ? { ...r, [field]: value } : r))
    );
  }

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
      setOverrideForm({ date: "", isBlocked: true, startTime: "09:00", endTime: "17:00" });
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

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !schedule) {
    return (
      <div className="p-8">
        <p className="text-red-500">{error || "No schedule found"}</p>
        <Button className="mt-4" onClick={loadSchedules}>Retry</Button>
      </div>
    );
  }

  const overrides = buildDateOverrides(schedule.availability);

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Availability</h1>
        <p className="text-sm text-gray-500 mt-1">
          Set when you&apos;re available for bookings.
        </p>
      </div>

      {/* Timezone selector */}
      <div className="bg-white border rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Timezone</p>
            <p className="text-xs text-gray-400 mt-0.5">All times below are in this timezone</p>
          </div>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Working hours */}
      <div className="bg-white border rounded-lg p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Working hours</h2>
        <div className="space-y-3">
          {dayRows.map((row) => (
            <div key={row.day} className="flex items-center gap-4">
              {/* Day toggle */}
              <div className="flex items-center gap-2 w-20 flex-shrink-0">
                <Switch
                  id={`day-${row.day}`}
                  checked={row.enabled}
                  onCheckedChange={() => toggleDay(row.day)}
                />
                <Label
                  htmlFor={`day-${row.day}`}
                  className={row.enabled ? "text-gray-900" : "text-gray-400"}
                >
                  {DAY_NAMES[row.day]}
                </Label>
              </div>

              {/* Time range — only visible when enabled */}
              {row.enabled ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="time"
                    value={row.startTime}
                    onChange={(e) => updateDayTime(row.day, "startTime", e.target.value)}
                    className="w-32"
                  />
                  <span className="text-gray-400 text-sm">–</span>
                  <Input
                    type="time"
                    value={row.endTime}
                    onChange={(e) => updateDayTime(row.day, "endTime", e.target.value)}
                    className="w-32"
                  />
                </div>
              ) : (
                <span className="text-sm text-gray-400">Unavailable</span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={handleSaveWorkingHours} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : saved ? "Saved!" : "Save"}
          </Button>
        </div>
      </div>

      {/* Date overrides */}
      <div className="bg-white border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Date overrides</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Block specific dates or set different hours
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOverrideOpen(true)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Add override
          </Button>
        </div>

        {overrides.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No date overrides yet.
          </p>
        ) : (
          <div className="space-y-2">
            {overrides.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {o.date ? new Date(o.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {o.isBlocked
                      ? "Blocked — no bookings"
                      : `${o.startTime} – ${o.endTime}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-400 hover:text-red-600"
                  onClick={() => handleDeleteOverride(o.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add override modal */}
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
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label>Start</Label>
                  <Input
                    type="time"
                    value={overrideForm.startTime}
                    onChange={(e) =>
                      setOverrideForm((f) => ({ ...f, startTime: e.target.value }))
                    }
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label>End</Label>
                  <Input
                    type="time"
                    value={overrideForm.endTime}
                    onChange={(e) =>
                      setOverrideForm((f) => ({ ...f, endTime: e.target.value }))
                    }
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
              {savingOverride ? "Adding…" : "Add override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
