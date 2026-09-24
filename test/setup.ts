import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import Dexie from "dexie";
import { vi } from "vitest";
import { FakeServer } from "./fake-supabase";
import { __resetDbForTests } from "@/lib/db/dexie";

// Browser globals the sync engine touches.
const events = new EventTarget();
const g = globalThis as unknown as Record<string, unknown>;
g.window = globalThis;
g.addEventListener = events.addEventListener.bind(events);
g.removeEventListener = events.removeEventListener.bind(events);
g.dispatchEvent = events.dispatchEvent.bind(events);
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });

/** The backend + client the code under test currently talks to. */
export const env: { server: FakeServer; client: ReturnType<FakeServer["client"]> } = {
  server: new FakeServer(),
  client: null as never,
};
env.client = env.server.client();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => env.client,
}));

const devices = new Map<string, IDBFactory>();

/**
 * Switch which "phone" the code under test is running on. Each device has its
 * own IndexedDB; all devices share env.server.
 */
export function onDevice(name: string) {
  let factory = devices.get(name);
  if (!factory) {
    factory = new IDBFactory();
    devices.set(name, factory);
  }
  __resetDbForTests();
  Dexie.dependencies.indexedDB = factory;
  env.client = env.server.client(`user-${name}`);
}

export function resetWorld() {
  devices.clear();
  env.server = new FakeServer();
  onDevice("a");
}

export function setOnline(on: boolean) {
  (navigator as { onLine: boolean }).onLine = on;
  env.server.online = on;
}
