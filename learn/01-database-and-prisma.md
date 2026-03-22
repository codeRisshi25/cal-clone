# 🗄️ Chapter 1: The Database & Prisma ORM

In this chapter, we dive into the heart of the application: the data. Without a solid data model, the entire application will eventually collapse under its own weight.

Your project uses **PostgreSQL** as the underlying engine, and **Prisma** as the Object-Relational Mapper (ORM).

---

## 🛠️ Why Prisma over raw SQL?

**Tradeoff:** Writing raw SQL (e.g., `SELECT * FROM users WHERE id = $1`) is incredibly fast and gives you 100% control over the database execution plan. However, it's prone to typos, and you get exactly zero TypeScript safety. 

**Solution:** Prisma sits between your Node.js code and your database.
1. You define your schema in a clean `.prisma` file.
2. Prisma generates a highly-optimized Rust query engine.
3. Prisma generates perfectly-typed TypeScript definitions. When you type `prisma.user.`, TypeScript will autocomplete `.findUnique`, `.create`, etc., and it knows exactly what fields exist on a `User`.

---

## 🧩 The Entity Relationship (ER) Model Explained

If you look at `packages/db/prisma/schema.prisma`, you'll see several `model` definitions. Let's break down the relationships:

### 1. `User`
The central entity. A `User` represents the person hosting meetings (e.g., you).
- Has a `username`, `email`, and a `timezone`.
- **Relationships:** A user has many `EventTypes`, many `Schedules`, and many `Bookings`.

### 2. `EventType`
An event type is a specific kind of meeting, like a "30 Min Discovery Call".
- Has a `slug` (the URL part, like `/30-min-call`), `title`, and `length` (duration in minutes).
- **Relationships:** It belongs to one `User`. It is optionally attached to a specific `Schedule`. By default, people have one primary schedule, but you can create a custom schedule just for "Podcasts".

### 3. `Schedule` & `Availability`
This is where the magic happens. How do we represent "I am free on Mondays from 9 AM to 5 PM, except this coming Monday because I'm on vacation"?
- **`Schedule`**: Just a named container (e.g., "Default Working Hours").
- **`Availability`**: The actual rules.
  - Look at the `days Int[]` array field. If `days = [1, 2, 3, 4, 5]`, this rule applies Monday through Friday.
  - Look at the `date DateTime?` field. If this is filled out, this row is an **override**. If `isBlocked = true`, you are totally unavailable on that date. 

### 4. `Booking` & `Attendee`
When someone successfully claims a slot.
- **`Booking`**: Tracks the `startTime`, `endTime`, and the `status` (PENDING, ACCEPTED, CANCELLED, RESCHEDULED). 
- **`Attendee`**: The person who booked the meeting with you.
  - *Design Choice:* Why separate `Booking` and `Attendee`? What if they were the same table? By separating them, we future-proof the app. If we ever want to allow "Group Bookings" (where 5 people can join one event), we just change the relationship to 1 Booking -> Many Attendees!

---

## 💻 Code Example: Relational Queries

When an interviewer asks: *"How do you fetch a user's profile and their event types at the same time without doing a N+1 database query?"*

**You answer:** "I use Prisma's `include` feature. Under the hood, Prisma executes a highly optimized SQL `JOIN`."

```typescript
// IN THE CODEBASE: apps/api/src/routes/public.ts

const userProfile = await prisma.user.findUnique({
  where: { username: req.params.username },
  include: { 
    eventTypes: { // This joins the EventType table!
      where: { isActive: true }, // We only want to show active meetings
    } 
  }
});
```
If we didn't use `include`, we would have to fetch the user, then loop over the user's ID to fetch the event types in a separate query, which is terribly inefficient.

---

## 🚦 Handling Migrations

A database is not static; it grows. When you need to add a new column (like `phoneNumber` to the `User` table), you:
1. Add it to `schema.prisma`.
2. Run `npx prisma migrate dev --name add_phone_number`.
3. Prisma looks at the difference between the current code and the live database, generates a raw SQL file (e.g., `ALTER TABLE "User" ADD COLUMN "phoneNumber" TEXT;`), and creates a migration history tracking it.

### Interview Tip 💡
**Interviewer:** *"If we delete an `EventType`, what happens to all the `Bookings` attached to it?"*
**Your Answer:** *"In our schema, we didn't add `onDelete: Cascade` to the `eventTypeId` relation inside the `Booking` table. This is highly intentional! If we delete an Event Type, we do **not** want to instantly delete all past financial records or history of bookings associated with it (which Cascade would do). By default, Prisma will actually throw a Foreign Key constraint error if you try to delete an Event Type that has existing bookings, forcing us to handle it safely (like 'archiving' the event type by setting `isActive: false` instead of hard-deleting it)."*
