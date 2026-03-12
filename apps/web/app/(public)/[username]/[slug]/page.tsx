"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DayPicker } from "react-day-picker";
import { format, addMonths, isBefore, startOfDay } from "date-fns";
import { ArrowLeft, Clock, Globe, ChevronLeft } from "lucide-react";
import type { EventType, User } from "@cal-clone/types";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// 3 visual steps: pick date → pick time → fill form
type Step = "calendar" | "time" | "form";

export default function BookingPage() {
  const { username, slug } = useParams<{ username: string; slug: string }>();
  const router = useRouter();

  // Data from API
  const [eventType, setEventType] = useState<EventType | null>(null);
  const [hostUser, setHostUser] = useState<Pick<User, "username" | "name" | "timezone"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Booking flow state
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("calendar");

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Viewer timezone — detect from browser
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  // Load event type info on mount
  useEffect(() => {
    async function load() {
      try {
        const data = await api.getEventTypeBySlug(username, slug);
        setEventType(data.eventType);
        setHostUser(data.user);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Event type not found");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [username, slug]);

  // Load slots when a date is selected
  useEffect(() => {
    if (!selectedDate) return;
    async function loadSlots() {
      setSlotsLoading(true);
      setSlots([]);
      setSelectedSlot(null);
      try {
        const dateStr = format(selectedDate!, "yyyy-MM-dd");
        const data = await api.getSlots(username, slug, dateStr, timezone);
        setSlots(data);
      } catch {
        setSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    }
    loadSlots();
  }, [selectedDate, username, slug, timezone]);

  function handleDateSelect(date: Date | undefined) {
    setSelectedDate(date);
    setSelectedSlot(null);
    setStep("calendar");
    // Slots will auto-load via useEffect
  }

  function handleSlotSelect(slot: string) {
    setSelectedSlot(slot);
    setStep("form");
  }

  function handleBack() {
    if (step === "form") {
      setStep("time");
      setSelectedSlot(null);
    } else if (step === "time") {
      setStep("calendar");
      setSelectedDate(undefined);
      setSlots([]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !formName || !formEmail) return;
    setSubmitting(true);
    try {
      const booking = await api.createBooking(username, slug, {
        name: formName,
        email: formEmail,
        startTime: selectedSlot,
        timezone,
        notes: formNotes || undefined,
      });
      // Redirect to confirmation page
      router.push(`/booking/${booking.uid}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Booking failed");
      setSubmitting(false);
    }
  }

  // Format a UTC ISO string into the viewer's local time like "9:00 AM"
  function formatSlotTime(isoStr: string): string {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Calendar constraints — disable past dates, limit to 2 months ahead
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

  if (error || !eventType || !hostUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-cal-text-emphasis">404</h1>
          <p className="text-sm text-cal-text-subtle mt-1">{error || "Event type not found"}</p>
          <Link href={`/${username}`} className="text-sm text-cal-brand underline mt-4 inline-block">
            Back to profile
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-center min-h-screen px-4 py-8 sm:py-16">
      <div className="w-full max-w-4xl bg-cal-bg border border-cal-border-subtle rounded-md overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* ── Left column: event info + calendar ────────────────── */}
          <div className="md:w-[280px] lg:w-[300px] border-b md:border-b-0 md:border-r border-cal-border-subtle p-6">
            {/* Back to profile link */}
            <Link
              href={`/${username}`}
              className="inline-flex items-center gap-1 text-xs text-cal-text-muted hover:text-cal-text-subtle mb-4"
            >
              <ArrowLeft className="w-3 h-3" />
              {hostUser.name}
            </Link>

            {/* Event title with color accent */}
            <div className="flex items-start gap-2 mb-1">
              <div
                className="w-1 h-5 rounded-full flex-shrink-0 mt-0.5"
                style={{ backgroundColor: eventType.color }}
              />
              <h1 className="text-lg font-bold text-cal-text-emphasis leading-tight">
                {eventType.title}
              </h1>
            </div>

            {/* Duration + timezone */}
            <div className="flex flex-col gap-1 mt-3 text-xs text-cal-text-subtle">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{eventType.length} min</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                <span>{timezone.replace(/_/g, " ")}</span>
              </div>
            </div>

            {eventType.description && (
              <p className="text-xs text-cal-text-muted mt-3 leading-relaxed">
                {eventType.description}
              </p>
            )}

            {/* Selected date/time summary (when form is showing) */}
            {selectedSlot && (
              <div className="mt-4 p-3 bg-cal-bg-subtle rounded-md">
                <p className="text-xs font-medium text-cal-text-emphasis">
                  {format(new Date(selectedSlot), "EEEE, MMMM d, yyyy")}
                </p>
                <p className="text-xs text-cal-text-subtle mt-0.5">
                  {formatSlotTime(selectedSlot)}
                </p>
              </div>
            )}
          </div>

          {/* ── Right column: calendar / slots / form ─────────────── */}
          <div className="flex-1 p-6">
            {/* Step: Calendar + Time Slots (shown together on desktop) */}
            {(step === "calendar" || step === "time") && (
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Calendar */}
                <div className="flex-shrink-0">
                  <h2 className="text-sm font-medium text-cal-text-emphasis mb-3">
                    Select a Date
                  </h2>
                  <DayPicker
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    disabled={(date) => isBefore(date, today) || date > maxDate}
                    fromDate={today}
                    toDate={maxDate}
                    className="cal-day-picker"
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

                {/* Time slots (shown when a date is selected) */}
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
                            onClick={() => handleSlotSelect(slot)}
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
                  </div>
                )}
              </div>
            )}

            {/* Step: Booking Form */}
            {step === "form" && selectedSlot && (
              <div className="max-w-sm">
                <button
                  onClick={handleBack}
                  className="inline-flex items-center gap-1 text-xs text-cal-text-muted hover:text-cal-text-subtle mb-4"
                >
                  <ChevronLeft className="w-3 h-3" />
                  Back
                </button>

                <h2 className="text-sm font-medium text-cal-text-emphasis mb-4">
                  Enter your details
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="book-name">Your name *</Label>
                    <Input
                      id="book-name"
                      required
                      placeholder="John Doe"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="book-email">Email address *</Label>
                    <Input
                      id="book-email"
                      type="email"
                      required
                      placeholder="john@example.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="book-notes">Additional notes</Label>
                    <Textarea
                      id="book-notes"
                      placeholder="Anything you'd like to share beforehand..."
                      rows={3}
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                    />
                  </div>

                  <Button type="submit" disabled={submitting} className="w-full">
                    {submitting ? "Booking..." : "Confirm Booking"}
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
