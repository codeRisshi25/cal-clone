"use client";

import { useState, useEffect } from "react";
import { Calendar, Clock, User, X, RefreshCcw } from "lucide-react";
import Link from "next/link";
import type { Booking } from "@cal-clone/types";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

// Format "Jan 12, 2026 · 2:30 PM – 3:00 PM" from ISO strings
function formatBookingTime(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const date = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const startStr = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const endStr = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${startStr} – ${endStr}`;
}

function StatusBadge({ status }: { status: Booking["status"] }) {
  const map: Record<Booking["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    ACCEPTED: { label: "Accepted", variant: "default" },
    PENDING: { label: "Pending", variant: "secondary" },
    CANCELLED: { label: "Cancelled", variant: "destructive" },
    RESCHEDULED: { label: "Rescheduled", variant: "outline" },
  };
  const { label, variant } = map[status] ?? map.PENDING;
  return <Badge variant={variant}>{label}</Badge>;
}

// A single booking row
function BookingRow({
  booking,
  onCancel,
}: {
  booking: Booking;
  onCancel: (booking: Booking) => void;
}) {
  const canCancel = booking.status === "ACCEPTED" || booking.status === "PENDING";

  return (
    <div className="flex items-start justify-between gap-4 bg-white border rounded-lg px-5 py-4 hover:border-gray-200 transition-colors">
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Title + status */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-gray-900 text-sm">{booking.title}</p>
          <StatusBadge status={booking.status} />
        </div>

        {/* Attendee */}
        {booking.attendee && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <User className="w-3 h-3" />
            <span>{booking.attendee.name}</span>
            <span className="text-gray-300">·</span>
            <span>{booking.attendee.email}</span>
          </div>
        )}

        {/* Time */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>{formatBookingTime(booking.startTime, booking.endTime)}</span>
        </div>

        {/* Event type */}
        {booking.eventType && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Calendar className="w-3 h-3" />
            <span>{booking.eventType.title}</span>
            <span className="text-gray-200">·</span>
            <span>{booking.eventType.length} min</span>
          </div>
        )}

        {/* Cancellation note */}
        {booking.cancellationNote && (
          <p className="text-xs text-gray-400 italic mt-1">
            Reason: {booking.cancellationNote}
          </p>
        )}
      </div>

      {/* Actions */}
      {canCancel && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Reschedule — links to public reschedule page (M4) */}
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href={`/reschedule/${booking.uid}`}>
              <RefreshCcw className="w-3.5 h-3.5" />
              Reschedule
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
            onClick={() => onCancel(booking)}
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export default function BookingsPage() {
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [past, setPast] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cancel dialog state
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    loadBookings();
  }, []);

  async function loadBookings() {
    try {
      setLoading(true);
      const [up, past] = await Promise.all([
        api.getUpcomingBookings(),
        api.getPastBookings(),
      ]);
      setUpcoming(up);
      setPast(past);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await api.cancelBooking(cancelTarget.uid, { reason: cancelReason || undefined });
      // Move from upcoming to past with CANCELLED status
      setUpcoming((prev) => prev.filter((b) => b.uid !== cancelTarget.uid));
      await loadBookings(); // refresh both lists
      setCancelTarget(null);
      setCancelReason("");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-500">{error}</p>
        <Button className="mt-4" onClick={loadBookings}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your upcoming and past bookings.
        </p>
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList className="mb-6">
          <TabsTrigger value="upcoming">
            Upcoming{upcoming.length > 0 && (
              <span className="ml-1.5 bg-gray-200 text-gray-700 rounded-full text-xs px-1.5 py-0.5">
                {upcoming.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          {upcoming.length === 0 ? (
            <div className="text-center py-16 border rounded-lg bg-white">
              <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No upcoming bookings.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((b) => (
                <BookingRow key={b.uid} booking={b} onCancel={setCancelTarget} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past">
          {past.length === 0 ? (
            <div className="text-center py-16 border rounded-lg bg-white">
              <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No past bookings.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {past.map((b) => (
                <BookingRow key={b.uid} booking={b} onCancel={setCancelTarget} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Cancel confirmation dialog */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel booking</DialogTitle>
            <DialogDescription>
              Cancel &ldquo;{cancelTarget?.title}&rdquo;? This will notify the attendee via email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Textarea
              id="cancel-reason"
              placeholder="Let the attendee know why you're cancelling…"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelTarget(null);
                setCancelReason("");
              }}
            >
              Keep booking
            </Button>
            <Button
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? "Cancelling…" : "Confirm cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
