import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, CacheableResponsePlugin, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    // Box/item pages are one static page each, keyed by ?id=. Ignore `id`
    // when matching so /box?id=<anything> is served from the precached /box
    // shell — including boxes created while offline. (`_rsc` is NOT ignored,
    // so client-side RSC fetches still go to the network / runtime cache.)
    ignoreURLParametersMatching: [/^id$/, /^utm_/, /^fbclid$/],
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Self-hosted assets from scripts/fetch-model.mjs: the on-device photo
    // model and its runtime (~27 MB) and the image compressor's worker script.
    // Fetch once, then serve from cache so they work offline. Filenames are
    // fixed, so a model update means a new filename.
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && ["/models/", "/ort/", "/vendor/"].some((p) => url.pathname.startsWith(p)),
      handler: new CacheFirst({
        cacheName: "self-hosted-assets",
        plugins: [new CacheableResponsePlugin({ statuses: [200] })],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
