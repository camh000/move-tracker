# Move Tracker

A mobile-first PWA for tracking items packed during a house move. Two users
photograph items and assign them to numbered boxes with destination rooms.
Offline-capable, hosted on Vercel, backed by Supabase.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript strict |
| Styling | Tailwind v4 + shadcn-style components |
| Auth + DB + Storage | Supabase |
| Data fetching | TanStack Query |
| Local DB | Dexie (IndexedDB) — mirrors the server schema |
| PWA / service worker | Serwist |
| Image compression | `browser-image-compression` |
| Forms | React Hook Form + Zod |
| Hosting | Vercel |

## Getting started

### 1. Supabase setup (do this first)

1. Create a new project at [supabase.com](https://supabase.com).
2. **Disable public signup** in *Authentication → Providers → Email* (toggle "Allow new users to sign up" off).
3. Create the two user accounts in *Authentication → Users → Add user*. Use email + password and tick "Auto Confirm User".
4. In *SQL Editor*, paste and run [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql). This creates the schema, RLS policies, the `updated_at` triggers, and seeds the rooms.
5. In *Storage*, create a bucket named `item-photos`, set it to **Private**.
6. Back in *SQL Editor*, run [supabase/migrations/0002_storage.sql](supabase/migrations/0002_storage.sql) to apply storage RLS.
7. Grab your project URL and anon key from *Project Settings → API*.

### 2. Local dev

```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# and SUPABASE_SERVICE_ROLE_KEY in .env.local.

npm install
npm run dev
# http://localhost:3000
```

To regenerate icons (after editing `scripts/gen-icons.mjs`):

```bash
npm run icons
```

### 3. Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project at [vercel.com/new](https://vercel.com/new). Vercel auto-detects Next.js — no extra config needed.
3. Add the three environment variables under *Project → Settings → Environment Variables*, applied to all environments:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy. The first build takes ~2 min.
5. Open the deployed URL on your phone, sign in, then "Add to Home Screen" to install as a PWA.

## How it works

### Auth model
Both users see and edit one shared dataset — RLS policies grant any authenticated user full CRUD. Anonymous users get nothing. Public signup is disabled in the dashboard so the only way new accounts get created is by an admin.

### Offline-first data layer
Every read goes to IndexedDB first (instant). Every write is committed to IndexedDB optimistically and queued in an outbox. The sync engine drains the outbox to Supabase whenever the device is online, then runs a delta pull for anything updated by the other user.

Conflict resolution is **last-write-wins on `updated_at`**. Acceptable for a two-user use case but documented in the in-app *Settings → How sync works* section.

### Box numbering
Box numbers are assigned client-side as `MAX(local box number) + 1`. If two users create a box while offline and a unique-constraint collision happens at sync, the loser is renumbered locally and the user sees a toast: *"Box renumbered from 12 → 14. Please update the marking on your box."*

### Photo flow
- Camera input via `<input type="file" accept="image/*" capture="environment">`.
- Compressed client-side to ≤0.5 MB / 1600px JPEG before upload.
- Stored in Supabase Storage at `{user_id}/{item_id}/{photo_id}.jpg`.
- Read via short-lived signed URLs (the bucket is private).

### PWA shell
Serwist handles the service worker. The app shell is precached so the app boots offline; data is read from IndexedDB.

## Project structure

```
app/
  (auth)/login/                 — login screen
  (app)/                        — auth-gated screens
    page.tsx                    — home (box list)
    box/new/                    — create box
    box/[id]/                   — box detail
    box/[id]/add-item/          — packing screen
    item/[id]/                  — item detail / gallery
    search/                     — search
    settings/                   — rooms, sync, sign out
  sw.ts                         — Serwist service worker source
components/
  ui/                           — shadcn-style primitives
  boxes/, items/, search/, ...  — feature components
  sync/                         — sync engine context + status indicator
lib/
  supabase/                     — browser + server clients, proxy session refresh
  db/dexie.ts                   — IndexedDB schema
  db/sync.ts                    — outbox drain, delta pull, collision handling
  repo/                         — boxes, items, rooms, photos data layer
  utils/                        — image compression, photo URL signing
hooks/                          — useActiveBox, useOnline, useCurrentUser
public/manifest.json + icons/   — PWA assets
supabase/migrations/            — SQL to run in the Supabase SQL editor
scripts/gen-icons.mjs           — regenerate PNG icons from inline SVG
proxy.ts                        — Next.js auth gate (Next 16 proxy convention)
```

## Notes

- Build uses `next build --webpack` because Serwist doesn't yet support Turbopack. Same for `next dev`.
- The first run prefills IndexedDB by pulling everything once after sign-in. After that, only deltas (`updated_at > last_sync_at`) are fetched.
- `proxy.ts` refreshes the Supabase session cookie on every request and gates non-public routes behind auth.

## Out of scope (v1)

Item value field, CSV/PDF export, multiple "moves", bulk operations, in-app
photo editing, undo / trash, push notifications, "forgot password" flow,
per-user data isolation, magic-link auth, custom box numbering schemes.
