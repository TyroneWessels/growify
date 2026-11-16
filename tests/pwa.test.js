const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const pages = ["index", "kalender", "mijn-planten", "planten", "plant", "herstel"];

test("PWA manifest is configured for installation from the deployed site root", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.name, "Growify - planten verzorgen");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.src === "assets/pwa-icon-192.png" && icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.src === "assets/pwa-icon-512.png" && icon.sizes === "512x512"));
  assert.equal(manifest.background_color, "#e8eff2");
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(root, icon.src)), icon.src);
  }
});

test("all source pages link the manifest and register the service worker", () => {
  for (const page of pages) {
    const source = fs.readFileSync(path.join(root, `${page}.html`), "utf8");
    assert.match(source, /<link rel="manifest" href="manifest\.webmanifest" \/>/, page);
    assert.match(source, /<link rel="icon" href="assets\/pwa-icon-192\.png" type="image\/png" \/>/, page);
    assert.match(source, /<link rel="apple-touch-icon" href="assets\/pwa-icon-192\.png" \/>/, page);
    assert.match(source, /<script src="pwa\.js"><\/script>/, page);
  }
});

function loadServiceWorker() {
  const listeners = new Map();
  const notifications = [];
  const openedWindows = [];
  const self = {
    registration: {
      scope: "https://example.test/growify/",
      showNotification: (title, options) => {
        notifications.push({ title, options });
        return Promise.resolve();
      }
    },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve([]),
      openWindow: (url) => {
        openedWindows.push(url);
        return Promise.resolve();
      }
    },
    addEventListener: (name, callback) => listeners.set(name, callback)
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "service-worker.js"), "utf8"), { self, URL, Promise });
  return { listeners, notifications, openedWindows };
}

test("service worker displays push payloads and uses a safe default for missing payload data", async () => {
  const { listeners, notifications } = loadServiceWorker();
  const waits = [];
  listeners.get("push")({
    data: { json: () => ({ title: "Growify", body: "Geef je Monstera water." }) },
    waitUntil: (promise) => waits.push(promise)
  });
  listeners.get("push")({ data: null, waitUntil: (promise) => waits.push(promise) });
  await Promise.all(waits);

  assert.equal(notifications[0].title, "Growify");
  assert.equal(notifications[0].options.body, "Geef je Monstera water.");
  assert.equal(notifications[1].options.body, "Bekijk welke planten vandaag verzorging nodig hebben.");
});

test("notification clicks cannot navigate outside Growify's deployed scope", async () => {
  const { listeners, openedWindows } = loadServiceWorker();
  let waited;
  listeners.get("notificationclick")({
    notification: {
      data: { url: "https://example.test/other-app/" },
      close() {}
    },
    waitUntil: (promise) => { waited = promise; }
  });
  await waited;
  assert.deepEqual(openedWindows, ["https://example.test/growify/"]);
});
