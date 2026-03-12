// Shared TypeScript interfaces used by both frontend and backend

export type BookingStatus = "PENDING" | "ACCEPTED" | "CANCELLED" | "RESCHEDULED";

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  timezone: string;
  avatarUrl?: string | null;
  defaultScheduleId?: string | null;
}

export interface EventType {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  length: number; // minutes
  color: string;
  isActive: boolean;
  userId: string;
  scheduleId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Schedule {
  id: string;
  name: string;
  timezone: string;
  userId: string;
  availability: Availability[];
}

export interface Availability {
  id: string;
  days: number[]; // 0=Sun … 6=Sat; empty = date override
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  date?: string | null; // ISO date string, set for overrides
  isBlocked: boolean;
  scheduleId: string;
}

export interface Attendee {
  id: string;
  name: string;
  email: string;
  timezone: string;
  bookingId: string;
}

export interface Booking {
  id: string;
  uid: string;
  title: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  cancellationNote?: string | null;
  rescheduledFrom?: string | null;
  eventTypeId: string;
  eventType?: EventType;
  userId: string;
  attendee?: Attendee;
  createdAt: string;
  updatedAt: string;
}

// Request/response shapes for the API

export interface CreateEventTypeBody {
  title: string;
  slug: string;
  description?: string;
  length: number;
  color?: string;
  scheduleId?: string;
}

export interface UpdateEventTypeBody extends Partial<CreateEventTypeBody> {
  isActive?: boolean;
}

export interface CreateBookingBody {
  name: string;
  email: string;
  startTime: string; // ISO datetime
  timezone: string;
  notes?: string;
}

export interface CancelBookingBody {
  reason?: string;
}

export interface RescheduleBookingBody {
  newStartTime: string; // ISO datetime
}

export interface AvailabilityUpdateBody {
  scheduleId: string;
  timezone: string;
  availability: Array<{
    days: number[];
    startTime: string; // HH:MM
    endTime: string;
  }>;
}

export interface DateOverrideBody {
  date: string; // YYYY-MM-DD
  isBlocked: boolean;
  startTime?: string; // HH:MM — required if not blocked
  endTime?: string;
}

// Slot returned by GET /slots
export interface TimeSlot {
  time: string;      // ISO datetime string (UTC)
  available: boolean;
}

// Public profile page response
export interface PublicProfile {
  user: Pick<User, "username" | "name" | "avatarUrl" | "timezone">;
  eventTypes: EventType[];
}
