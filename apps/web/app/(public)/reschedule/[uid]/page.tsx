"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DayPicker } from "react-day-picker";
import { format, addMonths, isBefore, startOfDay } from "date-fns";
import { ArrowLeft, Clock, Globe, RefreshCw } from "lucide-react";
import type { Booking, User, EventType } from "@cal-clone/types";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";

// Extended booking type — the API returns user + eventType included
type BookingWithDetails = Booking & {
  user: User;
  eventType: EventType;
};

export default function ReschedulePage() {
  const { uid } = useParams<{ uid: string }>();
  const router = useRouter();

  const [booking, setBooking] = useState<BookingWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calendar + slot state
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  // Load the existing booking
  useEffect(() => {
    async function load() {
      try {
        // getBookingByUid returns the full booking with user + eventType included
        const data = await api.getBookingByUid(uid) as unknown as BookingWithDetails;
        if (data.status === "CANCELLED") {
          setError("This booking has been cancelled and cannot be rescheduled.");
          return;
        }
        setBooking(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Booking not found");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [uid]);

  // Load slots when a date is selected
  useEffect(() => {
    if (!selectedDate || !booking) return;
    async function loadSlots() {
      setSlotsLoading(true);
      setSlots([]);
      setSelectedSlot(null);
      try {
        const dateStr = format(selectedDate!, "yyyy-MM-dd");
        const data = await api.getSlots(
          booking!.user.username,
          booking!.eventType.slug,
          dateStr,
          timezone
        );
        setSlots(data);
      } catch {
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    }
    loadSlots();
  }, [selectedDate, booking, timezone]);

  async function handleReschedule() {
    if (!selectedSlot || !booking) return;
    setSubmitting(true);
    try {
      // Call the admin reschedule endpoint with the booking's database ID
      const newBooking = await api.rescheduleBooking(booking.id, {
        newStartTime: selectedSlot,
      });
      // Redirect to the new booking's confirmation page
      router.push(`/booking/${newBooking.uid}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Reschedule failed");
      setSubmitting(false);
    }
  }

  function formatSlotTime(isoStr: string): string {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  const today = startOfDay(new Date());
  const maxDate = addMonths(today, 2);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse w-full max-w-3xl mx-auto px-4">
          <div className="h-64 bg-cal-bg-emphasis rounded-md" />
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-cal-text-emphasis">Cannot reschedule</h1>
          <p className="text-sm text-cal-text-subtle mt-1">{error || "Booking not found"}</p>
          <Link href={`/booking/${uid}`} className="text-sm text-cal-brand underline mt-4 inline-block">
            Back to booking
          </Link>
        </div>
      </div>
    );
  }

  // Format current booking time for display
  const currentStart = new Date(booking.startTime);
  const currentDateStr = currentStart.toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const currentTimeStr = currentStart.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className="flex items-start justify-center min-h-screen px-4 py-8 sm:py-16">
      <div className="w-full max-w-4xl bg-cal-bg border border-cal-border-subtle rounded-md overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* ── Left column: event info ──────────────────────────── */}
          <div className="md:w-[280px] lg:w-[300px] border-b md:border-b-0 md:border-r border-cal-border-subtle p-6">
            <Link
              href={`/booking/${uid}`}
              className="inline-flex items-center gap-1 text-xs text-cal-text-muted hover:text-cal-text-subtle mb-4"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to booking
            </Link>

            {/* Reschedule badge */}
            <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 rounded px-2 py-1 text-xs font-medium mb-3">
              <RefreshCw className="w-3 h-3" />
              Reschedule
            </div>

            <div className="flex items-start gap-2 mb-1">
              <div
                className="w-1 h-5 rounded-full flex-shrink-0 mt-0.5"
                style={{ backgroundColor: booking.eventType.color }}
              />
              <h1 className="text-lg font-bold text-cal-text-emphasis leading-tight">
                {booking.eventType.title}
              </h1>
            </div>

            <div className="flex flex-col gap-1 mt-3 text-xs text-cal-text-subtle">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{booking.eventType.length} min</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                <span>{timezone.replace(/_/g, " ")}</span>
              </div>
            </div>

            {/* Current booking info */}
            <div className="mt-4 p-3 bg-cal-bg-subtle rounded-md">
              <p className="text-xs text-cal-text-muted mb-1">Current time:</p>
              <p className="text-xs font-medium text-cal-text-emphasis line-through">
                {currentDateStr} at {currentTimeStr}
              </p>
            </div>

            {/* New selected time */}
            {selectedSlot && (
              <div className="mt-2 p-3 bg-emerald-50 rounded-md">
                <p className="text-xs text-emerald-700 mb-1">New time:</p>
                <p className="text-xs font-medium text-emerald-800">
                  {format(new Date(selectedSlot), "EEE, MMM d")} at {formatSlotTime(selectedSlot)}
                </p>
              </div>
            )}
          </div>

          {/* ── Right column: calendar + slots ────────────────────── */}
          <div className="flex-1 p-6">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Calendar */}
              <div className="flex-shrink-0">
                <h2 className="text-sm font-medium text-cal-text-emphasis mb-3">
                  Select a new date
                </h2>
                <DayPicker
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setSelectedSlot(null);
                  }}
                  disabled={(date) => isBefore(date, today) || date > maxDate}
                  fromDate={today}
                  toDate={maxDate}
                  classNames={{
                    months: "flex flex-col",
                    month: "space-y-3",
                    caption: "flex justify-center relative items-center h-10",
                    caption_label: "text-sm font-medium text-cal-text-emphasis",
                    nav: "flex items-center gap-1",
                    nav_button: "h-7 w-7 bg-transparent hover:bg-cal-bg-subtle rounded-md flex items-center justify-center text-cal-text-subtle hover:text-cal-text-emphasis transition-colors",
                    nav_button_previous: "absolute left-1",
                    nav_button_next: "absolute right-1",
                    table: "w-full border-collapse",
                    head_row: "flex",
                    head_cell: "text-cal-text-muted w-9 font-normal text-xs text-center",
                    row: "flex w-full mt-1",
                    cell: "text-center text-sm relative p-0 focus-within:relative",
                    day: "h-9 w-9 p-0 font-normal rounded-md hover:bg-cal-bg-subtle transition-colors text-cal-text",
                    day_selected: "!bg-cal-brand !text-cal-brand-text hover:!bg-cal-brand",
                    day_today: "font-semibold text-cal-text-emphasis",
                    day_outside: "text-cal-text-muted opacity-50",
                    day_disabled: "text-cal-text-muted opacity-30 cursor-not-allowed hover:bg-transparent",
                  }}
                />
              </div>

              {/* Time slots */}
              {selectedDate && (
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-medium text-cal-text-emphasis mb-3">
                    {format(selectedDate, "EEE, MMM d")}
                  </h2>

                  {slotsLoading && (
                    <div className="space-y-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-10 bg-cal-bg-subtle rounded-md animate-pulse" />
                      ))}
                    </div>
                  )}

                  {!slotsLoading && slots.length === 0 && (
                    <p className="text-sm text-cal-text-muted py-4">
                      No available times on this date.
                    </p>
                  )}

                  {!slotsLoading && slots.length > 0 && (
                    <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                      {slots.map((slot) => (
                        <button
                          key={slot}
                          onClick={() => setSelectedSlot(slot)}
                          className={`w-full text-left px-4 py-2.5 rounded-md text-sm font-medium border transition-colors ${
                            selectedSlot === slot
                              ? "bg-cal-brand text-cal-brand-text border-cal-brand"
                              : "bg-cal-bg border-cal-border-subtle text-cal-text-emphasis hover:border-cal-brand hover:bg-cal-bg-subtle"
                          }`}
                        >
                          {formatSlotTime(slot)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Confirm reschedule button */}
                  {selectedSlot && (
                    <Button
                      onClick={handleReschedule}
                      disabled={submitting}
                      className="w-full mt-4"
                    >
                      {submitting ? "Rescheduling..." : "Confirm Reschedule"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
