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
  TimeSlot,
  PublicProfile,
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

// ── Event Types ────────────────────────────────────────────────────────────────

export function getEventTypes(): Promise<EventType[]> {
  return request("/event-types");
}

export function createEventType(body: CreateEventTypeBody): Promise<EventType> {
  return request("/event-types", { method: "POST", body: JSON.stringify(body) });
}

export function updateEventType(id: string, body: UpdateEventTypeBody): Promise<EventType> {
  return request(`/event-types/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteEventType(id: string): Promise<void> {
  return request(`/event-types/${id}`, { method: "DELETE" });
}

// ── Availability ───────────────────────────────────────────────────────────────

export function getSchedules(): Promise<Schedule[]> {
  return request("/availability");
}

export function updateAvailability(body: AvailabilityUpdateBody): Promise<Schedule> {
  return request("/availability", { method: "PUT", body: JSON.stringify(body) });
}

export function addDateOverride(body: DateOverrideBody): Promise<Availability> {
  return request("/availability/override", { method: "POST", body: JSON.stringify(body) });
}

export function deleteDateOverride(id: string): Promise<void> {
  return request(`/availability/override/${id}`, { method: "DELETE" });
}

// ── Bookings ───────────────────────────────────────────────────────────────────

export function getUpcomingBookings(): Promise<Booking[]> {
  return request("/bookings/upcoming");
}

export function getPastBookings(): Promise<Booking[]> {
  return request("/bookings/past");
}

export function cancelBooking(uid: string, body: CancelBookingBody): Promise<Booking> {
  return request(`/bookings/${uid}/cancel`, { method: "POST", body: JSON.stringify(body) });
}

export function rescheduleBooking(uid: string, body: RescheduleBookingBody): Promise<Booking> {
  return request(`/bookings/${uid}/reschedule`, { method: "POST", body: JSON.stringify(body) });
}

// ── Public ─────────────────────────────────────────────────────────────────────

export function getPublicProfile(username: string): Promise<PublicProfile> {
  return request(`/${username}`);
}

export function getSlots(eventTypeId: string, date: string, timezone: string): Promise<TimeSlot[]> {
  const params = new URLSearchParams({ date, timezone });
  return request(`/slots/${eventTypeId}?${params}`);
}

export function createBooking(
  username: string,
  slug: string,
  body: CreateBookingBody
): Promise<Booking> {
  return request(`/${username}/${slug}/book`, { method: "POST", body: JSON.stringify(body) });
}

export function getBookingByUid(uid: string): Promise<Booking> {
  return request(`/bookings/${uid}`);
}
