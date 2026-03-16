"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Link2,
  Calendar,
  Clock,
  Users,
  Grid3X3,
  GitBranch,
  Zap,
  BarChart3,
  ExternalLink,
  Copy,
  Settings,
  ChevronDown,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef } from "react";
import { resetDatabase } from "@/lib/api";

const mainNav = [
  { href: "/event-types", label: "Event types", icon: Link2 },
  { href: "/bookings", label: "Bookings", icon: Calendar },
  { href: "/availability", label: "Availability", icon: Clock },
  { href: "#", label: "Teams", icon: Users, disabled: true },
  { href: "#", label: "Apps", icon: Grid3X3, disabled: true, hasChevron: true },
  { href: "#", label: "Routing", icon: GitBranch, disabled: true },
  { href: "#", label: "Workflows", icon: Zap, disabled: true },
  { href: "#", label: "Insights", icon: BarChart3, disabled: true, hasChevron: true },
];

const bottomLinks = [
  { href: "/risshi", label: "View public page", icon: ExternalLink, external: true },
  { label: "Copy public page link", icon: Copy, action: "copy" as const },
  { href: "#", label: "Settings", icon: Settings, disabled: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);
  const clickCount = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleVersionClick() {
    clickCount.current += 1;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    if (clickCount.current >= 3) {
      clickCount.current = 0;
      triggerReset();
    } else {
      clickTimer.current = setTimeout(() => { clickCount.current = 0; }, 600);
    }
  }

  async function triggerReset() {
    if (resetting) return;
    if (!confirm("Reset database to seed state?")) return;
    setResetting(true);
    try {
      await resetDatabase();
      window.location.reload();
    } catch {
      alert("Reset failed");
    } finally {
      setResetting(false);
    }
  }

  function copyPublicLink() {
    const url = `${window.location.origin}/risshi`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-[240px] border-r border-cal-border-muted bg-cal-bg-muted min-h-screen">
        {/* User profile area */}
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="w-8 h-8 rounded-full bg-cal-bg-emphasis flex items-center justify-center text-xs font-semibold text-cal-text-emphasis flex-shrink-0">
            R
          </div>
          <span className="text-sm font-medium text-cal-text-emphasis truncate">
            Risshi Raj Sen
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-cal-text-muted ml-auto flex-shrink-0" />
          <button className="p-1 hover:bg-cal-bg-subtle rounded ml-0.5" title="Search">
            <Search className="w-4 h-4 text-cal-text-muted" />
          </button>
        </div>

        {/* Main nav */}
        <nav className="flex flex-col gap-0.5 px-3 flex-1">
          {mainNav.map(({ href, label, icon: Icon, disabled, hasChevron }) => {
            const active = !disabled && pathname.startsWith(href);
            return (
              <Link
                key={label}
                href={disabled ? "#" : href}
                aria-current={active ? "page" : undefined}
                onClick={disabled ? (e) => e.preventDefault() : undefined}
                className={cn(
                  "flex items-center gap-3 px-2 py-1.5 rounded-md text-sm transition-colors",
                  active
                    ? "bg-cal-bg-emphasis text-cal-text-emphasis font-medium"
                    : disabled
                    ? "text-cal-text-muted cursor-default"
                    : "text-cal-text-subtle hover:bg-cal-bg-subtle hover:text-cal-text-emphasis"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {hasChevron && (
                  <ChevronDown className="w-3.5 h-3.5 text-cal-text-muted" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom links */}
        <div className="px-3 pb-3 space-y-0.5">
          {bottomLinks.map((item) => {
            if (item.action === "copy") {
              return (
                <button
                  key={item.label}
                  onClick={copyPublicLink}
                  className="flex items-center gap-3 px-2 py-1.5 rounded-md text-sm text-cal-text-subtle hover:bg-cal-bg-subtle hover:text-cal-text-emphasis transition-colors w-full text-left"
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {copied ? "Copied!" : item.label}
                </button>
              );
            }
            return (
              <Link
                key={item.label}
                href={item.href || "#"}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noreferrer" : undefined}
                onClick={item.disabled ? (e: React.MouseEvent) => e.preventDefault() : undefined}
                className={cn(
                  "flex items-center gap-3 px-2 py-1.5 rounded-md text-sm transition-colors",
                  item.disabled
                    ? "text-cal-text-muted cursor-default"
                    : "text-cal-text-subtle hover:bg-cal-bg-subtle hover:text-cal-text-emphasis"
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}

          <p
            className="text-[10px] text-cal-text-muted px-2 pt-2 select-none cursor-default"
            onClick={handleVersionClick}
          >
            {resetting ? "Resetting..." : "Cal Clone v1.0.0"}
          </p>
        </div>
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────────── */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-cal-border-subtle bg-cal-bg sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-cal-bg-emphasis flex items-center justify-center text-[10px] font-semibold text-cal-text-emphasis">
            R
          </div>
          <span className="font-medium text-sm text-cal-text-emphasis">Cal Clone</span>
        </div>
      </header>

      {/* ── Mobile bottom nav ─────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-cal-border-subtle bg-cal-bg-muted/80 backdrop-blur-md py-2">
        {mainNav.slice(0, 3).map(({ href, label, icon: Icon }) => {
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
