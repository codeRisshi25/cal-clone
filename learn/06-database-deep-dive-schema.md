# 🗄️ Chapter 6: Database Design — Schema Deep Dive & Rationale

This chapter is your primary weapon for the interview's database analysis round. For every single field and every single relationship, you need to know the exact "why" — not just the "what".

---

## Model 1: `User`

```prisma
model User {
  id                String      @id @default(cuid())
  username          String      @unique
  name              String
  email             String      @unique
  timezone          String      @default("UTC")
  avatarUrl         String?
  defaultScheduleId String?

  eventTypes EventType[]
  schedules  Schedule[]
  bookings   Booking[]
}
```

### Why each field exists

| Field | Why it exists | Trade-off |
|---|---|---|
| `id` (CUID) | Primary key, globally unique, safe for public URLs | CUIDs are slightly longer than integers but more collision-resistant than UUIDs and don't expose data volume |
| `username` (unique) | Powers the public booking URL (`/risshi/30-min-call`). Must be unique across the platform. | Usernames are hard to change later (referential integrity). In a real app you'd add a `usernameChangedAt` lock. |
| `email` (unique) | Primary identity for the host. Needed for login and notifications. | Storing email as unique assumes one account per email — correct for a scheduling tool. |
| `timezone` | Without this, every date calculation would be wrong. A slot at "9 AM" means 9 AM *in whose timezone?* | We default to "UTC" as the universal baseline. |
| `defaultScheduleId String?` | Points to which of the User's schedules should be used by default when a new Event Type is created. | This is nullable because the first Schedule hasn't been created yet when the User account is first set up. It creates a temporary "loose coupling" between User and Schedule. |

### Interview Q: "Why is `defaultScheduleId` not a proper Prisma Relation?"
**Your Answer:** "It's a deliberate design choice to avoid a circular dependency. If `User` had a formal Prisma `@relation` pointing to `Schedule`, and `Schedule` already has a `@relation` pointing back to `User`, Prisma would struggle with the ambiguity of which foreign key to use. By keeping it as a plain `String?`, we handle the resolution in application code, not at the ORM level."

---

## Model 2: `EventType`

```prisma
model EventType {
  id          String   @id @default(cuid())
  slug        String
  length      Int
  color       String   @default(\"#0ea5e9\")
  isActive    Boolean  @default(true)

  userId     String
  scheduleId String?

  @@unique([userId, slug])
}
```

### Why each field exists

| Field | Why it exists | Trade-off |
|---|---|---|
| `slug` | Makes clean, shareable URLs: `/risshi/30-min-intro`. Much better UX than `/booking?id=xyz123abc`. | Slug must be unique **per user** (not globally). The `@@unique([userId, slug])` constraint enforces this at the database level. |
| `length Int` | Stores duration in **minutes** as a plain integer. Simple and universal. | The alternative — storing `startTime` and `endTime` at the EventType level — would be wrong because the times vary per booking. We only care about *how long* the event is at the type level. |
| `color` | Lets the host visually organize event types with a branded hex color. | Defaults to Cal.com's signature sky blue `#0ea5e9`. We validate hex format in the API, not at the database level. |
| `isActive Boolean` | This is our "soft delete" mechanism. Setting `isActive: false` hides an event type from the public page without permanently deleting its historical booking data. | If we used a hard `DELETE FROM event_types WHERE id = 'xyz'`, we would lose the foreign key link from all past bookings. |
| `scheduleId String?` | Nullable — allows a "standard" event type to use the User's default schedule, while a "specialized" event type can link to a custom schedule (e.g., "Podcast Schedule: only on Fridays"). | The optionality is intentional and represents a real-world feature. |

### Interview Q: "Why is `@@unique([userId, slug])` a compound key instead of just making `slug` globally unique?"
**Your Answer:** "Making `slug` globally unique would be fine for a platform with a handful of users, but it would force every user to compete for obvious slugs like `intro-call` or `coffee-chat`. By making the constraint compound `[userId, slug]`, both `risshi/intro-call` AND `alice/intro-call` can coexist peacefully. The uniqueness is scoped to the owner, which is semantically correct."

