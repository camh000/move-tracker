// One-shot Supabase setup runner.
// Reads .env.local, runs both SQL migrations against POSTGRES_URL,
// and ensures the `item-photos` storage bucket exists.
// Designed to be idempotent — safe to re-run.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const envFile = resolve(root, ".env.local");
  return readFile(envFile, "utf8").then((src) => {
    const out = {};
    for (const line of src.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  });
}

async function runSql(client, label, sqlPath) {
  const sql = await readFile(sqlPath, "utf8");
  console.log(`\n— Running ${label} ...`);
  await client.query(sql);
  console.log(`✓ ${label} applied`);
}

async function ensureBucket(supabase, name) {
  const { data: list, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw listErr;
  const exists = list?.some((b) => b.name === name);
  if (exists) {
    console.log(`✓ bucket "${name}" already exists`);
    return;
  }
  const { error } = await supabase.storage.createBucket(name, { public: false });
  if (error) throw error;
  console.log(`✓ created private bucket "${name}"`);
}

async function main() {
  const env = await loadEnv();
  const dbUrl = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL;
  if (!dbUrl) throw new Error("POSTGRES_URL not found in .env.local");
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase URL or service role key missing from .env.local");
  }

  // Supabase pooler presents a self-signed cert chain; we bypass verification for this admin script only.
  const url = new URL(dbUrl);
  url.searchParams.set("sslmode", "no-verify");
  const client = new pg.Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await runSql(client, "0001_init.sql", resolve(root, "supabase/migrations/0001_init.sql"));
    await runSql(client, "0002_storage.sql", resolve(root, "supabase/migrations/0002_storage.sql"));
  } finally {
    await client.end();
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await ensureBucket(supabase, "item-photos");

  console.log("\nAll done.");
}

main().catch((err) => {
  console.error("\n✗ setup failed:", err.message ?? err);
  process.exit(1);
});
