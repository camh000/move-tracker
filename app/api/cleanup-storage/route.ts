import { NextResponse } from "next/server";
import { createClient as createBrowserScopedClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "item-photos";

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
  const { data: photoRows, error: photoErr } = await admin
    .from("item_photos")
    .select("storage_path");
  if (photoErr) {
    return NextResponse.json({ error: photoErr.message }, { status: 500 });
  }
  const liveStoragePaths = new Set(
    (photoRows ?? []).map((r) => r.storage_path).filter((p): p is string => Boolean(p)),
  );

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
  const { data, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw error;
  if (!data) return;

  for (const entry of data) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      // Folder — recurse.
      await walkStorage(admin, fullPath, liveStoragePaths, orphanedPaths);
    } else {
      // File.
      if (!liveStoragePaths.has(fullPath)) orphanedPaths.push(fullPath);
    }
  }
}
