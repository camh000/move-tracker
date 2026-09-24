import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Hit daily by a Vercel cron (vercel.json). Free-tier Supabase projects pause
 * after about a week with no activity — easy to hit in the gap between packing
 * and moving day. One tiny query a day keeps the project awake.
 *
 * Uses the anon key: RLS returns no rows, but the query still reaches Postgres.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await supabase.from("rooms").select("id").limit(1);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
