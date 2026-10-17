/// <reference lib="webworker" />
/**
 * Runs MobileCLIP-S0 (vision half) on-device and scores a photo against the
 * precomputed item-vocabulary embeddings. Lives in a worker so the ~25 ms
 * inference and model load never block the UI. See lib/items/photo-suggest.ts.
 */
import {
  AutoImageProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
  type ImageProcessor,
  type PreTrainedModel,
} from "@huggingface/transformers";

export type WorkerRequest = { id: number; type: "warmup" } | { id: number; type: "suggest"; blob: Blob };
export type WorkerResponse =
  | { id: number; ok: true; labels: { label: string; score: number }[] }
  | { id: number; ok: false; error: string };

// Everything is served by the app itself (scripts/fetch-model.mjs); never reach out to the Hub or a CDN.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";
// The service worker caches /models/ and /ort/; a second copy in Cache Storage would just double the space.
env.useBrowserCache = false;
// Otherwise the runtime is re-imported from a blob: URL, which our CSP (rightly) blocks.
env.useWasmCache = false;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = {
    mjs: "/ort/ort-wasm-simd-threaded.mjs",
    wasm: "/ort/ort-wasm-simd-threaded.wasm",
  };
}

interface Labels {
  dim: number;
  scale: number;
  labels: string[];
  embeddings: Int8Array;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

type Loaded = { processor: ImageProcessor; model: PreTrainedModel; labels: Labels };
let ready: Promise<Loaded> | null = null;

function load(): Promise<Loaded> {
  if (ready) return ready;
  const loading = (async () => {
    const [processor, model, meta, bin] = await Promise.all([
      AutoImageProcessor.from_pretrained("mobileclip_s0"),
      CLIPVisionModelWithProjection.from_pretrained("mobileclip_s0", { dtype: "fp16", device: "wasm" }),
      fetch("/models/labels.json").then((r) => r.json()),
      fetch("/models/label-embeddings.bin").then((r) => r.arrayBuffer()),
    ]);
    return { processor, model, labels: { ...meta, embeddings: new Int8Array(bin) } as Labels };
  })();
  ready = loading;
  // Let a failed load (e.g. offline before the model was ever fetched) be retried later.
  loading.catch(() => (ready = null));
  return loading;
}

/** Whole photo plus four overlapping quarters, so a group shot surfaces more than its biggest thing. */
function crops(image: RawImage): Promise<RawImage[]> {
  const { width: w, height: h } = image;
  const cw = Math.round(w * 0.6);
  const ch = Math.round(h * 0.6);
  const boxes = [
    [0, 0],
    [w - cw, 0],
    [0, h - ch],
    [w - cw, h - ch],
  ];
  return Promise.all([image, ...boxes.map(([x, y]) => image.crop([x, y, x + cw - 1, y + ch - 1]))]);
}

async function suggest(blob: Blob) {
  const { processor, model, labels } = await load();
  const image = await RawImage.fromBlob(blob);
  const parts = await crops(image);
  const { image_embeds } = await model(await processor(parts));
  const vectors = image_embeds.normalize().tolist() as number[][];

  const { dim, scale, embeddings } = labels;
  const n = labels.labels.length;
  // Per crop: softmax over the vocabulary (CLIP's usual logit scale of 100),
  // then keep each label's best showing. Quarters count a little less than the whole photo.
  const best = new Float64Array(n);
  vectors.forEach((v, c) => {
    const logits = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let d = 0; d < dim; d++) s += v[d] * embeddings[i * dim + d];
      logits[i] = (100 * s) / scale;
    }
    const max = Math.max(...logits);
    let z = 0;
    for (let i = 0; i < n; i++) z += Math.exp(logits[i] - max);
    const weight = c === 0 ? 1 : 0.8;
    for (let i = 0; i < n; i++) best[i] = Math.max(best[i], (weight * Math.exp(logits[i] - max)) / z);
  });

  return Array.from(best, (score, i) => ({ label: labels.labels[i], score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === "warmup") {
      await load();
      ctx.postMessage({ id: msg.id, ok: true, labels: [] } satisfies WorkerResponse);
    } else {
      const labels = await suggest(msg.blob);
      ctx.postMessage({ id: msg.id, ok: true, labels } satisfies WorkerResponse);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ id: msg.id, ok: false, error } satisfies WorkerResponse);
  }
};
