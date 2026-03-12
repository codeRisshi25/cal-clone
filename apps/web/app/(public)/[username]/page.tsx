"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Clock } from "lucide-react";
import type { PublicProfile } from "@cal-clone/types";
import * as api from "@/lib/api";

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getPublicProfile(username);
        setProfile(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "User not found");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [username]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse space-y-4 w-full max-w-md px-4">
          <div className="h-12 w-12 bg-cal-bg-emphasis rounded-full mx-auto" />
          <div className="h-4 w-32 bg-cal-bg-emphasis rounded mx-auto" />
          <div className="space-y-3 mt-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-cal-bg-emphasis rounded-md" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-cal-text-emphasis">404</h1>
          <p className="text-sm text-cal-text-subtle mt-1">{error || "User not found"}</p>
        </div>
      </div>
    );
  }

  const { user, eventTypes } = profile;

  return (
    <div className="flex flex-col items-center px-4 py-16 sm:py-24">
      {/* User info */}
      <div className="flex flex-col items-center mb-8">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="w-16 h-16 rounded-full mb-3"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-cal-bg-emphasis flex items-center justify-center text-xl font-semibold text-cal-text-subtle mb-3">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <h1 className="text-xl font-bold text-cal-text-emphasis">{user.name}</h1>
        <p className="text-sm text-cal-text-subtle mt-0.5">
          {user.timezone?.replace(/_/g, " ")}
        </p>
      </div>

      {/* Event type cards */}
      <div className="w-full max-w-md space-y-3">
        {eventTypes.length === 0 && (
          <p className="text-sm text-cal-text-muted text-center py-8">
            No event types available.
          </p>
        )}

        {eventTypes.map((et) => (
          <Link
            key={et.id}
            href={`/${username}/${et.slug}`}
            className="block border border-cal-border-subtle rounded-md bg-cal-bg p-4 hover:bg-cal-bg-subtle transition-colors group"
          >
            <div className="flex items-start gap-3">
              {/* Color accent bar */}
              <div
                className="w-1 h-12 rounded-full flex-shrink-0 mt-0.5"
                style={{ backgroundColor: et.color }}
              />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-cal-text-emphasis group-hover:text-cal-brand transition-colors">
                  {et.title}
                </h2>
                {et.description && (
                  <p className="text-xs text-cal-text-subtle mt-0.5 line-clamp-2">
                    {et.description}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-2 text-xs text-cal-text-muted">
                  <Clock className="w-3 h-3" />
                  <span>{et.length} min</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Cal Clone branding footer */}
      <p className="mt-12 text-xs text-cal-text-muted">
        Powered by{" "}
        <Link href="/" className="underline hover:text-cal-text-subtle">
          Cal Clone
        </Link>
      </p>
    </div>
  );
}
