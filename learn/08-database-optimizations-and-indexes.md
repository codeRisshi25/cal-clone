# ⚡ Chapter 8: Database Design — Optimizations, Indexes & Integrity

An interviewer who thinks at a senior level will push past "does it work?" and ask "how does it *scale*?" This chapter covers every performance and integrity decision in the schema.

---

## 1. Indexes — What They Are and Why We Have Them

### What is a database index?
Without an index, when Postgres searches for a user by `username`, it does a **Full Table Scan** — it reads every single row in the `User` table, one by one, until it finds the match. With 10 users, this is instant. With 1 million users, this takes seconds.

An index is a separate, sorted lookup structure (like a book's index at the back) that Postgres maintains. When you search by an indexed column, Postgres jumps directly to the result in `O(log N)` time instead of `O(N)`.

### Which columns are indexed in our schema?

**1. `User.username` — `@unique`**
```prisma
username  String  @unique
```
Every `@unique` constraint in Prisma automatically creates a B-Tree index on that column in PostgreSQL.

**Why:** Every single public booking page request starts with `findUnique({ where: { username } })`. This query fires hundreds or thousands of times per day. Without the index, Postgres reads every user row to find the match.

**2. `User.email` — `@unique`**
Same reasoning — login lookups and uniqueness validation fire on every authentication attempt.

**3. `EventType` compound index — `@@unique([userId, slug])`**
```prisma
@@unique([userId, slug])
```
This creates a **Composite Index** — a single index that covers two columns together.

**Why does order matter?** The index is most efficient when queries match the *leading columns*. `[userId, slug]` means queries that filter by `userId` alone OR `userId + slug` together are fast. A query filtering by `slug` alone would NOT get the full benefit.

**Why this order specifically?** When we look up a specific event type, we always know the `userId` first (we just looked up the User by username). Then we narrow by `slug`. The index is perfectly aligned with our actual query pattern.

**4. `Booking.uid` — `@unique`**
```prisma
uid  String  @unique @default(uuid())
```
The `uid` is used in every public URL (cancel links, reschedule links in emails). Without an index, finding a booking by its public `uid` would scan the entire bookings table.

---

## 2. Missing Indexes — What Would You Add for Production Scale?

This is a great thing to proactively mention. "Here's what I'd add if we were scaling to 100k users."

**`Booking.eventTypeId` + `Booking.status`**
The most commonly used query in the admin panel is "fetch all my upcoming bookings":
```typescript
prisma.booking.findMany({
  where: { 
    userId: "...",
    status: "ACCEPTED",
    startTime: { gte: now }
  }
})
```
Currently there is no index on `(userId, status, startTime)`. For a host with 10,000 past bookings, this requires scanning all 10,000 rows to filter by status and date. 

The fix: Adding a Prisma `@@index([userId, status, startTime])` would make the admin dashboard instant regardless of booking volume.

---

## 3. Data Types — The Subtle Choices

### Why `@db.Time` for availability start/end times?
```prisma
startTime  DateTime @db.Time
endTime    DateTime @db.Time
```
`@db.Time` maps to `TIME WITHOUT TIME ZONE` in PostgreSQL. This stores **only the time component** (e.g., `09:00:00`). 

If we used a full `DateTime`, we'd have to pick an arbitrary date to attach to the time (`1970-01-01 09:00:00`), which is confusing and meaningless. `@db.Time` is semantically clean — it says "this is purely a time of day, not a point in history."

### Why `Int[]` for `Availability.days`?
```prisma
days  Int[]   // [0=Sun, 1=Mon, ..., 6=Sat]
```
**Alternative 1:** A boolean column per day: `isMonday`, `isTuesday`, etc. — creates 7 unnecessary columns, hard to query with `WHERE` clauses.
**Alternative 2:** A separate `AvailabilityDay` junction table with rows per day — over-engineered for this use case, adds unnecessary JOIN complexity.
**Our choice:** `Int[]` is clean, compact, and PostgreSQL's native array operators (`@>`, array contains) allow highly efficient queries: `WHERE days @> ARRAY[2]` (does the rule apply on Tuesday?).

### Why `CUID` over `UUID` or `auto-increment`?

| ID Type | Pros | Cons |
|---|---|---|
| Auto-increment (`1, 2, 3...`) | Simple, small, fast | Exposes data volume ("we have 523 users"), guessable, problematic in distributed systems |
| UUID (`550e8400-e29b...`) | Globally unique, non-guessable | Larger (36 chars), random → poor B-Tree index locality (random insertions are slower) |
| CUID (`clxje2...`) | Time-ordered prefix (better index insertion), compact, non-guessable, URL-safe | Slightly less standard than UUID |

We use **CUID for `id`** (internal DB key) for its index performance, and **UUID for `uid`** (public key on Booking) because it's the web standard that Resend and external systems recognize.

---

## 4. Referential Integrity — Where Cascade Is and Isn't Used

| Relationship | Delete Behavior | Why |
|---|---|---|
| `User` deletes → `EventType` | **CASCADE** (`onDelete: Cascade`) | When a user account is deleted, their event types are useless orphans with no owner. No point keeping them. |
| `User` deletes → `Schedule` | **CASCADE** | Same logic. A schedule without its owner is meaningless. |
| `Schedule` deletes → `Availability` | **CASCADE** | Availability rules are children of their parent schedule. No schedule = no rules needed. |
| `Booking` deletes → `Attendee` | **CASCADE** | An attendee record with no booking is a meaningless orphan. Attendees exist because of bookings. |
| `EventType` deletes → `Booking` | **NO CASCADE (RESTRICT)** | Bookings are contractual records. We delete them explicitly in code after user confirmation. |
| `User` deletes → `Booking` | **NO CASCADE** | Same — historical booking records should not auto-delete when a host account is removed. |

---

## 5. Handling Concurrency — The Race Condition

When two people try to book the same slot in the same millisecond, whoever gets to the database first wins. But how do we ensure the second person gets a clean rejection and not a corrupt state?

The answer is **Optimistic Concurrency via Validation-Before-Write**.

We run the conflict check query and the booking insert as separate statements (not wrapped in a Postgres transaction with a lock). This is called an "optimistic" approach — we optimistically assume most of the time there's no conflict.

**Production-grade solution (what you'd say to impress):**
"In a high-traffic system, we'd wrap the conflict-check and the insert inside an explicit PostgreSQL row-level lock:

```sql
BEGIN;
  SELECT * FROM bookings 
    WHERE event_type_id = 'xyz' 
    AND status IN ('ACCEPTED', 'PENDING') 
    AND start_time < $endTime 
    AND end_time > $startTime
    FOR UPDATE;  -- ← Locks the conflicting rows
  
  -- If no rows returned, proceed with INSERT
  INSERT INTO bookings (...)
COMMIT;
```
The `FOR UPDATE` lock prevents any other database transaction from reading those rows in a conflicting way until we commit. Prisma exposes this via `$transaction` and raw queries. For our current traffic levels, the optimistic approach works perfectly well."

---

## 6. The Enum — `BookingStatus`

```prisma
enum BookingStatus {
  PENDING
  ACCEPTED
  CANCELLED
  RESCHEDULED
}
```

**Why use an Enum instead of a plain `String`?**
- PostgreSQL enforces at the *database level* that only these 4 values are valid. Even if a bug in your application code tries to write `status: "awaitingconfirmation"`, the database itself will throw an error.
- Eliminates "magic strings". Searching your codebase for `BookingStatus.ACCEPTED` is much more reliable than searching for the string `"accepted"` which might appear in 50 unrelated places.
- TypeScript picks up the Prisma enum and turns it into an actual TypeScript enum — so your code won't even compile if you misspell a status value.

**Interview Q: "What would you add if you wanted payment processing?"**
**Your Answer:** "I'd add `AWAITING_PAYMENT` to the enum, a `stripePaymentIntentId` field on the `Booking` model, and a `Webhook` listener from Stripe that upgrades a booking from `AWAITING_PAYMENT` → `ACCEPTED` once payment is confirmed. No other schema changes would be needed!"
