/**
 * Precomputes MobileCLIP text embeddings for the item vocabulary so phones
 * only need the (small) vision half of the model to suggest names from a
 * photo. Re-run after editing lib/items/vocabulary.ts:
 *
 *   node --experimental-strip-types scripts/build-label-embeddings.mts
 *
 * Writes public/models/labels.json (label order) and
 * public/models/label-embeddings.bin (int8, one 512-d unit vector per label,
 * divided by `scale`).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { AutoTokenizer, CLIPTextModelWithProjection } from "@huggingface/transformers";
import { ALL_WORDS } from "../lib/items/vocabulary.ts";

const MODEL_ID = "Xenova/mobileclip_s0";
// A few phrasings per label, averaged: steadier than any single prompt.
const TEMPLATES = [
  "a photo of {}.",
  "a photo of {}, a household item.",
  "a close-up photo of {}.",
  "{} packed for a house move.",
];

const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
const model = await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { dtype: "fp32" });

const labels = ALL_WORDS;
const dim = 512;
const means: Float64Array[] = [];

for (let i = 0; i < labels.length; i++) {
  const texts = TEMPLATES.map((t) => t.replace("{}", labels[i].toLowerCase()));
  const inputs = tokenizer(texts, { padding: "max_length", truncation: true });
  const { text_embeds } = await model(inputs);
  const rows = text_embeds.normalize().tolist() as number[][];
  const mean = new Float64Array(dim);
  for (const row of rows) for (let d = 0; d < dim; d++) mean[d] += row[d];
  const norm = Math.hypot(...mean);
  means.push(mean.map((x) => x / norm));
}

// Unit-vector components are small; scale so the largest one uses the full int8 range.
const scale = 127 / Math.max(...means.map((m) => Math.max(...m.map(Math.abs))));
const out = new Int8Array(labels.length * dim);
means.forEach((m, i) => m.forEach((x, d) => (out[i * dim + d] = Math.round(x * scale))));

mkdirSync("public/models", { recursive: true });
writeFileSync("public/models/labels.json", JSON.stringify({ model: MODEL_ID, dim, scale, labels }));
writeFileSync("public/models/label-embeddings.bin", out);
console.log(`Wrote ${labels.length} label embeddings (${out.byteLength} bytes).`);
