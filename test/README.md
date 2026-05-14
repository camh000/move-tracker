# Testing

Layered suite. See `/root/.claude/plans/full-plan-please-ultrathink-validated-brook.md` for the strategy doc.

## Running

```sh
npm test               # full run, jsdom + fake-indexeddb + Supabase mock
npm run test:watch     # watch mode
npm run test:coverage  # coverage report
```

The Vitest config is at `vitest.config.ts`. All tests use `jsdom` + `fake-indexeddb` and have `@/lib/supabase/client` mocked via `test/setup/sync.ts`. Tests live next to the code they cover (`lib/db/sync.test.ts` next to `lib/db/sync.ts`).

## Writing a new test

- **Pure logic** (Zod schemas, helpers): a `.test.ts` next to the source. Import the function, exercise it, assert.
- **Anything touching Dexie**: import `db` from `@/lib/db/dexie`. Each test gets a fresh DB — the setup file resets the singleton and clears IndexedDB between tests.
- **Anything touching `lib/db/sync.ts`**: import `installMockSupabase` from `@/test/factories/supabase` in `beforeEach` to set initial table state, user, and failure injections. Then drive via `runSync()` or `drainOutbox()`.
- **Row factories**: `@/test/factories/rows` exports `makeBox`, `makeItem`, `makePhoto`, `makeRoom`, `makeOutboxEntry`.

## Supabase mock — failure injection

```ts
state.failures.push({
  table: "boxes",
  op: "insert",
  rowId: "box-a",          // optional — match only operations on this id
  times: 1,                // how many matching ops will fail before reverting to success
  error: { code: "23505", message: "duplicate key" },
});
```

`code` matters — `processEntry` branches on `error.code === "23505"` to trigger the box renumber retry loop.

## What's *not* tested here

- **Server components** (`app/(app)/**/page.tsx`): no public RSC testing API. Cover via Playwright (week 3).
- **`proxy.ts` middleware**: Node-runtime-bound and tightly coupled to Next internals. Cover via Playwright.
- **Service worker** (`app/sw.ts`): disabled when `NODE_ENV === 'test'` via `next.config.mjs`. Real SW behavior is covered by Playwright.
- **`app/api/cleanup-storage/route.ts`**: uses service role; cover via Playwright against the local Supabase stack.

## Known limitations

- `fake-indexeddb` in jsdom does not round-trip jsdom's `Blob` class identity (returns a structured-clone object, not a `Blob` instance). Production code paths that hand the value to Supabase Storage still work because the mock storage accepts any value. End-to-end Blob fidelity is covered by Playwright.
- Dexie `update({ field: 0 })` and `update({ field: null })` on an indexed column may return `undefined` on subsequent `get()` under fake-indexeddb. Assertions use behavioral matchers (`toBeFalsy()`, `.not.toBe(1)`) instead of strict equality.
