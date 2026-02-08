/**
 * TRAINTRCKR Service Worker
 * Handles push notifications for train approach alerts.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "TRAINTRCKR";
  const options = {
    body: data.body || "A train is approaching your location",
    icon: "/train-icon.png",
    badge: "/train-icon.png",
    tag: data.tag || "train-alert",
    renotify: true,
    vibrate: [200, 100, 200],
    data: data.payload || {},
    actions: [
      { action: "view", title: "View Details" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "view" || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: "window" }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes("/") && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow("/");
        }
      })
    );
  }
});

// Listen for messages from the main app
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const { title, body, tag } = event.data;
    self.registration.showNotification(title || "TRAINTRCKR", {
      body: body || "Train alert",
      icon: "/train-icon.png",
      tag: tag || "train-alert",
      renotify: true,
      vibrate: [200, 100, 200],
    });
  }
});
