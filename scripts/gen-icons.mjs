// Generates colourful PNG app icons from an inline SVG.
// Run once with: node scripts/gen-icons.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "public", "icons");

// SVG: house icon on a colourful gradient backdrop.
const svg = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c5cff"/>
      <stop offset="50%" stop-color="#ff6ec4"/>
      <stop offset="100%" stop-color="#ffb86b"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000" flood-opacity="0.20"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <!-- House silhouette -->
  <g filter="url(#shadow)">
    <!-- Roof -->
    <path d="M256 112 L416 256 L388 256 L388 392 Q388 416 364 416 L148 416 Q124 416 124 392 L124 256 L96 256 Z" fill="#fff"/>
    <!-- Door -->
    <rect x="216" y="296" width="80" height="120" rx="8" fill="#7c5cff"/>
    <circle cx="284" cy="356" r="5" fill="#fff"/>
    <!-- Windows -->
    <rect x="156" y="280" width="44" height="44" rx="6" fill="#ff6ec4"/>
    <rect x="312" y="280" width="44" height="44" rx="6" fill="#ffb86b"/>
  </g>
  <!-- Tracker dot -->
  <circle cx="396" cy="116" r="36" fill="#22c55e" stroke="#fff" stroke-width="6"/>
</svg>`;

async function main() {
  await mkdir(outDir, { recursive: true });
  let sharpMod;
  try {
    sharpMod = await import("sharp");
  } catch {
    console.error("sharp is not installed. Install with `npm i -D sharp` then re-run.");
    process.exit(1);
  }
  const sharp = sharpMod.default;

  for (const size of [192, 512]) {
    const buf = Buffer.from(svg(size));
    const out = resolve(outDir, `icon-${size}.png`);
    await sharp(buf).resize(size, size).png().toFile(out);
    console.log("wrote", out);
  }

  // Apple touch icon
  await sharp(Buffer.from(svg(180)))
    .resize(180, 180)
    .png()
    .toFile(resolve(outDir, "apple-touch-icon.png"));
  console.log("wrote apple-touch-icon");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
