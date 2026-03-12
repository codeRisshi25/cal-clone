"use client";

import { useState, useEffect } from "react";
import { Plus, Link2, Clock, Pencil, Trash2, Copy, ExternalLink } from "lucide-react";
import type { EventType, CreateEventTypeBody, UpdateEventTypeBody } from "@cal-clone/types";
import * as api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

  function copyLink(et: EventType) {
    const url = `${window.location.origin}/risshi/${et.slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(et.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-red-500">{error}</p>
        <Button className="mt-4" onClick={loadEventTypes}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Event Types</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create events to share for people to book on your calendar.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          New event type
        </Button>
      </div>

      {/* Empty state */}
      {eventTypes.length === 0 && (
        <div className="text-center py-16 border rounded-lg bg-white">
          <Link2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No event types yet.</p>
          <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
            <Plus className="w-4 h-4" />
            Create your first event type
          </Button>
        </div>
      )}

      {/* Event type cards */}
      <div className="space-y-3">
        {eventTypes.map((et) => (
          <div
            key={et.id}
            className="flex items-center gap-4 bg-white border rounded-lg px-5 py-4 hover:border-gray-300 transition-colors group"
          >
            {/* Color dot */}
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: et.color }}
            />

            {/* Title + meta */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 text-sm">{et.title}</p>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {et.length} min
                </span>
                <span className="flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  /{et.slug}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                title={copiedId === et.id ? "Copied!" : "Copy link"}
                onClick={() => copyLink(et)}
                className="h-8 w-8"
              >
                {copiedId === et.id ? (
                  <span className="text-green-500 text-xs font-medium">✓</span>
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Preview booking page"
                className="h-8 w-8"
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
                className="h-8 w-8"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Delete"
                onClick={() => setDeleteTarget(et)}
                className="h-8 w-8 text-red-400 hover:text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit modal */}
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
                <span className="text-sm text-gray-400 flex-shrink-0">/risshi/</span>
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
                placeholder="A brief description of this event…"
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
                      borderColor: form.color === c ? "black" : "transparent",
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
              {saving ? "Saving…" : editing ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
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
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
