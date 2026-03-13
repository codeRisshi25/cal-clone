// Thin typed fetch client — no axios, just fetch + NEXT_PUBLIC_API_URL
import type {
  EventType,
  CreateEventTypeBody,
  UpdateEventTypeBody,
  Schedule,
  Availability,
  AvailabilityUpdateBody,
  DateOverrideBody,
  Booking,
  CreateBookingBody,
  CancelBookingBody,
  RescheduleBookingBody,
  PublicProfile,
  User,
} from "@cal-clone/types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Event Types  (mounted at /api/admin/event-types) ──────────────────────────

export function getEventTypes(): Promise<EventType[]> {
  return request("/api/admin/event-types");
}

export function createEventType(body: CreateEventTypeBody): Promise<EventType> {
  return request("/api/admin/event-types", { method: "POST", body: JSON.stringify(body) });
}

export function updateEventType(id: string, body: UpdateEventTypeBody): Promise<EventType> {
  return request(`/api/admin/event-types/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteEventType(id: string): Promise<void> {
  return request(`/api/admin/event-types/${id}`, { method: "DELETE" });
}

// ── Availability  (mounted at /api/admin/availability) ────────────────────────

export async function getSchedules(): Promise<Schedule[]> {
  const data = await request<{ schedules: Schedule[]; defaultScheduleId: string | null }>("/api/admin/availability");
  return data.schedules;
}

export function updateAvailability(body: AvailabilityUpdateBody): Promise<Schedule> {
  return request("/api/admin/availability", { method: "PUT", body: JSON.stringify(body) });
}

export function addDateOverride(body: DateOverrideBody): Promise<Availability> {
  return request("/api/admin/availability/overrides", { method: "POST", body: JSON.stringify(body) });
}

export function deleteDateOverride(id: string): Promise<void> {
  return request(`/api/admin/availability/overrides/${id}`, { method: "DELETE" });
}

// ── Bookings  (mounted at /api/admin/bookings) ────────────────────────────────
// GET / accepts ?status=upcoming|past

export function getUpcomingBookings(): Promise<Booking[]> {
  return request("/api/admin/bookings?status=upcoming");
}

export function getPastBookings(): Promise<Booking[]> {
  return request("/api/admin/bookings?status=past");
}

// Cancel/reschedule use the booking's database id (not uid) — matches /:id routes
export function cancelBooking(id: string, body: CancelBookingBody): Promise<Booking> {
  return request(`/api/admin/bookings/${id}/cancel`, { method: "POST", body: JSON.stringify(body) });
}

export function rescheduleBooking(id: string, body: RescheduleBookingBody): Promise<Booking> {
  return request(`/api/admin/bookings/${id}/reschedule`, { method: "POST", body: JSON.stringify(body) });
}

// ── Public  (mounted at /api/public) ──────────────────────────────────────────

export function getPublicProfile(username: string): Promise<PublicProfile> {
  return request(`/api/public/${username}`);
}

// GET /api/public/:username/:slug — returns { user, eventType } for booking page header
export function getEventTypeBySlug(
  username: string,
  slug: string
): Promise<{ user: Pick<User, "username" | "name" | "timezone">; eventType: EventType }> {
  return request(`/api/public/${username}/${slug}`);
}

// GET /api/public/:username/:slug/slots — backend returns { slots: string[] } (ISO UTC datetimes)
export async function getSlots(
  username: string,
  slug: string,
  date: string,
  timezone: string
): Promise<string[]> {
  const params = new URLSearchParams({ date, tz: timezone });
  const data = await request<{ slots: string[] }>(
    `/api/public/${username}/${slug}/slots?${params}`
  );
  return data.slots;
}

export function createBooking(
  username: string,
  slug: string,
  body: CreateBookingBody
): Promise<Booking> {
  return request(`/api/public/${username}/${slug}/book`, { method: "POST", body: JSON.stringify(body) });
}

export function getBookingByUid(uid: string): Promise<Booking> {
  return request(`/api/public/bookings/${uid}`);
}

// POST /api/public/bookings/:uid/cancel — attendee self-cancel
export function cancelBookingByUid(uid: string, body: CancelBookingBody): Promise<Booking> {
  return request(`/api/public/bookings/${uid}/cancel`, { method: "POST", body: JSON.stringify(body) });
}
