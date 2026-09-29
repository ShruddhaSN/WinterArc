const CACHE = "winter-arc-v2";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json"];

self.addEventListener("install", (e) => {
  self.skipWaiting(); // activate the new version immediately, don't wait for tabs to close
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim()) // take control of already-open tabs right away
  );
});

// Network-first: always try to fetch the latest file; only fall back to the
// cached copy if there's no connection. This avoids ever getting stuck on
// stale code again, at the cost of one extra network check per file.
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
