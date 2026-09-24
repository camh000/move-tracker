"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side sign-in check. Offline we can't refresh an expired access
 * token, so we let the user in on the strength of the stored session — all
 * data comes from this device until the connection is back.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = React.useState(false);

  React.useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      const offline = !navigator.onLine;
      const networkError = error && /fetch|network/i.test(error.message);
      if (data.session || offline || networkError) setAllowed(true);
      else router.replace("/login");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (!allowed) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  return <>{children}</>;
}
