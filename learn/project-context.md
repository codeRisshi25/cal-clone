# Cal-Clone: Project Context Document

This document provides a comprehensive architectural and functional overview of the **Cal-Clone** project, a scheduling application similar to Calendly and Cal.com. It is designed to be ingested by LLMs to understand the project's structure, technology stack, database schema, and core business logic.

## 1. Project Overview & Tech Stack
**Cal-Clone** is a monorepo-based scheduling application designed for high performance and strict type safety.
- **Frontend App**: Next.js (`apps/web`) using React, styled with Tailwind CSS.
- **Backend API**: Express.js REST API (`apps/api`) handling complex timezone math, slot availability calculations, and bookings.
- **Database Architecture**: PostgreSQL, interacted with via **Prisma ORM**.
- **Caching**: Redis is used heavily to cache public profiles, event configurations, and pre-calculated time slots.
- **Monorepo Manager**: Turborepo, utilizing `pnpm` workspaces (e.g., `apps/`, `packages/`).

## 2. Monorepo Structure
- `apps/api/`: The Express.js backend. Contains API routes (`routes/public.ts`, `routes/bookings.ts`, etc.) and the core algorithmic logic (`lib/slots.ts`).
- `apps/web/`: The frontend application.
- `packages/db/`: The database hub containing the `prisma/schema.prisma` file, database migrations, and the generated Prisma Client.
- `packages/types/`: Shared TypeScript types ensuring parity between frontend requests and backend schemas.
- `learn/`: Educational materials and context documents (like this one) for developer onboarding and AI context.

## 3. Database Schema Overview
The central nervous system of the app is defined in `packages/db/prisma/schema.prisma`.

### Core Entities:
- **`User`**: A host who offers public time slots. Has a unique `username`, `email`, and a default `timezone`.
- **`EventType`**: A specific meeting template (e.g., "30 Min Discovery Chat", "1 Hour Interview"). Has a `length` (duration in minutes), a URL `slug`, and is tied to a specific `Schedule`.
- **`Schedule`**: A named grouping of availability rules (e.g., "Standard Working Hours"). Belongs to a single `User`.
- **`Availability`**: The rules defining when a schedule is active.
  - Generates recurring slots via the `days` array (e.g., `[1, 2, 3, 4, 5]` = Mon-Fri).
  - Acts as an override if the `date` field is provided (e.g., blocking out Dec 25th with `isBlocked: true` or providing custom holiday hours).
- **`Booking`**: A confirmed or pending reservation. Contains the exact physical `startTime` and `endTime` saved in UTC.
- **`Attendee`**: The person who requested the booking. This is stored in a separate table from `Booking` to gracefully support future 1-to-many requirements (like group events or webinars).

## 4. Core Business Logic: Availability & Scheduling
The most complex part of the application is the scheduling engine, located in `apps/api/src/lib/slots.ts` and `apps/api/src/routes/public.ts`. It follows a strict 3-phase calculation pattern.

### Phase 1: Mathematical Generation (Possibilities)
Given an `EventType` and a requested local date (e.g., YYYY-MM-DD):
1. **Rule Lookup**: The backend finds the `Schedule` attached to the `EventType` and queries the `Availability` table.
2. **Overrides First**: It searches for a specific date override (a row where the `date` matches the requested day). If an override exists and `isBlocked` is `true`, no slots are returned.
3. **Recurring Fallback**: If no exact date override exists, it evaluates the `days[]` array to find the valid recurring time window for that weekday.
4. **Window Slicing**: The valid time window (e.g., 09:00 to 17:00) is sliced into mathematically distinct, non-overlapping blocks stepping by the `EventType.length` (e.g., `[09:00, 09:30, 10:00...]`).

### Phase 2: Double-Booking Prevention (Reality Check)
The mathematically generated slots are then filtered against the database to remove conflicts.
1. The backend queries the `Booking` table for any overlapping records on the requested day with a status of `PENDING` or `ACCEPTED`.
2. A generated slot is instantly **removed** from the public array if any part of its duration intersects with an existing booking's `[startTime, endTime]`.

### Phase 3: The UTC vs Local Math
The database natively stores `Availability` time windows as naive `@db.Time` and `Bookings` as strict UTC ISO DateTimes.
1. Instead of using massive external libraries like `moment.js`, `slots.ts` leverages the native `Intl.DateTimeFormat` API to parse the host's IANA timezone and accurately compute temporal offsets (seamlessly handling Daylight Savings offset transitions).
2. The generated, verified slots are served to the frontend in standard ISO UTC formats (e.g., `2026-10-31T09:00:00.000Z`). The Next.js client renders them natively into the viewer's local browser timezone.

## 5. Caching Layer
To prevent database exhaustion from bots or high traffic surges checking user profiles, the app implements Redis caching (`apps/api/src/lib/redis.ts`):
- `/api/public/:username` -> Caches the public profile and event types.
- `/api/public/:username/:slug/slots` -> Caches the calculated, filtered free slots for a specific date. This cache key (`slots:eventTypeId:date:timezone`) is instantly invalidated the moment a successful booking goes through to prevent race conditions.
