"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Link2, Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/event-types", label: "Event Types", icon: Link2 },
  { href: "/bookings", label: "Bookings", icon: Calendar },
  { href: "/availability", label: "Availability", icon: Clock },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 border-r border-cal-border-muted bg-cal-bg-muted min-h-screen">
        {/* Logo / brand */}
        <div className="flex items-center gap-2 px-4 py-5">
          {/* Cal.com-style dark square logo */}
          <div className="w-8 h-8 bg-cal-brand rounded flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12v2H2zM2 7.5h8v2H2zM2 11h10v2H2z" fill="white" />
            </svg>
          </div>
          <span className="font-semibold text-sm text-cal-text-emphasis tracking-tight">
            Cal Clone
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-0.5 px-3 flex-1 mt-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-2 py-1.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-cal-bg-emphasis text-cal-text-emphasis"
                    : "text-cal-text-subtle hover:bg-cal-bg-subtle hover:text-cal-text-emphasis"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User badge at bottom */}
        <div className="px-4 py-4 border-t border-cal-border-muted">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-cal-bg-emphasis flex items-center justify-center text-xs font-semibold text-cal-text-subtle">
              R
            </div>
            <div className="text-xs min-w-0">
              <p className="font-medium text-cal-text-emphasis truncate">Risshi</p>
              <p className="text-cal-text-muted truncate">risshi</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────────── */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-cal-border-subtle bg-cal-bg sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-cal-brand rounded flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12v2H2zM2 7.5h8v2H2zM2 11h10v2H2z" fill="white" />
            </svg>
          </div>
          <span className="font-semibold text-sm text-cal-text-emphasis">Cal Clone</span>
        </div>
      </header>

      {/* ── Mobile bottom nav (backdrop-blur like Cal.com) ─────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-cal-border-subtle bg-cal-bg-muted/40 backdrop-blur-md py-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 text-[11px] px-3 py-1 rounded-md",
                active
                  ? "text-cal-text-emphasis font-medium"
                  : "text-cal-text-muted"
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
