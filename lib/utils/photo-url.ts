import type { ItemPhotoRow } from "@/lib/db/dexie";
import { createClient } from "@/lib/supabase/client";

const STORAGE_BUCKET = "item-photos";
const SIGNED_TTL = 60 * 60; // 1h
const cache = new Map<string, { url: string; expiresAt: number }>();

export async function getPhotoUrl(photo: ItemPhotoRow): Promise<string | null> {
  if (photo._local_blob) {
    return URL.createObjectURL(photo._local_blob);
  }
  if (!photo.storage_path) return null;
  const cached = cache.get(photo.storage_path);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.url;

  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(photo.storage_path, SIGNED_TTL);
  if (error || !data) return null;
  cache.set(photo.storage_path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_TTL * 1000 });
  return data.signedUrl;
}
