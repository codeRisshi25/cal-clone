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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ── helpers ──────────────────────────────────────────────────────────

// "Mon, Jan 12" style short date
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// "2:30 PM – 3:00 PM"
function formatTimeRange(startIso: string, endIso: string): string {
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${fmt(new Date(startIso))} – ${fmt(new Date(endIso))}`;
}

function StatusBadge({ status }: { status: Booking["status"] }) {
  const map: Record<
    Booking["status"],
    { label: string; classes: string }
  > = {
    ACCEPTED: {
      label: "Confirmed",
      classes: "bg-emerald-900/30 text-emerald-400 border-emerald-800/50",
    },
    PENDING: {
      label: "Pending",
      classes: "bg-yellow-900/30 text-yellow-400 border-yellow-800/50",
    },
    CANCELLED: {
      label: "Cancelled",
      classes: "bg-red-900/30 text-red-400 border-red-800/50",
    },
    RESCHEDULED: {
      label: "Rescheduled",
      classes: "bg-blue-900/30 text-blue-400 border-blue-800/50",
    },
  };
  const { label, classes } = map[status] ?? map.PENDING;
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium", classes)}>
      {label}
    </Badge>
  );
}

// ── A single booking row (Cal.com layout) ────────────────────────────

function BookingRow({
  booking,
  onCancel,
  selected,
  onSelect,
}: {
  booking: Booking;
  onCancel: (booking: Booking) => void;
  selected: boolean;
  onSelect: (uid: string) => void;
}) {
  const canCancel =
    booking.status === "ACCEPTED" || booking.status === "PENDING";

  return (
    <div
      onClick={() => onSelect(booking.uid)}
      className={cn(
        "relative flex flex-col sm:flex-row gap-3 sm:gap-6 px-4 sm:px-6 py-4 transition-colors cursor-pointer",
        "hover:bg-cal-bg-muted",
        // Left accent bar on selected row
        selected &&
          "before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-cal-brand before:rounded-r"
      )}
    >
      {/* Date column — fixed width on desktop */}
      <div className="sm:min-w-[140px] sm:max-w-[140px] flex-shrink-0">
        <p className="text-sm font-medium text-cal-text-emphasis leading-6">
          {formatDate(booking.startTime)}
        </p>
        <p className="text-sm text-cal-text-subtle">
          {formatTimeRange(booking.startTime, booking.endTime)}
        </p>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-cal-text-emphasis truncate">
            {booking.title}
          </p>
          <StatusBadge status={booking.status} />
        </div>

        {booking.attendee && (
          <div className="flex items-center gap-1.5 text-xs text-cal-text-subtle">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">
              {booking.attendee.name} ({booking.attendee.email})
            </span>
          </div>
        )}

        {booking.eventType && (
          <div className="flex items-center gap-1.5 text-xs text-cal-text-muted">
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span>
              {booking.eventType.title} · {booking.eventType.length} min
            </span>
          </div>
        )}

        {booking.cancellationNote && (
          <p className="text-xs text-cal-text-muted italic">
            Reason: {booking.cancellationNote}
          </p>
        )}
      </div>

      {/* Actions */}
      {canCancel && (
        <div className="flex items-center gap-2 flex-shrink-0 sm:self-center">
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" asChild>
            <Link href={`/reschedule/${booking.uid}`}>
              <RefreshCcw className="w-3 h-3" />
              Reschedule
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onCancel(booking);
            }}
          >
            <X className="w-3 h-3" />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Tabs component (styled like Cal.com) ─────────────────────────────

type TabKey = "upcoming" | "past" | "cancelled";

const TABS: { key: TabKey; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
];

// ── Main page ────────────────────────────────────────────────────────

export default function BookingsPage() {
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [past, setPast] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("upcoming");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

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
      const [up, p] = await Promise.all([
        api.getUpcomingBookings(),
        api.getPastBookings(),
      ]);
      setUpcoming(up);
      setPast(p);
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
      await api.cancelBooking(cancelTarget.id, {
        reason: cancelReason || undefined,
      });
      await loadBookings();
      setCancelTarget(null);
      setCancelReason("");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  }

  // Derive cancelled bookings from the past list
  const cancelled = past.filter((b) => b.status === "CANCELLED");
  const pastNonCancelled = past.filter((b) => b.status !== "CANCELLED");

  const listMap: Record<TabKey, Booking[]> = {
    upcoming,
    past: pastNonCancelled,
    cancelled,
  };
  const currentList = listMap[activeTab];

  // ── Loading skeleton ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-4xl">
        <div className="animate-pulse space-y-0 border border-cal-border-subtle rounded-md overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[88px] bg-cal-bg-subtle border-b border-cal-border-subtle last:border-0"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-destructive text-sm">{error}</p>
        <Button className="mt-4" onClick={loadBookings}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      {/* ── Page header ────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-cal-text-emphasis">
          Bookings
        </h1>
        <p className="text-sm text-cal-text-subtle mt-0.5">
          See upcoming and past events booked through your event type links.
        </p>
      </div>

      {/* ── Tab bar (Cal.com style — simple underline tabs) ────── */}
      <div className="flex items-center gap-4 border-b border-cal-border-subtle mb-6">
        {TABS.map((tab) => {
          const count =
            tab.key === "upcoming"
              ? upcoming.length
              : tab.key === "past"
              ? pastNonCancelled.length
              : cancelled.length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "pb-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.key
                  ? "border-cal-brand text-cal-text-emphasis"
                  : "border-transparent text-cal-text-subtle hover:text-cal-text-emphasis hover:border-cal-border-subtle"
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 bg-cal-bg-emphasis text-cal-text-subtle rounded-full text-xs px-1.5 py-0.5">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Booking list ───────────────────────────────────────── */}
      {currentList.length === 0 ? (
        <div className="text-center py-16 border border-cal-border-subtle rounded-md bg-cal-bg">
          <Calendar className="w-10 h-10 text-cal-text-muted mx-auto mb-3" />
          <p className="text-cal-text-subtle text-sm">
            {activeTab === "upcoming"
              ? "No upcoming bookings."
              : activeTab === "past"
              ? "No past bookings."
              : "No cancelled bookings."}
          </p>
        </div>
      ) : (
        <div className="border border-cal-border-subtle rounded-md overflow-hidden bg-cal-bg divide-y divide-cal-border-subtle">
          {currentList.map((b) => (
            <BookingRow
              key={b.uid}
              booking={b}
              onCancel={setCancelTarget}
              selected={selectedUid === b.uid}
              onSelect={setSelectedUid}
            />
          ))}
        </div>
      )}

      {/* ── Cancel confirmation dialog ─────────────────────────── */}
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
              Cancel &ldquo;{cancelTarget?.title}&rdquo;? This will notify the
              attendee via email.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Textarea
              id="cancel-reason"
              placeholder="Let the attendee know why you're cancelling..."
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
              {cancelling ? "Cancelling..." : "Confirm cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
