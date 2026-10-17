import type { WorkerRequest, WorkerResponse } from "@/lib/items/photo-suggest.worker";

/**
 * Item-name suggestions from a photo, computed on the phone (no API, no
 * tokens). The model (~27 MB with its runtime) is fetched the first time it's
 * needed and kept by the service worker for offline use.
 */

const SETTING_KEY = "movetracker:photo-suggest";

export function photoSuggestEnabled(): boolean {
  try {
    return localStorage.getItem(SETTING_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setPhotoSuggestEnabled(on: boolean) {
  try {
    localStorage.setItem(SETTING_KEY, on ? "on" : "off");
  } catch {}
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: WorkerResponse) => void }>();

function call(req: { type: "warmup" } | { type: "suggest"; blob: Blob }): Promise<WorkerResponse> {
  if (!worker) {
    worker = new Worker(new URL("./photo-suggest.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      pending.get(e.data.id)?.resolve(e.data);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      for (const p of pending.values()) p.resolve({ id: 0, ok: false, error: "Photo model crashed" });
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, { resolve });
    worker!.postMessage({ ...req, id } as WorkerRequest);
  });
}

/** Starts loading the model in the background so the first photo is quick. */
export function warmUpPhotoSuggest() {
  if (!photoSuggestEnabled() || typeof Worker === "undefined") return;
  void call({ type: "warmup" });
}

/** Names that probably match what's in the photo, best first. Empty if unsure or unavailable. */
export async function suggestFromPhoto(blob: Blob): Promise<string[]> {
  if (!photoSuggestEnabled() || typeof Worker === "undefined") return [];
  const res = await call({ type: "suggest", blob });
  if (!res.ok) {
    console.warn("Photo suggestions unavailable:", res.error);
    return [];
  }
  // Always offer the top couple (tapping a wrong one costs nothing), plus
  // anything else the model is reasonably confident about.
  return res.labels
    .filter((l, i) => i < 2 || l.score >= 0.05)
    .slice(0, 6)
    .map((l) => l.label);
}
