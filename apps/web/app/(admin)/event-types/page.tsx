"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Link2,
  Clock,
  Pencil,
  Trash2,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Search,
} from "lucide-react";
import type { EventType, CreateEventTypeBody, UpdateEventTypeBody } from "@cal-clone/types";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const COLOR_SWATCHES = [
  "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981",
  "#f43f5e", "#6366f1", "#ec4899", "#14b8a6",
];

type FormState = {
  title: string;
  slug: string;
  description: string;
  length: string;
  color: string;
};

const emptyForm: FormState = {
  title: "",
  slug: "",
  description: "",
  length: "30",
  color: COLOR_SWATCHES[0],
};

function toSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function EventTypesPage() {
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventType | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<EventType | null>(null);
  const [deleting, setDeleting] = useState(false);

  // More menu state
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Copied slug feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return eventTypes;
    const q = search.toLowerCase();
    return eventTypes.filter(
      (et) =>
        et.title.toLowerCase().includes(q) ||
        et.slug.toLowerCase().includes(q)
    );
  }, [eventTypes, search]);

  useEffect(() => {
    loadEventTypes();
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    function close() { setMenuOpenId(null); }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpenId]);

  async function loadEventTypes() {
    try {
      setLoading(true);
      const data = await api.getEventTypes();
      setEventTypes(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load event types");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(et: EventType) {
    setEditing(et);
    setForm({
      title: et.title,
      slug: et.slug,
      description: et.description || "",
      length: String(et.length),
      color: et.color,
    });
    setModalOpen(true);
    setMenuOpenId(null);
  }

  function handleTitleChange(val: string) {
    if (!editing) {
      setForm((f) => ({ ...f, title: val, slug: toSlug(val) }));
    } else {
      setForm((f) => ({ ...f, title: val }));
    }
  }

  async function handleSave() {
    if (!form.title || !form.slug) return;
    setSaving(true);
    try {
      if (editing) {
        const body: UpdateEventTypeBody = {
          title: form.title,
          slug: form.slug,
          description: form.description || undefined,
          length: parseInt(form.length, 10),
          color: form.color,
        };
        const updated = await api.updateEventType(editing.id, body);
        setEventTypes((prev) => prev.map((et) => (et.id === updated.id ? updated : et)));
      } else {
        const body: CreateEventTypeBody = {
          title: form.title,
          slug: form.slug,
          description: form.description || undefined,
          length: parseInt(form.length, 10),
          color: form.color,
        };
        const created = await api.createEventType(body);
        setEventTypes((prev) => [...prev, created]);
      }
      setModalOpen(false);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteEventType(deleteTarget.id);
      setEventTypes((prev) => prev.filter((et) => et.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleActive(et: EventType) {
    try {
      const updated = await api.updateEventType(et.id, { isActive: !et.isActive });
      setEventTypes((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Toggle failed");
    }
  }

  function copyLink(et: EventType) {
    const url = `${window.location.origin}/risshi/${et.slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(et.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // ── Loading skeleton ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="mb-8">
          <div className="h-7 w-36 bg-cal-bg-subtle rounded animate-pulse" />
          <div className="h-4 w-80 bg-cal-bg-subtle rounded animate-pulse mt-2" />
        </div>
        <div className="animate-pulse border border-cal-border-subtle rounded-md overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[76px] bg-cal-bg border-b border-cal-border-subtle last:border-0" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────
  if (error) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-destructive text-sm">{error}</p>
        <Button className="mt-4" onClick={loadEventTypes}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cal-text-emphasis">Event types</h1>
          <p className="text-sm text-cal-text-subtle mt-1">
            Configure different events for people to book on your calendar.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cal-text-muted" />
            <input
              type="text"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-48 rounded-md border border-cal-border-subtle bg-cal-bg pl-9 pr-3 text-sm text-cal-text-emphasis placeholder:text-cal-text-muted focus:outline-none focus:ring-1 focus:ring-cal-text-muted"
            />
          </div>
          <Button onClick={openCreate} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />
            New
          </Button>
        </div>
      </div>

      {/* ── Empty state ──────────────────────────────────────────── */}
      {eventTypes.length === 0 && (
        <div className="text-center py-16 border border-cal-border-subtle rounded-md bg-cal-bg">
          <Link2 className="w-10 h-10 text-cal-text-muted mx-auto mb-3" />
          <p className="text-cal-text-subtle text-sm">No event types yet.</p>
          <Button onClick={openCreate} variant="outline" size="sm" className="mt-4 gap-1.5">
            <Plus className="w-4 h-4" />
            Create your first event type
          </Button>
        </div>
      )}

      {/* ── Event types list ─────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="border border-cal-border-subtle rounded-md overflow-hidden bg-cal-bg divide-y divide-cal-border-subtle">
          {filtered.map((et) => (
            <div
              key={et.id}
              className="flex w-full items-center justify-between px-5 py-4 hover:bg-cal-bg-subtle transition-colors group"
            >
              {/* Left: info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-cal-text-emphasis truncate">
                    {et.title}
                  </p>
                  <span className="text-xs text-cal-text-muted font-normal">
                    /risshi/{et.slug}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="inline-flex items-center gap-1 text-xs text-cal-text-subtle bg-cal-bg-emphasis rounded px-1.5 py-0.5">
                    <Clock className="w-3 h-3" />
                    {et.length}m
                  </span>
                </div>
              </div>

              {/* Right: hidden label + toggle + action buttons + more menu */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Hidden label */}
                {!et.isActive && (
                  <span className="text-xs text-cal-text-muted mr-1">Hidden</span>
                )}

                {/* Toggle */}
                <Switch
                  checked={et.isActive}
                  onCheckedChange={() => handleToggleActive(et)}
                  aria-label={et.isActive ? "Hide event type" : "Show event type"}
                />

                {/* Preview */}
                <Button
                  variant="ghost"
                  size="icon"
                  title="Preview"
                  className="h-8 w-8 text-cal-text-muted hover:text-cal-text-emphasis"
                  asChild
                >
                  <a href={`/risshi/${et.slug}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </Button>

                {/* Copy link */}
                <Button
                  variant="ghost"
                  size="icon"
                  title={copiedId === et.id ? "Copied!" : "Copy link"}
                  onClick={() => copyLink(et)}
                  className="h-8 w-8 text-cal-text-muted hover:text-cal-text-emphasis"
                >
                  {copiedId === et.id ? (
                    <span className="text-emerald-400 text-xs font-medium">✓</span>
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </Button>

                {/* More menu */}
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-cal-text-muted hover:text-cal-text-emphasis"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === et.id ? null : et.id);
                    }}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>

                  {menuOpenId === et.id && (
                    <div
                      className="absolute right-0 top-full mt-1 w-36 rounded-md border border-cal-border-subtle bg-cal-bg-subtle shadow-lg z-20 py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => openEdit(et)}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-cal-text hover:bg-cal-bg-emphasis transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setDeleteTarget(et);
                          setMenuOpenId(null);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-400 hover:bg-cal-bg-emphasis transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No search results */}
      {search && filtered.length === 0 && eventTypes.length > 0 && (
        <div className="text-center py-12 border border-cal-border-subtle rounded-md bg-cal-bg">
          <p className="text-cal-text-subtle text-sm">No event types matching &ldquo;{search}&rdquo;</p>
        </div>
      )}

      {/* ── Create / Edit modal ──────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit event type" : "New event type"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="et-title">Title</Label>
              <Input
                id="et-title"
                placeholder="Quick Sync"
                value={form.title}
                onChange={(e) => handleTitleChange(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="et-slug">URL slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-cal-text-muted flex-shrink-0">/risshi/</span>
                <Input
                  id="et-slug"
                  placeholder="quick-sync"
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, slug: toSlug(e.target.value) }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="et-description">Description (optional)</Label>
              <Textarea
                id="et-description"
                placeholder="A brief description of this event..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="et-length">Duration (minutes)</Label>
              <Input
                id="et-length"
                type="number"
                min={5}
                max={480}
                step={5}
                value={form.length}
                onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className="w-7 h-7 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: form.color === c ? "#ffffff" : "transparent",
                      transform: form.color === c ? "scale(1.15)" : "scale(1)",
                    }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.title || !form.slug}>
              {saving ? "Saving..." : editing ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ──────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this event type and all its bookings. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
