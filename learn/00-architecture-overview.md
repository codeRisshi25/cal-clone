# 🏛️ Chapter 0: Architecture Overview

Welcome to the Cal-Clone project! As a senior developer, if I were explaining this to a new intern, I'd say: **"This is a modern, scalable scheduling application designed to be as close to production-ready as possible."**

The goal of this project is to allow users to set up a profile, define their weekly availability, create "Event Types" (like a 30-min Introduction Call), and let the public book slots on their calendar.

---

## 🏗️ 1. The Monorepo Structure (Turborepo)

Take a look at your folder structure. You don't just have one big `src` folder. Instead, you have `apps/` and `packages/`. This is called a **Monorepo** (Monolithic Repository), managed by a tool called **Turborepo** (via `pnpm workspaces`).

### Why did we choose a Monorepo?
**Tradeoff:** A standard standalone React app is easier to set up initially, but as a company grows, you might want to share code (like database schemas or TypeScript types) between different services (e.g., a web app, a mobile app, and a backend API).
**Solution:** By using a monorepo, we separate our code into decoupled packages, but we keep them all in one GitHub repository. If you change a database model in `packages/db`, both `apps/web` and `apps/api` instantly know about the new type!

### Directory Breakdown
1. **`apps/web` (Next.js)**: Your frontend. It handles the UI, client-side routing, and rendering exactly what the user sees.
2. **`apps/api` (Express.js)**: Your backend server. It handles the heavy business logic, talks to the database, caches data, and sends emails.
3. **`packages/db` (Prisma + Postgres)**: The single source of truth for your database. It defines the tables (`schema.prisma`) and exports the auto-generated Prisma Client.
4. **`packages/types`**: Shared TypeScript definitions. If the frontend and backend need to agree on what a "BookingPayload" looks like, it lives here.

---

## ⚡ 2. The Core Tech Stack

When the interviewer asks "What stack did you use and why?", here's how you answer:

- **Frontend:** Next.js 14 (App Router) with Tailwind CSS and Radix UI.
  - *Why?* Next.js provides excellent SEO and fast initial page loads (Server-Side Rendering). Tailwind allows for rapid, consistent styling without leaving the HTML. Radix UI gives us accessible, unstyled primitives (like Dialogs and Popovers) that we style ourselves.
- **Backend:** Node.js with Express and TypeScript.
  - *Why?* Express is lightweight, unopinionated, and industry-standard. Using TypeScript across the entire stack prevents entire classes of runtime errors (e.g., trying to read `user.firstName` when the database only has `user.name`).
- **Database:** PostgreSQL accessed via Prisma ORM.
  - *Why?* PostgreSQL is robust and handles relational data beautifully. Prisma gives us incredible developer experience—it generates full TypeScript types based on our schema, meaning if we misspell a column name in our code, the app won't even compile.
- **Caching:** Redis.
  - *Why?* Hitting the database for every single user request (especially checking someone's availability) is slow. We use Redis to temporarily store the results in memory.
- **Email Delivery:** Resend.
  - *Why?* Resend is modern, fast, and highly reliable compared to older services like SendGrid or SMTP servers.

---

## 🔄 3. How Data Flows (The "What Happens When" Example)

Let's walk through exactly what happens when someone clicks **"Confirm Booking"** on the website:

1. **Client (Web)**: The user hits "Confirm" on `apps/web`. Next.js sends an HTTP POST request to your Express server (`apps/api`).
2. **API (Express)**: Your `POST /api/public/:username/:slug/book` route catches the request.
3. **Database (Prisma)**: Prisma queries PostgreSQL to find the user and their exact schedule to make sure the slot wasn't booked by someone else a second ago (Double-Booking Prevention).
4. **Mutation**: Prisma creates a new row in the `Booking` table and a row in the `Attendee` table.
5. **Cache Invalidation (Redis)**: The backend deletes the cached "available slots" for that day in Redis so the next person who visits the page doesn't see that slot as open.
6. **Async Task (Resend)**: The system fires off an email to both the host and the attendee using the Resend API.
7. **Response**: The backend sends a `201 Created` confirmation back to the frontend, and the frontend redirects the user to the "Success" page.

---

### Interview Tip 💡
If asked: *"Why did you separate the frontend and backend? Next.js has built-in API routes, couldn't you just use those?"*
**Your Answer:** "Yes, Next.js can act as a full-stack framework. However, separating them into a Next.js frontend and an Express backend allows us to scale them independently. If our background email jobs or heavy calendar computations start slowing down the server, our React UI doesn't suffer. It also makes it trivial to build a native mobile app later, as the mobile app can just hit the existing Express API without dealing with Next.js."
