import "./dom";
import { vi } from "vitest";
import { mockSupabaseRef } from "@/test/factories/supabase";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabaseRef.current,
}));
