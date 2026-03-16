"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Calendar, Clock, User, Globe, XCircle } from "lucide-react";
import type { Booking } from "@cal-clone/types";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function BookingConfirmationPage() {
  const { uid } = useParams<{ uid: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getBookingByUid(uid);
        setBooking(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Booking not found");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [uid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse w-full max-w-md mx-auto px-4">
          <div className="h-48 bg-cal-bg-emphasis rounded-md" />
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-cal-text-emphasis">Booking not found</h1>
          <p className="text-sm text-cal-text-subtle mt-1">{error || "Invalid booking link"}</p>
        </div>
      </div>
    );
  }

  const isCancelled = booking.status === "CANCELLED";
  const isRescheduled = booking.status === "RESCHEDULED";
  const start = new Date(booking.startTime);
  const end = new Date(booking.endTime);

  const dateStr = start.toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = `${start.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })} – ${end.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}`;

  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-md bg-cal-bg border border-cal-border-subtle rounded-md p-8 text-center">
        {/* Status icon */}
        {isCancelled || isRescheduled ? (
          <XCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
        ) : (
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-emerald-500" />
        )}

        {/* Status heading */}
        <h1 className="text-xl font-bold text-cal-text-emphasis mb-1">
          {isCancelled
            ? "Booking Cancelled"
            : isRescheduled
            ? "Booking Rescheduled"
            : "Booking Confirmed!"}
        </h1>
        <p className="text-sm text-cal-text-subtle mb-6">
          {isCancelled
            ? "This booking has been cancelled."
            : isRescheduled
            ? "This booking was rescheduled to a new time."
            : "You're all set. A confirmation email has been sent."}
        </p>

        {/* Booking details */}
        <div className="text-left space-y-3 bg-cal-bg-muted rounded-md p-4 mb-6">
          {/* Event title */}
          <div className="flex items-center gap-2.5">
            <Calendar className="w-4 h-4 text-cal-text-muted flex-shrink-0" />
            <span className="text-sm font-medium text-cal-text-emphasis">
              {booking.eventType?.title || booking.title}
            </span>
          </div>

          {/* Date */}
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-cal-text-muted flex-shrink-0" />
            <div>
              <p className="text-sm text-cal-text">{dateStr}</p>
              <p className="text-xs text-cal-text-subtle">{timeStr}</p>
            </div>
          </div>

          {/* Attendee */}
          {booking.attendee && (
            <div className="flex items-center gap-2.5">
              <User className="w-4 h-4 text-cal-text-muted flex-shrink-0" />
              <div>
                <p className="text-sm text-cal-text">{booking.attendee.name}</p>
                <p className="text-xs text-cal-text-subtle">{booking.attendee.email}</p>
              </div>
            </div>
          )}

          {/* Timezone */}
          <div className="flex items-center gap-2.5">
            <Globe className="w-4 h-4 text-cal-text-muted flex-shrink-0" />
            <span className="text-xs text-cal-text-subtle">{timezone.replace(/_/g, " ")}</span>
          </div>
        </div>

        {/* Action buttons (only for active bookings) */}
        {!isCancelled && !isRescheduled && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="flex-1" asChild>
              <Link href={`/reschedule/${booking.uid}`}>Reschedule</Link>
            </Button>
            <Button variant="outline" className="flex-1 text-destructive hover:text-destructive" asChild>
              <Link href={`/booking/${booking.uid}/cancel`}>Cancel Booking</Link>
            </Button>
          </div>
        )}

        {/* Cancellation note */}
        {isCancelled && booking.cancellationNote && (
          <div className="mt-4 p-3 bg-destructive/10 rounded-md text-left">
            <p className="text-xs text-cal-text-subtle">
              <strong>Reason:</strong> {booking.cancellationNote}
            </p>
          </div>
        )}

        {/* Rescheduled note — link to new booking if available */}
        {isRescheduled && booking.rescheduledFrom && (
          <p className="text-xs text-cal-text-muted mt-4">
            This booking was rescheduled.
          </p>
        )}
      </div>
    </div>
  );
}
