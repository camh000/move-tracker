import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPhotoUrl } from "./photo-url";
import { installMockSupabase } from "@/test/factories/supabase";
import { makePhoto } from "@/test/factories/rows";

beforeEach(() => {
  installMockSupabase();
});

describe("getPhotoUrl", () => {
  it("returns null when there is no blob and no storage_path", async () => {
    const url = await getPhotoUrl(makePhoto({ storage_path: null, _local_blob: null }));
    expect(url).toBeNull();
  });

  it("returns an object URL for a local blob (skips network)", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const url = await getPhotoUrl(makePhoto({ _local_blob: blob, storage_path: null }));
    expect(url).toMatch(/^blob:/);
  });

  it("calls Supabase Storage to sign the path and caches the result", async () => {
    const path = `signed-${Math.random()}/photo.jpg`;
    const first = await getPhotoUrl(makePhoto({ storage_path: path }));
    expect(first).toMatch(/mock.supabase/);
    expect(first).toContain(encodeURIComponent(path));

    const spy = vi.fn();
    installMockSupabase();
    // Returns from cache without hitting the (new) mock client
    const second = await getPhotoUrl(makePhoto({ storage_path: path }));
    expect(second).toBe(first);
    expect(spy).not.toHaveBeenCalled();
  });
});
