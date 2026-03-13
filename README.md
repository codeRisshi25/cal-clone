# Cal Clone — Scheduling Platform

A full-stack scheduling/booking web application that replicates Cal.com's design and user experience. Users can create event types, configure availability, and let others book time slots through a public booking page.

**Live Demo:** [cal-clone-olive.vercel.app](https://cal-clone-olive.vercel.app) _(Frontend only — backend deployment on Azure ACR pending)_

**GitHub:** [github.com/codeRisshi25/cal-clone](https://github.com/codeRisshi25/cal-clone)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS 3, Radix UI primitives, Lucide icons |
| Backend | Express.js, TypeScript, Zod validation |
| Database | PostgreSQL 16 with Prisma ORM |
| Caching | Redis 7 (ioredis) |
| Email | Resend (transactional emails) |
| Monorepo | pnpm workspaces + Turborepo |
| Testing | Jest + Supertest (integration tests) |

---

## Monorepo Structure

```
cal-clone/
├── apps/
│   ├── api/          # Express.js REST API (port 8000)
│   └── web/          # Next.js 14 frontend (port 3000)
├── packages/
│   ├── db/           # Prisma client + schema
│   └── types/        # Shared TypeScript interfaces
├── docker-compose.dev.yml   # Local Postgres + Redis
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Database Schema

Six models with proper relationships, cascading deletes, and unique constraints:

```
User ──┬── EventType ──── Booking ──── Attendee
       └── Schedule ───── Availability
```

| Model | Purpose |
|-------|---------|
| **User** | Default admin user (username, email, timezone) |
| **EventType** | Configurable meeting types (title, slug, duration, color) |
| **Schedule** | Named availability schedules with timezone |
| **Availability** | Weekly recurring rules + per-date overrides |
| **Booking** | Confirmed/cancelled/rescheduled meetings with timestamps |
| **Attendee** | Booker's name, email, and timezone (1:1 with Booking) |

**Key constraints:**
- `EventType`: unique `(userId, slug)` — no duplicate slugs per user
- `Booking.uid`: UUID for public-facing URLs (not exposing internal IDs)
- `Availability.days[]`: integer array (0=Sun..6=Sat), empty = date override
- `BookingStatus` enum: `PENDING | ACCEPTED | CANCELLED | RESCHEDULED`

---

## Features

### Core (Required)

- **Event Types Management** — Full CRUD with title, description, duration, URL slug, color picker
- **Availability Settings** — Set available days/hours per schedule, timezone selection
- **Public Booking Page** — Calendar date picker, real-time slot availability, booking form with name/email, double-booking prevention
- **Bookings Dashboard** — View upcoming/past bookings, cancel bookings with optional note

### Bonus (Implemented)

- **Responsive Design** — Desktop sidebar + mobile bottom nav with backdrop blur (Cal.com pattern)
- **Date Overrides** — Block specific dates or set custom hours for individual days
- **Rescheduling Flow** — Reschedule existing bookings to a new time slot
- **Email Notifications** — Booking confirmation, cancellation, and reschedule emails via Resend
- **Redis Caching** — Slots (2min TTL), profiles (5min), event types (30s), bookings (30s)
- **DST-Aware Timezone Handling** — Custom slot calculator using `Intl.DateTimeFormat` for daylight saving transitions

---

## API Endpoints

### Admin Routes (assumes default logged-in user)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/event-types` | List all event types |
| POST | `/api/admin/event-types` | Create event type |
| PUT | `/api/admin/event-types/:id` | Update event type |
| DELETE | `/api/admin/event-types/:id` | Delete event type |
| GET | `/api/admin/availability` | Get schedules + availability |
| PUT | `/api/admin/availability` | Update schedule availability |
| POST | `/api/admin/availability/overrides` | Add date override |
| DELETE | `/api/admin/availability/overrides/:id` | Remove date override |
| GET | `/api/admin/bookings?status=upcoming\|past` | List bookings |
| POST | `/api/admin/bookings/:id/cancel` | Cancel a booking |
| POST | `/api/admin/bookings/:id/reschedule` | Reschedule a booking |

### Public Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/:username` | Public profile + active event types |
| GET | `/api/public/:username/:slug` | Single event type details |
| GET | `/api/public/:username/:slug/slots?date=YYYY-MM-DD&tz=...` | Available time slots |
| POST | `/api/public/:username/:slug/book` | Create a booking |
| GET | `/api/public/bookings/:uid` | Booking details by UID |
| POST | `/api/public/bookings/:uid/cancel` | Attendee self-cancel |

---

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 9
- Docker & Docker Compose (for PostgreSQL + Redis)

### 1. Clone & Install

```bash
git clone https://github.com/codeRisshi25/cal-clone.git
cd cal-clone
pnpm install
```

### 2. Start PostgreSQL & Redis

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts PostgreSQL on port `5433` and Redis on port `6379`.

### 3. Configure Environment

```bash
# API environment
cp .env.example apps/api/.env
# Edit apps/api/.env — defaults work with docker-compose.dev.yml:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/calclone_dev
#   REDIS_URL=redis://localhost:6379
#   PORT=8000

# Web environment
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' > apps/web/.env.local
```

### 4. Set Up Database

```bash
pnpm db:generate       # Generate Prisma client
pnpm db:migrate:dev    # Run migrations (creates tables)
pnpm db:seed           # Seed sample data (event types + bookings)
```

### 5. Start Development Servers

```bash
pnpm dev
```

This starts both the API (http://localhost:8000) and the web app (http://localhost:3000) concurrently via Turborepo.

### 6. Explore

- **Admin dashboard:** http://localhost:3000/event-types
- **Public booking page:** http://localhost:3000/risshi (default seeded user)
- **Prisma Studio:** `pnpm db:studio` (visual database browser)

---

## Testing

```bash
# Run all integration tests (requires test DB)
docker compose -f docker-compose.dev.yml up -d
pnpm test
```

Tests cover:
- Event Types API (CRUD operations, validation, slug uniqueness)
- Bookings API (creation, cancellation, double-booking prevention)
- Slot Calculator (availability computation, timezone handling, date overrides)

---

## Deployment

| Component | Platform | Status |
|-----------|----------|--------|
| Frontend | Vercel | Deployed |
| Backend + DB + Redis | Azure ACR / ACI | Planned |

### Frontend (Vercel)

The Next.js frontend is deployed on Vercel with the monorepo root directory set to `apps/web`. The `@cal-clone/types` workspace package is transpiled at build time.

### Backend (Azure — Planned)

The Express API will be containerized and deployed to Azure Container Registry (ACR) with Azure Container Instances (ACI), backed by Azure Database for PostgreSQL Flexible Server and Azure Cache for Redis.

---

## Assumptions & Design Decisions

1. **No authentication** — A default user (`risshi`) is assumed to be logged in for all admin operations, as specified in the assignment.
2. **Slot calculation** — Built a custom DST-aware slot calculator using `Intl.DateTimeFormat` instead of heavy timezone libraries (moment-timezone, luxon). This handles daylight saving transitions correctly while keeping the bundle small.
3. **Redis caching** — All public-facing read endpoints are cached with short TTLs. Cache is invalidated on writes (create/update/delete). This prevents stale slot data while reducing database load.
4. **UUID-based public URLs** — Bookings use UUIDs (`uid`) in public URLs instead of auto-increment IDs to prevent enumeration attacks.
5. **Monorepo architecture** — Shared types package (`@cal-clone/types`) ensures API request/response contracts are consistent between frontend and backend at compile time.
6. **Cal.com visual fidelity** — Custom Tailwind color palette (`cal-bg`, `cal-text-emphasis`, `cal-brand`, etc.) replicates Cal.com's design system. Desktop sidebar + mobile bottom nav matches their responsive layout pattern.
7. **Email via Resend** — Chose Resend for transactional emails (confirmation, cancellation, reschedule) due to its simple API and generous free tier.

---

## License

This project was built as part of an SDE Intern Fullstack Assignment.
