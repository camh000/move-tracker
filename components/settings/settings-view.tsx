"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Trash2, Plus, RefreshCw, ChevronDown, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";
import { listRooms, addRoom, deleteRoom } from "@/lib/repo/rooms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db/dexie";
import { createClient } from "@/lib/supabase/client";
import { runCleanup, type CleanupResult } from "@/lib/db/cleanup";
import { useSyncEngine } from "@/components/sync/sync-engine-provider";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SettingsView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { status, forceSync } = useSyncEngine();

  const { data: rooms } = useQuery({ queryKey: ["rooms"], queryFn: () => listRooms() });

  const [newRoom, setNewRoom] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [photoCount, setPhotoCount] = React.useState<number | null>(null);
  const [localPhotoSize, setLocalPhotoSize] = React.useState<string | null>(null);
  const [storageEstimate, setStorageEstimate] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [forcing, setForcing] = React.useState(false);
  const [showHowSync, setShowHowSync] = React.useState(false);
  const [cleaning, setCleaning] = React.useState(false);
  const [cleanupResult, setCleanupResult] = React.useState<CleanupResult | null>(null);

  const refreshStorageStats = React.useCallback(async () => {
    const photos = await db().item_photos.toArray();
    const live = photos.filter((p) => p._deleted !== 1);
    setPhotoCount(live.length);
    const localBytes = live.reduce(
      (acc, p) => acc + (p._local_blob ? p._local_blob.size : 0),
      0,
    );
    setLocalPhotoSize(localBytes > 0 ? formatBytes(localBytes) : "0 B");
    if (typeof navigator !== "undefined" && "storage" in navigator && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      if (est.usage) setStorageEstimate(formatBytes(est.usage));
    }
  }, []);

  React.useEffect(() => {
    void refreshStorageStats();
  }, [refreshStorageStats, status.lastSyncAt]);

  const handleAddRoom = async () => {
    if (!newRoom.trim()) return;
    setAdding(true);
    try {
      await addRoom(newRoom);
      setNewRoom("");
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast.success("Room added");
    } catch {
      toast.error("Could not add room");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!deleteId) return;
    await deleteRoom(deleteId);
    queryClient.invalidateQueries({ queryKey: ["rooms"] });
    setDeleteId(null);
    toast.success("Room removed");
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const lastSyncLabel = status.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleString()
    : "Never";

  return (
    <div className="mx-auto max-w-md px-4 pt-4 pb-12">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>

      {user && (
        <Section title="Account">
          <div className="rounded-xl border bg-card p-4 text-sm">
            <div className="text-muted-foreground">Signed in as</div>
            <div className="font-medium">{user.email}</div>
          </div>
        </Section>
      )}

      <Section title="Rooms">
        <p className="mb-3 text-sm text-muted-foreground">
          Used as destinations when creating boxes.
        </p>
        <div className="rounded-xl border bg-card">
          <ul className="divide-y">
            {rooms?.map((r) => (
              <li key={r.id} className="flex items-center justify-between p-3">
                <span className="text-sm">{r.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setDeleteId(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-3 flex gap-2">
          <Input
            placeholder="New room"
            value={newRoom}
            onChange={(e) => setNewRoom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddRoom()}
          />
          <Button onClick={handleAddRoom} disabled={adding || !newRoom.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </div>
      </Section>

      <Section title="Sync">
        <div className="rounded-xl border bg-card p-4 text-sm">
          <Row label="Status" value={status.kind === "idle" ? (status.pending > 0 ? `${status.pending} pending` : "Synced") : status.kind} />
          <Row label="Pending" value={String(status.pending)} />
          <Row label="Last synced" value={lastSyncLabel} />
        </div>
        <Button
          className="mt-3 w-full"
          variant="outline"
          onClick={async () => {
            setForcing(true);
            try {
              await forceSync();
              toast.success("Sync triggered");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Sync failed");
            } finally {
              setForcing(false);
            }
          }}
          disabled={forcing}
        >
          {forcing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sync now
        </Button>

        <button
          type="button"
          className="mt-4 flex w-full items-center justify-between text-left text-sm font-medium"
          onClick={() => setShowHowSync((v) => !v)}
        >
          How sync works
          <ChevronDown className={`h-4 w-4 transition-transform ${showHowSync ? "rotate-180" : ""}`} />
        </button>
        {showHowSync && (
          <div className="mt-2 space-y-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p>Move Tracker is offline-first. Every change is saved on this device first, then queued for the cloud.</p>
            <p>If you and the other user edit the same item while offline, the most recent edit wins when you both come back online — earlier changes to that field are overwritten.</p>
            <p>If you both create a box at the same time, the second one's number may shift after sync; you'll see a notice and can update the marking on the box.</p>
          </div>
        )}
      </Section>

      <Section title="Storage">
        <div className="rounded-xl border bg-card p-4 text-sm">
          <Row label="Photos" value={photoCount?.toString() ?? "—"} />
          <Row label="Photos waiting to upload" value={localPhotoSize ?? "—"} />
          <Row
            label="App + data on device"
            value={storageEstimate ?? "—"}
            hint="Includes the Move Tracker app itself plus your local copy of the inventory and any pending photos."
          />
        </div>

        <Button
          className="mt-3 w-full"
          variant="outline"
          onClick={async () => {
            setCleaning(true);
            setCleanupResult(null);
            try {
              const result = await runCleanup();
              setCleanupResult(result);
              await refreshStorageStats();
              queryClient.invalidateQueries();
              const total = result.localPhotos + result.localItems + result.localBoxes + result.storageObjects;
              if (total === 0) {
                toast.success("Nothing to clean up");
              } else {
                toast.success(
                  `Cleaned ${result.localPhotos} photos, ${result.localItems} items, ${result.localBoxes} boxes, ${result.storageObjects} files`,
                );
              }
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Cleanup failed");
            } finally {
              setCleaning(false);
            }
          }}
          disabled={cleaning}
        >
          {cleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Clean up orphaned data
        </Button>
        {cleanupResult && (
          <p className="mt-2 text-xs text-muted-foreground">
            Last cleanup: {cleanupResult.localPhotos + cleanupResult.localItems + cleanupResult.localBoxes} local
            row{cleanupResult.localPhotos + cleanupResult.localItems + cleanupResult.localBoxes === 1 ? "" : "s"} ·{" "}
            {cleanupResult.storageObjects} Storage file{cleanupResult.storageObjects === 1 ? "" : "s"}
          </p>
        )}
      </Section>

      <Section title="Account actions">
        <Button variant="outline" className="w-full text-destructive" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </Section>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this room?</DialogTitle>
            <DialogDescription>
              Existing boxes that use this room are unaffected. You just won't see it in the picker.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteRoom}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b py-2 last:border-b-0 last:pb-0 first:pt-0">
      <span className="flex items-center gap-1 text-muted-foreground" title={hint}>
        {label}
        {hint && <Info className="h-3 w-3 opacity-60" aria-hidden="true" />}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
