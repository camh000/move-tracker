"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { runSync, primeFromServer } from "@/lib/db/sync";
import { createClient } from "@/lib/supabase/client";

type SyncStatus =
  | { kind: "idle"; lastSyncAt: number | null; pending: number }
  | { kind: "syncing"; lastSyncAt: number | null; pending: number }
  | { kind: "offline"; lastSyncAt: number | null; pending: number }
  | { kind: "error"; lastSyncAt: number | null; pending: number; message: string };

interface SyncEngineCtx {
  status: SyncStatus;
  online: boolean;
  forceSync: () => Promise<void>;
}

const Ctx = React.createContext<SyncEngineCtx | null>(null);

export function useSyncEngine() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useSyncEngine must be inside SyncEngineProvider");
  return ctx;
}

export function SyncEngineProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [online, setOnline] = React.useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [pending, setPending] = React.useState(0);
  const [lastSyncAt, setLastSyncAt] = React.useState<number | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const tick = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }
    setOnline(true);
    setSyncing(true);
    setError(null);
    try {
      const result = await runSync();
      setPending(result.pending);
      setLastSyncAt(result.lastSyncAt);
      if (result.changed) {
        await queryClient.invalidateQueries();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, [queryClient]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    let canceled = false;
    let primedForUser: string | null = null;

    const primeAndSync = async (userId: string) => {
      if (canceled || primedForUser === userId) return;
      primedForUser = userId;
      try {
        await primeFromServer();
        // Prime populates Dexie but tick() sees nothing newer than the
        // freshly stamped last_sync_at, so it won't invalidate queries.
        // Invalidate explicitly here so room/box lists pick up the seed.
        await queryClient.invalidateQueries();
      } catch {
        // continue — initial pull not critical
      }
      if (!canceled) await tick();
    };

    const supabase = createClient();

    // Prime IndexedDB from server on initial mount if user is already signed in
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void primeAndSync(data.user.id);
    });

    // React to sign-in / sign-out happening after mount
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") && session?.user) {
        void primeAndSync(session.user.id);
      } else if (event === "SIGNED_OUT") {
        primedForUser = null;
      }
    });

    const onOnline = () => {
      setOnline(true);
      void tick();
    };
    const onOffline = () => setOnline(false);
    const onFocus = () => void tick();

    const onTrigger = () => void tick();
    const onRenumbered = (e: Event) => {
      const detail = (e as CustomEvent<{ from: number; to: number }>).detail;
      toast.warning(`Box renumbered from ${detail.from} → ${detail.to}`, {
        description: "Please update the marking on your box.",
        duration: 12_000,
      });
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    window.addEventListener("trigger-sync", onTrigger);
    window.addEventListener("box-renumbered", onRenumbered as EventListener);

    const intervalId = window.setInterval(() => {
      if (navigator.onLine) void tick();
    }, 30_000);

    return () => {
      canceled = true;
      authSub.subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("trigger-sync", onTrigger);
      window.removeEventListener("box-renumbered", onRenumbered as EventListener);
      window.clearInterval(intervalId);
    };
  }, [tick]);

  const status: SyncStatus = !online
    ? { kind: "offline", lastSyncAt, pending }
    : syncing
      ? { kind: "syncing", lastSyncAt, pending }
      : error
        ? { kind: "error", lastSyncAt, pending, message: error }
        : { kind: "idle", lastSyncAt, pending };

  const value: SyncEngineCtx = { status, online, forceSync: tick };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
