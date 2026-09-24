import { AuthGate } from "@/components/auth/auth-gate";
import { BottomNav } from "@/components/nav/bottom-nav";
import { TopBar } from "@/components/nav/top-bar";

// Static shell: auth is checked on the client so every screen can be
// precached and opened offline. Data is only ever read from IndexedDB or
// Supabase (behind RLS), never rendered on the server.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-svh flex-col">
        <TopBar />
        <main className="flex-1 pb-24 print:pb-0">{children}</main>
        <BottomNav />
      </div>
    </AuthGate>
  );
}
