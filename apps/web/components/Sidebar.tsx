"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Link2, Calendar, Clock } from "lucide-react";
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
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r bg-white min-h-screen">
        {/* Logo / brand */}
        <div className="flex items-center gap-2 px-4 py-5 border-b">
          <div className="w-8 h-8 bg-black rounded-md flex items-center justify-center">
            <LayoutGrid className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm">Cal Clone</span>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-1 p-3 flex-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User badge at bottom */}
        <div className="px-4 py-4 border-t">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
              R
            </div>
            <div className="text-xs">
              <p className="font-medium text-gray-900">Risshi</p>
              <p className="text-gray-500">risshi</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-white sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-black rounded-md flex items-center justify-center">
            <LayoutGrid className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm">Cal Clone</span>
        </div>
        {/* Mobile bottom nav rendered separately via MobileNav */}
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-white py-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 text-xs px-3 py-1 rounded-md",
                active ? "text-gray-900 font-medium" : "text-gray-400"
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
