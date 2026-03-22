# 🖥️ Chapter 3: The Frontend (Next.js & React)

The frontend in `apps/web` is a modern web application built using **Next.js 14** with the **App Router**, which introduces a revolutionary concept in React: **Server Components vs Client Components**.

---

## 🌍 The Next.js App Router Paradigm

When explaining the UI, emphasize: "Our Next.js app is highly optimized because we strictly separate SSR (Server-Side Rendering) from Client interactive components."

### Server Components (The Default)
By default in the App Router, every file (like `page.tsx`) renders on the **Server**. 
- They CANNOT use `useState`, `onClick`, or browser APIs like `window`.
- *Why is this good?* Server components are incredibly fast, they keep your client-side JavaScript bundle tiny because none of their logic is sent to the user's browser (only the final HTML), and they have perfect SEO (Search Engine Optimization).
- Look at `app/risshi/[slug]/page.tsx` (the Public Booking Page). It fetches the `EventType` details directly on the server before the browser even paints the screen.

### Client Components (`"use client"`)
Whenever we need user interactivity—like a button click, a calendar selection state, or handling form inputs—we extract that specific isolated part into a separate file and add `'use client'` at the very top.
- Look at the forms in your dashboard (e.g., `AvailabilitySettingsForm.tsx` or the public `BookingForm`).
- By keeping the heavy Lifting (layout, headers) as Server Components, and ONLY the forms as Client Components, our Application feels instantly responsive.

---

## 🎨 Styling with Tailwind CSS and Radix UI

You aren't writing traditional `style.css` files. Instead, you are using utility classes via **Tailwind CSS**.

```tsx
<div className="flex flex-col items-center justify-center p-4 bg-gray-50 border rounded-lg shadow-sm">
  <h1 className="text-2xl font-bold text-gray-900">Book a Meeting</h1>
</div>
```
Tailwind makes it impossible to break other components (no cascading styling conflicts) and naturally leads to a unified design system.

### Radix UI
Building accessible UI elements like Modals, Dialogs, Dropdowns, and Select Menus from scratch is extremely difficult (keyboard navigation, screen reader support (`aria`), focus trapping).
**Radix UI** provides the functional logic for these components, but gives us **0% styling**. We then inject our own Tailwind classes into them to make them match our theme perfectly!

---

## 🔄 How the Frontend talks to the Backend

If you notice, the frontend does NOT use Prisma directly! The frontend code (React) never touches the database. 

Instead, it makes standard HTTP requests to our Express server (`localhost:8000` / `calclone-api...`) using the browser's native `fetch` API.

**Example from the Public Booking Page:**
When checking for time slots, the React component triggers an API call whenever the user clicks a `Date` on the calendar:

```typescript
// Calling the Express Backend Route
const res = await fetch(`${API_URL}/api/public/${username}/${slug}/slots?date=${dateStr}&timezone=${tz}`);
const slots = await res.json();
```

*Interview Scenario:* "Why didn't you just use Next.js built-in API Routes?"
"We chose a decoupled architecture. If our scheduling system succeeds, we might want to release an iOS App (React Native). The mobile app can just hit the exact same Express endpoints that the web app uses, whereas extracting logic directly embedded inside Next.js API Routes is far messier."
