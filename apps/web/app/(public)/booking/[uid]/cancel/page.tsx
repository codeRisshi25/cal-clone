"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Calendar, Clock } from "lucide-react";
import type { Booking } from "@cal-clone/types";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function CancelBookingPage() {
  const { uid } = useParams<{ uid: string }>();
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

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

  async function handleCancel() {
    setCancelling(true);
    try {
      await api.cancelBookingByUid(uid, { reason: reason || undefined });
      // Redirect to the confirmation page which will show cancelled status
      router.push(`/booking/${uid}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Cancellation failed");
      setCancelling(false);
    }
  }

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

  // Already cancelled
  if (booking.status === "CANCELLED") {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-md bg-cal-bg border border-cal-border-subtle rounded-md p-8 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-cal-text-muted" />
          <h1 className="text-xl font-bold text-cal-text-emphasis mb-1">Already Cancelled</h1>
          <p className="text-sm text-cal-text-subtle">This booking has already been cancelled.</p>
        </div>
      </div>
    );
  }

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
      <div className="w-full max-w-md bg-cal-bg border border-cal-border-subtle rounded-md p-8">
        <AlertTriangle className="w-10 h-10 mx-auto mb-4 text-destructive" />

        <h1 className="text-xl font-bold text-cal-text-emphasis text-center mb-1">
          Cancel Booking
        </h1>
        <p className="text-sm text-cal-text-subtle text-center mb-6">
          Are you sure you want to cancel this booking?
        </p>

        {/* Booking summary */}
        <div className="bg-cal-bg-muted rounded-md p-4 mb-6 space-y-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cal-text-muted flex-shrink-0" />
            <span className="text-sm font-medium text-cal-text-emphasis">
              {booking.eventType?.title || booking.title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cal-text-muted flex-shrink-0" />
            <div>
              <p className="text-sm text-cal-text">{dateStr}</p>
              <p className="text-xs text-cal-text-subtle">{timeStr}</p>
            </div>
          </div>
        </div>

        {/* Cancellation reason */}
        <div className="mb-6 space-y-1.5">
          <Label htmlFor="cancel-reason">Reason for cancelling (optional)</Label>
          <Textarea
            id="cancel-reason"
            placeholder="Let the host know why you're cancelling..."
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push(`/booking/${uid}`)}
          >
            Go Back
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? "Cancelling..." : "Cancel Booking"}
          </Button>
        </div>
      </div>
    </div>
  );
}
