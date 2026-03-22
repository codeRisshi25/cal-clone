# 🔄 Chapter 7: Database Design — Common Scenarios & Operations

An interviewer asking *"walk me through what happens in the database when X occurs"* is testing your mental model of the data layer. This guide covers every critical scenario with the exact Prisma operations involved.

---

## Scenario 1: Creating a Booking (The Happy Path)

**User action:** A visitor goes to `/risshi/30-min-call`, picks Tuesday at 10 AM, fills in their name and email, and hits Confirm.

**What the database does:**

### Step 1: Validate the slot is actually open
```typescript
// 1. Find the host user based on the URL slug
const user = await prisma.user.findUnique({ where: { username: "risshi" } });

// 2. Find the specific event type using the COMPOUND unique index
const eventType = await prisma.eventType.findUnique({
  where: { userId_slug: { userId: user.id, slug: "30-min-call" } }
});

// 3. Calculate endTime (startTime + duration in minutes)
const startTime = new Date("2026-04-08T10:00:00Z");
const endTime = new Date(startTime.getTime() + eventType.length * 60 * 1000);

// 4. Check for conflicts — the atomic guard against double bookings
const conflict = await prisma.booking.findFirst({
  where: {
    eventTypeId: eventType.id,
    status: { in: ["ACCEPTED", "PENDING"] },
    startTime: { lt: endTime },   // "the existing booking starts BEFORE our new one ends"
    endTime: { gt: startTime },   // "the existing booking ends AFTER our new one starts"
  },
});
if (conflict) throw new Error("409 Conflict");
```

**Interview Deep Dive — The Overlap Logic:**
The condition `startTime < endTime AND endTime > startTime` is the classic interval overlap test. It catches all 4 possible ways two time ranges can collide:
- New booking starts in the middle of existing one
- New booking ends in the middle of existing one
- New booking completely wraps around existing one
- New booking is completely wrapped inside existing one

### Step 2: Write to the database atomically
```typescript
// Prisma creates BOTH the Booking and the Attendee in a single SQL transaction
const booking = await prisma.booking.create({
  data: {
    title: `Visitor Name / 30 Min Call`,
    startTime,
    endTime,
    status: "ACCEPTED",
    eventTypeId: eventType.id,
    userId: user.id,
    attendee: {
      create: {               // ← Nested write: creates Attendee row simultaneously
        name: "Visitor Name",
        email: "visitor@email.com",
        timezone: "Asia/Kolkata",
      },
    },
  },
});
```
**Why the nested `create` matters:** Prisma wraps the `Booking` insert and the `Attendee` insert in a **single SQL transaction**. Either both succeed or neither does. You cannot end up with a `Booking` row with no `Attendee` pointing to it.

---

## Scenario 2: Rescheduling a Booking

**User action:** An existing attendee clicks the Reschedule link in their confirmation email and picks a new time.

**What the database does:**

```typescript
// 1. Mark the OLD booking as RESCHEDULED (we never delete it — audit trail!)
await prisma.booking.update({
  where: { uid: "original-booking-uid" },
  data: { status: "RESCHEDULED" }
});

// 2. Create a BRAND NEW booking that links back to the original
const newBooking = await prisma.booking.create({
  data: {
    startTime: newStartTime,
    endTime: newEndTime,
    status: "ACCEPTED",
    rescheduledFrom: "original-booking-uid",  // ← Audit trail link!
    eventTypeId: originalBooking.eventTypeId,
    userId: originalBooking.userId,
    attendee: {
      create: { /* same attendee info */ }
    }
  }
});
```

**Interview Q: "Why create a new booking row instead of just updating the old one's `startTime`?"**
**Your Answer:** "Overwriting the `startTime` destroys history. By creating a new `Booking` and linking them via `rescheduledFrom`, we maintain a complete audit trail. A support engineer can always answer questions like 'this meeting was rescheduled 3 times, what were the original times?' You can also do analytics — rescheduled bookings are a signal of poor UX or inconvenient default times."

---

## Scenario 3: Blocking a Day (Date Override)

**User action:** Host goes to their availability settings and blocks out April 1st (vacation).

**What the database does:**
```typescript
// An Availability override is a row where `date` is set (not null)
await prisma.availability.create({
  data: {
    scheduleId: user.defaultScheduleId,
    days: [],                    // Empty — this is not a recurring weekday rule
    date: new Date("2026-04-01"), // The specific date being blocked
    startTime: new Date("1970-01-01T00:00:00Z"), // Placeholder times (irrelevant when isBlocked=true)
    endTime: new Date("1970-01-01T00:00:00Z"),
    isBlocked: true,             // ← The key flag
  }
});
```

When the slot-calculation algorithm then runs for April 1st, it fetches ALL `Availability` rows for the schedule — both recurring (`date IS NULL`) and overrides (`date = '2026-04-01'`). The override takes priority and since `isBlocked: true`, the function returns `[]` (zero available slots).

**Alternative scenario — Custom hours on one day:**
If instead of blocking the entire day, the host wants to only be available for 2 hours:
```typescript
await prisma.availability.create({
  data: {
    date: new Date("2026-04-01"),
    startTime: "14:00",   // 2PM
    endTime: "16:00",     // 4PM
    isBlocked: false,     // NOT blocked — custom hours!
  }
});
```

---

## Scenario 4: Deleting an Event Type

**User action:** Host decides to remove their "30 Min Call" event type entirely.

**The Challenge:** The `Booking` table has `eventTypeId` as a foreign key referencing `EventType`. If we just delete the `EventType` row, Postgres will throw a **Foreign Key Constraint Violation** because Bookings still reference it.

**How we handle it:**
```typescript
// Route: DELETE /api/admin/event-types/:id
// apps/api/src/routes/eventTypes.ts

// First: Get all bookings tied to this event type
const bookings = await prisma.booking.findMany({
  where: { eventTypeId: id },
  select: { id: true }
});

// Second: Delete the associated Attendees (no FK protection for them → auto-deleted via Cascade)
// Third: Delete the Booking rows that were referencing this EventType
await prisma.booking.deleteMany({ where: { eventTypeId: id } });

// NOW safe to delete the EventType
await prisma.eventType.delete({ where: { id } });
```

**Interview Q: "Why not put `onDelete: Cascade` on `Booking.eventTypeId` to handle this automatically?"**
**Your Answer:** "This was a very intentional decision. An auto-cascade would silently delete all booking records the moment a host accidentally deletes an event type. In a real SaaS product, booking records are financial and contractual records — deleting them should require explicit, deliberate action. By *not* using Cascade, we force ourselves to write explicit code that acknowledges what we're about to destroy. It also lets operators audit what is about to be deleted before committing."
