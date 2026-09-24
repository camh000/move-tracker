"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { runSync, primeFromServer, outboxSummary } from "@/lib/db/sync";
import { offlinePhotosEnabled, prefetchAllPhotos } from "@/lib/utils/photo-url";
import { createClient } from "@/lib/supabase/client";

interface SyncCounts {
  lastSyncAt: number | null;
  /** Local changes not yet on the server (includes failed). */
  pending: number;
  /** Changes the server rejected — need a retry/discard decision in Settings. */
  failed: number;
}

type SyncStatus =
  | ({ kind: "idle" } & SyncCounts)
  | ({ kind: "syncing" } & SyncCounts)
  | ({ kind: "offline" } & SyncCounts)
  | ({ kind: "error"; message: string } & SyncCounts);

interface SyncEngineCtx {
  status: SyncStatus;
  online: boolean;
  /** Sync now, retrying anything that is waiting on backoff. */
  forceSync: () => Promise<void>;
  /** Re-download everything from the server, then sync. */
  repair: () => Promise<void>;
}

const Ctx = React.createContext<SyncEngineCtx | null>(null);

export function useSyncEngine() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useSyncEngine must be inside SyncEngineProvider");
  return ctx;
}

function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return "Sync failed";
}

export function SyncEngineProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [online, setOnline] = React.useState(true);
  const [counts, setCounts] = React.useState<SyncCounts>({ lastSyncAt: null, pending: 0, failed: 0 });
  const [syncing, setSyncing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const tick = React.useCallback(
    async (opts: { ignoreBackoff?: boolean } = {}) => {
      if (typeof window === "undefined") return;
      const { data } = await createClient().auth.getSession();
      if (!data.session) return;
      // Show queued changes straight away, not only once a sync finishes.
      const s = await outboxSummary();
      setCounts({ lastSyncAt: s.lastSyncAt, pending: s.pending, failed: s.failed });
      if (!navigator.onLine) {
        setOnline(false);
        return;
      }
      setOnline(true);
      setSyncing(true);
      try {
        const result = await runSync(opts);
        setCounts({ lastSyncAt: result.lastSyncAt, pending: result.pending, failed: result.failed });
        setError(result.retryError);
        if (result.changed) await queryClient.invalidateQueries();
        if (offlinePhotosEnabled()) void prefetchAllPhotos();
      } catch (e: unknown) {
        setError(errorMessage(e));
      } finally {
        setSyncing(false);
      }
    },
    [queryClient],
  );

  const repair = React.useCallback(async () => {
    setSyncing(true);
    try {
      await primeFromServer();
      await queryClient.invalidateQueries();
    } finally {
      setSyncing(false);
    }
    await tick({ ignoreBackoff: true });
  }, [queryClient, tick]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const supabase = createClient();

    // runSync does a full pull on a device's first sync and deltas after that.
    // Async: tick() sets state after awaiting, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void tick();

    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void tick();
    });

    const onOnline = () => {
      setOnline(true);
      void tick({ ignoreBackoff: true });
    };
    const onOffline = () => setOnline(false);
    const onFocus = () => void tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    const onTrigger = () => void tick();
    const onRenumbered = (e: Event) => {
      const detail = (e as CustomEvent<{ from: number; to: number }>).detail;
      toast.warning(`Box renumbered from ${detail.from} → ${detail.to}`, {
        description: "Please update the marking on your box.",
        duration: 12_000,
      });
      void queryClient.invalidateQueries();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("trigger-sync", onTrigger);
    window.addEventListener("box-renumbered", onRenumbered as EventListener);

    const intervalId = window.setInterval(() => {
      if (navigator.onLine) void tick();
    }, 30_000);

    return () => {
      authSub.subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("trigger-sync", onTrigger);
      window.removeEventListener("box-renumbered", onRenumbered as EventListener);
      window.clearInterval(intervalId);
    };
  }, [tick, queryClient]);

  const failedMessage =
    counts.failed > 0
      ? `${counts.failed} change${counts.failed === 1 ? "" : "s"} couldn't sync — see Settings`
      : null;

  const status: SyncStatus = !online
    ? { kind: "offline", ...counts }
    : syncing
      ? { kind: "syncing", ...counts }
      : failedMessage || error
        ? { kind: "error", message: (failedMessage ?? error)!, ...counts }
        : { kind: "idle", ...counts };

  const value: SyncEngineCtx = {
    status,
    online,
    forceSync: () => tick({ ignoreBackoff: true }),
    repair,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
