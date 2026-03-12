"use client";

import { useState, useEffect } from "react";
import { Plus, Link2, Clock, Pencil, Trash2, Copy, ExternalLink } from "lucide-react";
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

// Preset color swatches for event type creation
const COLOR_SWATCHES = [
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#10b981", // emerald
  "#f43f5e", // rose
  "#6366f1", // indigo
  "#ec4899", // pink
  "#14b8a6", // teal
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

// Auto-generate a URL-safe slug from the title
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

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventType | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<EventType | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Copied slug feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadEventTypes();
  }, []);

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
  }

  function handleTitleChange(val: string) {
    // Auto-fill slug only when creating (not editing, to avoid breaking existing links)
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

  // Toggle isActive on the event type (show/hide from public page)
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
      <div className="p-6 md:p-8 max-w-4xl">
        <div className="animate-pulse space-y-0 border border-cal-border-subtle rounded-md overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[72px] bg-cal-bg-subtle border-b border-cal-border-subtle last:border-0" />
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
    <div className="p-6 md:p-8 max-w-4xl">
      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-cal-text-emphasis">Event Types</h1>
          <p className="text-sm text-cal-text-subtle mt-0.5">
            Create events to share for people to book on your calendar.
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          New
        </Button>
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

      {/* ── Unified list (Cal.com style) ─────────────────────────── */}
      {eventTypes.length > 0 && (
        <div className="border border-cal-border-subtle rounded-md overflow-hidden bg-cal-bg divide-y divide-cal-border-subtle">
          {eventTypes.map((et) => (
            <div
              key={et.id}
              className="flex w-full items-center justify-between px-4 sm:px-6 py-4 hover:bg-cal-bg-muted transition-colors group"
            >
              {/* Left: color bar + info */}
              <div className="flex items-center gap-4 min-w-0 flex-1">
                {/* Thin vertical color bar (Cal.com style, not a circle) */}
                <div
                  className="w-1 h-8 rounded-full flex-shrink-0"
                  style={{ backgroundColor: et.color }}
                />

                <div className="min-w-0 flex-1">
                  {/* Title + slug inline */}
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-cal-text-emphasis truncate">
                      {et.title}
                    </p>
                    <span className="text-xs text-cal-text-muted hidden sm:inline">
                      /{et.slug}
                    </span>
                  </div>
                  {/* Duration */}
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-cal-text-subtle">
                    <Clock className="w-3 h-3" />
                    <span>{et.length}m</span>
                  </div>
                </div>
              </div>

              {/* Right: actions + toggle */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Action buttons — show on hover (desktop), always visible on mobile */}
                <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={copiedId === et.id ? "Copied!" : "Copy link"}
                    onClick={() => copyLink(et)}
                    className="h-8 w-8 text-cal-text-subtle hover:text-cal-text-emphasis"
                  >
                    {copiedId === et.id ? (
                      <span className="text-emerald-500 text-xs font-medium">✓</span>
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Preview"
                    className="h-8 w-8 text-cal-text-subtle hover:text-cal-text-emphasis"
                    asChild
                  >
                    <a href={`/risshi/${et.slug}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Edit"
                    onClick={() => openEdit(et)}
                    className="h-8 w-8 text-cal-text-subtle hover:text-cal-text-emphasis"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    onClick={() => setDeleteTarget(et)}
                    className="h-8 w-8 text-destructive/60 hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Divider */}
                <div className="hidden sm:block w-px h-6 bg-cal-border-subtle mx-1" />

                {/* Show/hide toggle (Cal.com has this on every row) */}
                <Switch
                  checked={et.isActive}
                  onCheckedChange={() => handleToggleActive(et)}
                  aria-label={et.isActive ? "Hide event type" : "Show event type"}
                />
              </div>
            </div>
          ))}
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
                      borderColor: form.color === c ? "hsl(var(--cal-brand))" : "transparent",
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
