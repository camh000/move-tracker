"use client";

import { Package } from "lucide-react";
import { SyncIndicator } from "@/components/sync/sync-indicator";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur pt-safe">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Package className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Move Tracker</span>
        </div>
        <SyncIndicator />
      </div>
    </header>
  );
}
