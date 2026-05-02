import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const src = await readFile(resolve(root, ".env.local"), "utf8");
const env = {};
for (const line of src.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?$/);
  if (m) env[m[1]] = m[2];
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await supabase.auth.admin.listUsers();
if (error) throw error;
for (const u of data.users) {
  console.log(JSON.stringify({
    email: u.email,
    confirmed_at: u.confirmed_at,
    email_confirmed_at: u.email_confirmed_at,
    banned_until: u.banned_until,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    role: u.role,
    aud: u.aud,
  }, null, 2));
}
