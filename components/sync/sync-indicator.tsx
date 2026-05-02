"use client";

import * as React from "react";
import { CloudCheck, CloudAlert, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { useSyncEngine } from "@/components/sync/sync-engine-provider";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SyncIndicator() {
  const { status, forceSync } = useSyncEngine();
  const [forcing, setForcing] = React.useState(false);

  const tone = (() => {
    switch (status.kind) {
      case "syncing":
        return "text-primary";
      case "offline":
        return "text-destructive";
      case "error":
        return "text-warning";
      case "idle":
      default:
        return status.pending > 0 ? "text-warning" : "text-success";
    }
  })();

  const Icon = (() => {
    switch (status.kind) {
      case "syncing":
        return Loader2;
      case "offline":
        return CloudOff;
      case "error":
        return CloudAlert;
      case "idle":
      default:
        return status.pending > 0 ? CloudAlert : CloudCheck;
    }
  })();

  const label = (() => {
    if (status.kind === "syncing") return "Syncing";
    if (status.kind === "offline") return "Offline";
    if (status.kind === "error") return "Sync issue";
    if (status.pending > 0) return `${status.pending} pending`;
    return "Synced";
  })();

  const lastSyncLabel = status.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Never";

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
            tone,
          )}
          aria-label={`Sync status: ${label}`}
        >
          <Icon className={cn("h-3.5 w-3.5", status.kind === "syncing" && "animate-spin")} />
          <span>{label}</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Sync status</SheetTitle>
          <SheetDescription>
            How your data is moving between this device and the cloud.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <Row label="Status" value={label} />
          <Row label="Pending operations" value={String(status.pending)} />
          <Row label="Last synced" value={lastSyncLabel} />
          {status.kind === "error" && (
            <Row label="Last error" value={status.message} subdued />
          )}
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Button
            onClick={async () => {
              setForcing(true);
              try {
                await forceSync();
              } finally {
                setForcing(false);
              }
            }}
            disabled={forcing || status.kind === "offline"}
            size="lg"
          >
            <RefreshCw className={cn("h-4 w-4", forcing && "animate-spin")} />
            Sync now
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, subdued }: { label: string; value: string; subdued?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium", subdued && "text-xs text-muted-foreground")}>{value}</span>
    </div>
  );
}
