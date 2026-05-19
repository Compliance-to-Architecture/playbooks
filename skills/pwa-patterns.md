# PWA Patterns

> Progressive Web App patterns including service workers, offline-first architecture, push notifications, installability, and cache strategies.

## Core Principles

1. **Offline-First, Not Offline-Fallback** — Design the application to work offline by default, syncing when connectivity returns. Treat the network as an enhancement, not a requirement.
2. **Cache Strategy Per Resource Type** — Different resources need different caching strategies. Static assets use cache-first, API data uses network-first with stale fallback, and auth tokens are never cached.
3. **Progressive Enhancement** — PWA features layer on top of a functional web app. Users without service worker support still get a working application; those with it get offline access, push notifications, and installability.

## Patterns

### Pattern 1: Service Worker with Workbox Strategies

Register a service worker that applies different caching strategies per route: cache-first for static assets, network-first for API calls.

```typescript
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute } from "workbox-precaching";

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ request }) => request.destination === "image" || request.destination === "font",
  new CacheFirst({
    cacheName: "static-assets",
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
);

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "api-responses",
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 5 * 60 })],
    networkTimeoutSeconds: 3,
  }),
);
```

### Pattern 2: Background Sync for Offline Mutations

Queue failed mutations in IndexedDB and replay them when connectivity returns, ensuring no user action is lost.

```typescript
import { Queue } from "workbox-background-sync";

const syncQueue = new Queue("offline-mutations", {
  maxRetentionTime: 24 * 60, // 24 hours in minutes
  onSync: async ({ queue }) => {
    let entry;
    while ((entry = await queue.shiftRequest())) {
      try {
        await fetch(entry.request.clone());
      } catch (err) {
        await queue.unshiftRequest(entry);
        throw err; // Retry later
      }
    }
  },
});

self.addEventListener("fetch", (event: FetchEvent) => {
  if (event.request.method !== "GET") {
    const response = fetch(event.request.clone()).catch(() => {
      syncQueue.pushRequest({ request: event.request });
      return new Response(JSON.stringify({ queued: true }), { status: 202 });
    });
    event.respondWith(response);
  }
});
```

### Pattern 3: Push Notification with Permission Flow

Request notification permission with context, subscribe to push, and handle incoming messages with actionable notifications.

```typescript
async function subscribeToPush(vapid_public_key: string): Promise<PushSubscription | null> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid_public_key),
  });
  await api.post("/push/subscribe", subscription.toJSON());
  return subscription;
}

// In service worker
self.addEventListener("push", (event: PushEvent) => {
  const data = event.data?.json() ?? { title: "Notification", body: "" };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      actions: data.actions ?? [],
    }),
  );
});
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| Caching everything with the same strategy | API data goes stale, auth tokens leak into cache | Per-route strategies: cache-first for assets, network-first for APIs |
| Dropping user mutations when offline | Data loss destroys user trust | Background sync queue with retry and conflict resolution |
| Requesting notification permission on page load | Users deny without context, cannot re-prompt | Request after a relevant user action with explanation of value |
| No cache size limits or expiration | Cache grows unbounded, fills device storage | ExpirationPlugin with maxEntries and maxAgeSeconds per cache |

## Implementation Checklist

- [ ] Service worker registered with per-route caching strategies and precaching
- [ ] Background sync queues offline mutations with retry and 24-hour retention
- [ ] Push notification subscription flow with contextual permission request
- [ ] Web app manifest configured with icons, theme color, and display mode
- [ ] Cache storage bounded with expiration policies per cache name

## References

- [Workbox Documentation](https://developer.chrome.com/docs/workbox)
- [MDN Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Web Push Protocol](https://web.dev/articles/push-notifications-overview)
