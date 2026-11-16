const siteRoot = new URL(self.registration.scope);

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) payload = {};

  const title = typeof payload.title === "string" && payload.title.trim()
    ? payload.title
    : "Growify · tijd voor je planten";
  const body = typeof payload.body === "string" && payload.body.trim()
    ? payload.body
    : "Bekijk welke planten vandaag verzorging nodig hebben.";
  const icon = new URL("assets/pwa-icon-192.png", siteRoot).href;

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon,
    badge: icon,
    tag: typeof payload.tag === "string" ? payload.tag : "growify-care-reminder",
    data: { url: typeof payload.url === "string" ? payload.url : "./" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  let target = new URL(event.notification.data?.url || "./", siteRoot);
  if (target.origin !== siteRoot.origin || !target.href.startsWith(siteRoot.href)) {
    target = siteRoot;
  }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(siteRoot.href)) {
        await client.navigate(target.href);
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(target.href);
  })());
});
