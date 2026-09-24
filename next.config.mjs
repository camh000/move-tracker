import { randomUUID } from "node:crypto";
import withSerwistInit from "@serwist/next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseHost = (() => {
  try {
    return supabaseUrl ? new URL(supabaseUrl).origin : "";
  } catch {
    return "";
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: new URL(supabaseHost).hostname,
            pathname: "/storage/v1/object/sign/**",
          },
        ]
      : [],
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: " + supabaseHost,
      "font-src 'self' data:",
      "connect-src 'self' " + supabaseHost + " " + (supabaseHost ? supabaseHost.replace("https://", "wss://") : ""),
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
        ],
      },
    ];
  },
};

// Every app screen is a static shell; precache them all so any screen opens
// offline, even one never visited on this device. Revision changes per build
// so a new deploy refreshes them.
const buildRevision = process.env.VERCEL_GIT_COMMIT_SHA || randomUUID();
const appShellRoutes = [
  "/",
  "/login",
  "/box",
  "/box/new",
  "/box/add-item",
  "/item",
  "/search",
  "/arrival",
  "/labels",
  "/settings",
];

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  // Reloading on reconnect would wipe a half-filled add-item form (photo and
  // all). The sync engine already picks up the reconnect by itself.
  reloadOnOnline: false,
  additionalPrecacheEntries: appShellRoutes.map((url) => ({ url, revision: buildRevision })),
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
