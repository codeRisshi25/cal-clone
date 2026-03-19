# cal-clone

a scheduling app inspired by cal.com — create event types, set your availability, and let people book time with you.

## run

update `.env.example` before running

```bash
git clone https://github.com/codeRisshi25/cal-clone.git
cd cal-clone
cp .env.example .env
pnpm install
docker compose -f docker-compose.dev.yml up -d
pnpm db:generate
pnpm db:migrate:dev
pnpm db:seed
pnpm dev
```

frontend runs on `localhost:3000`, api on `localhost:8000`

## video



https://github.com/user-attachments/assets/daddf1a9-7575-4cb8-9b1c-a6d42ebdffe9



## stack

- frontend is next.js 14 (app router) with tailwind and radix ui
- backend is express.js with typescript
- database is postgresql with prisma orm
- caching with redis (slots, profiles, event types)
- monorepo managed with pnpm workspaces + turborepo

## data model

can be found in `packages/db/prisma/schema.prisma`

<img width="3810" height="2350" alt="image" src="https://github.com/user-attachments/assets/2275b1bd-7f80-4255-b3fc-9a0b919ba70b" />

- **User** — the person who owns the calendar (username, email, timezone)
- **EventType** — meeting types (title, slug, duration, color). unique slug per user
- **Schedule** — named availability schedule with timezone
- **Availability** — recurring weekly rules (days[] + start/end time) or date overrides (specific date, optionally blocked)
- **Booking** — a confirmed/cancelled/rescheduled meeting. uses uuid for public urls
- **Attendee** — the person who booked (name, email, timezone). 1:1 with booking

## api

protected routes assume a default logged-in user (no auth — assignment spec)

```
POST   /api/admin/event-types            create event type
GET    /api/admin/event-types            list event types
PUT    /api/admin/event-types/:id        update event type
DELETE /api/admin/event-types/:id        delete event type

GET    /api/admin/availability           get schedules + rules
PUT    /api/admin/availability           update availability
POST   /api/admin/availability/overrides add date override
DELETE /api/admin/availability/overrides/:id remove override

GET    /api/admin/bookings               list bookings (?status=upcoming|past)
POST   /api/admin/bookings/:id/cancel    cancel booking
POST   /api/admin/bookings/:id/reschedule reschedule booking

GET    /api/public/:username             public profile + event types
GET    /api/public/:username/:slug       single event type
GET    /api/public/:username/:slug/slots available slots (?date=&timezone=)
POST   /api/public/:username/:slug/book  create booking
GET    /api/public/bookings/:uid         booking details
POST   /api/public/bookings/:uid/cancel  attendee self-cancel
```

## features

- full crud for event types (title, description, duration, slug, color)
- weekly availability with timezone support
- date overrides (block days or set custom hours)
- public booking page with calendar picker and real-time slot display
- double-booking prevention
- booking cancellation and rescheduling
- **beautiful, responsive HTML email notifications** via resend (confirmation, cancellation, reschedule)
- redis caching with cache invalidation on writes
- dst-aware slot calculation using `Intl.DateTimeFormat`
- responsive design (desktop sidebar + mobile bottom nav)
- **fully automated CI/CD pipeline** (GitHub Actions with integration testing)

## deployment

| | |
|---|---|
| frontend | Vercel CI/CD — [cal-clone-olive.vercel.app](https://cal-clone-olive.vercel.app) |
| backend + db + redis | Azure Container Instances (ACI) |
| continuous integration | GitHub Actions (Auto-tests & built-in PostgreSQL/Redis services) |
| continuous deployment | GitHub Actions (Auto-builds & deploys to Azure on merge to `main`) |
| public booking page | [cal-clone-olive.vercel.app/risshi](https://cal-clone-olive.vercel.app/risshi) |
