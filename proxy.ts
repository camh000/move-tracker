import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, manifest, icons, sw scripts
     * - .well-known
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|sw.js|swe-worker|workbox-|.well-known).*)",
  ],
};
