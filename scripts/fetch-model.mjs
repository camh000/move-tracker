/**
 * Puts the on-device photo model and its ONNX runtime under public/ so the
 * app serves them itself (no third-party CDN, and the service worker can keep
 * them for offline use). Runs before dev/build; skips files already present.
 *
 *   public/models/mobileclip_s0/  vision half of MobileCLIP-S0 (fp16, ~23 MB)
 *   public/ort/                   onnxruntime-web WASM build (CPU only)
 *   public/vendor/                browser-image-compression, for its Web Worker
 *                                 (it defaults to jsdelivr, which our CSP blocks)
 */
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const MODEL_REPO = "Xenova/mobileclip_s0";
const MODEL_FILES = ["config.json", "preprocessor_config.json", "onnx/vision_model_fp16.onnx"];
const MODEL_DIR = "public/models/mobileclip_s0";
const ORT_FILES = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];
const ORT_DIR = "public/ort";
const VENDOR_DIR = "public/vendor";

const present = (p) => existsSync(p) && statSync(p).size > 0;

for (const file of MODEL_FILES) {
  const dest = path.join(MODEL_DIR, file);
  if (present(dest)) continue;
  const url = `https://huggingface.co/${MODEL_REPO}/resolve/main/${file}`;
  process.stdout.write(`Downloading ${url} ... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log("done");
}

mkdirSync(ORT_DIR, { recursive: true });
for (const file of ORT_FILES) {
  copyFileSync(path.join("node_modules/onnxruntime-web/dist", file), path.join(ORT_DIR, file));
}

mkdirSync(VENDOR_DIR, { recursive: true });
copyFileSync(
  "node_modules/browser-image-compression/dist/browser-image-compression.js",
  path.join(VENDOR_DIR, "browser-image-compression.js"),
);