---

## Model 3: `Schedule` & `Availability`

```prisma
model Schedule {
  id       String @id
  name     String
  timezone String @default("UTC")
  userId   String
  availability Availability[]
}

model Availability {
  days       Int[]
  startTime  DateTime @db.Time
  endTime    DateTime @db.Time
  date       DateTime? @db.Date
  isBlocked  Boolean  @default(false)
  scheduleId String
}
```

### The Core Design Challenge: "How do you model recurring calendar availability?"
This is the hardest part of the schema. The interviewer will absolutely ask about this.

**The Two-Layer Approach:**

**Layer 1 (Recurring Rules):** An `Availability` row where `date` is `null` and `days` is `[1,2,3,4,5]` means: *"Every Monday through Friday, I am available from `startTime` to `endTime`."*

**Layer 2 (Exception Overrides):** An `Availability` row where `date` is set to a specific date like `"2026-04-01"` is an **override** that applies ONLY on that one day. If `isBlocked: true`, the entire day is blocked (vacation). If `isBlocked: false` with custom `startTime`/`endTime`, it's a one-day custom schedule.

**Why store `startTime` as `@db.Time` (not a full `DateTime`)?**
The recurring rules are *time-only* — we don't know *which specific date* a "Monday-9AM-to-5PM" rule applies to in advance. Using `@db.Time` (stored as `TIME WITHOUT TIME ZONE` in Postgres) keeps the column clean and prevents us from accidentally polluting it with a date component.

### Interview Q: "How do you calculate available time slots for a date?"
**Your Answer** (step-by-step algorithm):
1. Find the weekday number for the requested date (e.g., `Tuesday = 2`).
2. Query `Availability` for rows where `scheduleId` matches, `date IS NULL`, and `days @> ARRAY[2]` (Postgres array contains check).
3. Separately query `Availability` for a row where `date = '2026-04-01'` (specific override).
4. If an override exists, it **completely replaces** the recurring rule for that date. If `isBlocked = true`, return an empty slot list.
5. Take the resulting start/end time window and subdivide it into equal slots matching the `EventType.length`.
6. For each slot, do a final check against the `Booking` table to exclude any already-claimed slots.

---

## Model 4: `Booking` & `Attendee`

```prisma
model Booking {
  uid              String        @unique @default(uuid())
  status           BookingStatus @default(PENDING)
  rescheduledFrom  String?
  eventTypeId      String
  userId           String
  attendee         Attendee?
}

model Attendee {
  bookingId String  @unique
  booking   Booking @relation(onDelete: Cascade)
}
```

### Why the Split?
`Booking` and `Attendee` are separate tables. Why not put `attendeeName`, `attendeeEmail`, etc. directly on `Booking`?

**Reason 1 — Normalization:** The information *about the booking* (when, what type, status) is semantically different from information *about the person who booked* (name, email). Normalized schemas are easier to query, audit, and extend.

**Reason 2 — Future-Proofing:** If we ever want **Group Bookings** (5 people sharing a video call), we change `attendee Attendee?` to `attendees Attendee[]`. We don't have to restructure the entire `Booking` table. Only the "Attendee" side changes.

### Why does `uid` exist alongside `id`?
| Field | Purpose |
|---|---|
| `id` (CUID) | Internal primary key. Never exposed to the public. Used for database joins. |
| `uid` (UUID) | Public identifier. Used in cancel/reschedule URLs (e.g., `/booking/df1a2c.../cancel`). |

**Why two IDs?** We don't want to expose our internal database key counter in URLs (it reveals how many bookings exist and is guessable). The `uid` is a randomly generated UUID that is safe to put in a publicly-shared email link.

### Why `rescheduledFrom String?`
This stores the `uid` of the *original* booking. When someone reschedules:
1. The OLD booking status is set to `RESCHEDULED`.
2. A NEW booking is created.
3. The new booking's `rescheduledFrom` points to the old booking's `uid`.

This creates a full audit trail. You can always ask: "Show me the entire history of rescheduling for this meeting," and walk the chain.
