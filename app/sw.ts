import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

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
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
