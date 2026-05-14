import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach, beforeEach } from "vitest";
import { __resetDbForTests } from "@/lib/db/dexie";

if (typeof URL.createObjectURL === "undefined") {
  let counter = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: () => `blob:mock/${++counter}`,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
}

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

afterEach(async () => {
  __resetDbForTests();
  const indexedDB = globalThis.indexedDB;
  if (!indexedDB) return;
  const dbs = (await indexedDB.databases?.()) ?? [];
  await Promise.all(
    dbs.map(
      (info) =>
        new Promise<void>((resolve) => {
          if (!info.name) return resolve();
          const req = indexedDB.deleteDatabase(info.name);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        }),
    ),
  );
});
