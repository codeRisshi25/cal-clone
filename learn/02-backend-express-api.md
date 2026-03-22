# ⚙️ Chapter 2: The Backend (Express.js API)

Your backend lives in `apps/api`. It is a pure Node.js Express server written entirely in TypeScript.
The API defines two main namespaces (or "routers"):
1. `/api/admin/*` — For the host (creating event types, setting availability, deleting schedules).
2. `/api/public/*` — For the public (viewing profiles, finding available slots, creating bookings).

---

## 🏎️ Performance & Redis Caching

One of the most impressive technical features of this codebase is its **Caching Strategy**.
When a user views a booking page, calculating their available slots requires heavy math:
* Find all their rules (Monday 9-5).
* Check if there are any date overrides blocking a day.
* Look up EVERY existing booking they have for that date.
* Do math to subtract booked time from available time.

If 1,000 people open your booking page at once, querying the Postgres database 1,000 times for that exact computation is slow and expensive.

### How we solved it:
We use **Redis** (an in-memory key-value store).
When someone requests the available slots for `/risshi/30-min-call` on `October 15th`, the backend computes it once, and then saves the result in Redis with a key like: `slots:xyz123:2026-10-15:Asia/Kolkata`.

```typescript
// IN THE CODEBASE: apps/api/src/routes/public.ts

const cacheKey = `slots:${eventType.id}:${dateStr}:${timezone}`;
const cached = await cacheGet(cacheKey); // Try to get it from Redis RAM Memory
if (cached) {
  // We found it instantly! We don't even have to touch the Postgres database!
  return res.json(JSON.parse(cached));
}

// ... Heavy math and database querying ...

// Save it in Redis for 1 hour so the next person gets it instantly!
await cacheSetEx(cacheKey, 3600, JSON.stringify(slots));
```

### Cache Invalidation (The Hard Part)
*Interview Question: "What happens if you cache the slots for 1 hour, but someone books a slot 5 minutes later? Won't everyone else see that slot as available for the next 55 minutes?"*

**Your Answer:** "Great catch! This phenomenon is called 'stale data'. In our API, whenever someone successfully creates a booking, or whenever the Host updates their availability schedule, the Express server instantly talks to Redis and actively **deletes (invalidates)** the specific cache key for that day!"

```typescript
// Inside the POST /booking route:
await cacheDel(`slots:${eventType.id}:${dateStr}:${parse.data.timezone}`);
```

---

## 🚫 Double Booking Prevention (Race Conditions)

*Interview Question: "What happens if two people click 'Confirm Booking' for the 10:00 AM slot at the exact same millisecond?"*

**Your Answer:** In distributed systems, this is known as a **Race Condition**. 
In our `POST /booking` route, we explicitly protect against this by doing a final mathematical check right before creating the database row:

```typescript
  // Double-booking check — ensure no ACCEPTED/PENDING booking overlaps this slot
  const conflict = await prisma.booking.findFirst({
    where: {
      eventTypeId: eventType.id,
      status: { in: ["ACCEPTED", "PENDING"] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });
  if (conflict) return res.status(409).json({ error: "This slot is no longer available" });
```

We check the exact start and end times to see if they overlap (`lt` = less than, `gt` = greater than) with *any* existing booking in the database. Whichever server thread hits the database first wins. The second thread will detect the conflict and return an HTTP `409 Conflict` error to the second user!

---

## ✉️ Background Tasks (Emails)

When a booking succeeds, we need to send an email using the Resend API.
Notice how we handle it in the code:

```typescript
// Send confirmation email — fire and forget
sendBookingConfirmation({
  attendeeName: parse.data.name,
  // ...
}).catch(console.error);

return res.status(201).json(booking);
```

### Design Choice: Fire-and-Forget
Notice there is NO `await` before `sendBookingConfirmation`. Why?
If we waited (`await`) for the email API to finish, the user would be stuck on a loading spinner for 2–3 entire seconds just waiting for Resend to reply. 

By executing it asynchronously and immediately returning the `201 Created` JSON, the user gets directed to the success page instantly. The server handles sending the email silently in the background. If Resend fails, the `.catch(console.error)` prevents the Express server itself from crashing down completely.
