// Creates the two user accounts using the Supabase Admin API.
// Generates strong random passwords and prints them once.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const EMAILS = ["cameron@bramracing.co.uk", "nova.web29@gmail.com"];

function generatePassword(length = 20) {
  // Strong, URL-safe-ish password — 20 chars, mixed case + digits + a few symbols.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#%*+";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function loadEnv() {
  const src = await readFile(resolve(root, ".env.local"), "utf8");
  const out = {};
  for (const line of src.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const env = await loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env vars");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("\n========== CREDENTIALS — SAVE THESE NOW ==========\n");
  for (const email of EMAILS) {
    // Check if user already exists
    const { data: list } = await supabase.auth.admin.listUsers();
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    let password;
    let action;
    if (existing) {
      // Reset password to a new generated one (idempotent re-run safety)
      password = generatePassword();
      const { error } = await supabase.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });
      if (error) throw error;
      action = "password reset";
    } else {
      password = generatePassword();
      const { error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      action = "created";
    }

    console.log(`  ${email}`);
    console.log(`  password: ${password}`);
    console.log(`  (${action})\n`);
  }
  console.log("===================================================");
  console.log("Save these now — they will not be shown again.");
}

main().catch((err) => {
  console.error("\n✗ user creation failed:", err.message ?? err);
  process.exit(1);
});
