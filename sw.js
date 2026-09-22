# sw.js
# ============================================================
# Usage:
#   PWAのService Workerとして使用する
# ============================================================

const CACHE_NAME = "server-approval-v1";

const CACHE_FILES = [
    "/",
    "/index.html",
    "/app.js",
    "/style.css",
    "/manifest.json"
];


self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(CACHE_FILES);
        })
    );
});


self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
});


self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") {
        return;
    }

    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
