import { NextResponse } from "next/server";
import { createClient as createBrowserScopedClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "item-photos";
const LIST_PAGE = 1000;
const RECENT_UPLOAD_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Removes Storage objects under the calling user's prefix that have no
 * matching `item_photos.storage_path` row in the database.
 *
 * Requires the service role key (server-only env var) to list the bucket.
 */
export async function POST() {
  const userClient = await createBrowserScopedClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: "service role not configured" }, { status: 500 });
  }
  const admin = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Live storage paths from the DB.
  // Page past PostgREST's 1000-row cap — a missed row here would get its
  // photo deleted as an "orphan".
  const liveStoragePaths = new Set<string>();
  for (let from = 0; ; from += LIST_PAGE) {
    const { data: photoRows, error: photoErr } = await admin
      .from("item_photos")
      .select("storage_path")
      .order("id")
      .range(from, from + LIST_PAGE - 1);
    if (photoErr) {
      return NextResponse.json({ error: photoErr.message }, { status: 500 });
    }
    for (const r of photoRows ?? []) if (r.storage_path) liveStoragePaths.add(r.storage_path);
    if ((photoRows ?? []).length < LIST_PAGE) break;
  }

  // Walk the whole bucket — both users share the inventory, so either user
  // is allowed to clean up the other user's uploaded-but-orphaned files.
  const orphanedPaths: string[] = [];
  await walkStorage(admin, "", liveStoragePaths, orphanedPaths);

  if (orphanedPaths.length === 0) {
    return NextResponse.json({ removed: 0 });
  }

  // Remove in batches of 100 (Supabase Storage API limit).
  let removed = 0;
  for (let i = 0; i < orphanedPaths.length; i += 100) {
    const batch = orphanedPaths.slice(i, i + 100);
    const { error } = await admin.storage.from(STORAGE_BUCKET).remove(batch);
    if (error) {
      return NextResponse.json({ error: error.message, removed }, { status: 500 });
    }
    removed += batch.length;
  }

  return NextResponse.json({ removed });
}

async function walkStorage(
  // The Supabase generic-typed client is awkward to thread through; widen here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  prefix: string,
  liveStoragePaths: Set<string>,
  orphanedPaths: string[],
): Promise<void> {
  // list() returns at most `limit` entries per call — page through them.
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await admin.storage
      .from(STORAGE_BUCKET)
      .list(prefix, { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    if (!data?.length) return;

    for (const entry of data) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        // Folder — recurse.
        await walkStorage(admin, fullPath, liveStoragePaths, orphanedPaths);
      } else if (!liveStoragePaths.has(fullPath)) {
        // A photo is uploaded to Storage just before its DB row is inserted;
        // leave recent files alone so we never delete one mid-upload.
        const created = Date.parse(entry.created_at ?? "");
        if (Number.isFinite(created) && Date.now() - created < RECENT_UPLOAD_GRACE_MS) continue;
        orphanedPaths.push(fullPath);
      }
    }
    if (data.length < LIST_PAGE) return;
  }
}
