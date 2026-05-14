import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncIndicator } from "./sync-indicator";

const mockSyncEngine = vi.fn();

vi.mock("./sync-engine-provider", () => ({
  useSyncEngine: () => mockSyncEngine(),
}));

function withState(state: {
  kind: "idle" | "syncing" | "offline" | "error";
  pending?: number;
  lastSyncAt?: number | null;
  message?: string;
}) {
  mockSyncEngine.mockReturnValue({
    status: {
      kind: state.kind,
      pending: state.pending ?? 0,
      lastSyncAt: state.lastSyncAt ?? null,
      ...(state.kind === "error" ? { message: state.message ?? "boom" } : {}),
    },
    online: state.kind !== "offline",
    forceSync: vi.fn(),
  });
}

describe("SyncIndicator", () => {
  it("renders 'Synced' when idle with nothing pending", () => {
    withState({ kind: "idle", pending: 0 });
    render(<SyncIndicator />);
    expect(screen.getByRole("button", { name: /sync status: synced/i })).toBeInTheDocument();
  });

  it("renders '{n} pending' when idle with pending > 0", () => {
    withState({ kind: "idle", pending: 4 });
    render(<SyncIndicator />);
    expect(screen.getByRole("button", { name: /sync status: 4 pending/i })).toBeInTheDocument();
  });

  it("renders 'Offline' when offline", () => {
    withState({ kind: "offline" });
    render(<SyncIndicator />);
    expect(screen.getByRole("button", { name: /sync status: offline/i })).toBeInTheDocument();
  });

  it("renders 'Syncing' when syncing", () => {
    withState({ kind: "syncing" });
    render(<SyncIndicator />);
    expect(screen.getByRole("button", { name: /sync status: syncing/i })).toBeInTheDocument();
  });

  it("renders 'Sync issue' on error", () => {
    withState({ kind: "error", message: "nope" });
    render(<SyncIndicator />);
    expect(screen.getByRole("button", { name: /sync status: sync issue/i })).toBeInTheDocument();
  });
});
