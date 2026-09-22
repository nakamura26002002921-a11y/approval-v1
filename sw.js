// sw.js
// ============================================================
// PWAのService Worker。
// GitHub Pagesのようにサブパス（/approval-v1/ など）配下で
// 配信される場合に対応するため、self.registration.scope を
// 基準にキャッシュ対象URLを組み立てる（絶対パス "/xxx" は使わない）。
// ============================================================

const CACHE_NAME = "server-approval-v3";

// self.registration.scope は sw.js を登録したスコープの絶対URL
// （例: https://xxxxx.github.io/approval-v1/）
const SCOPE = self.registration ? self.registration.scope : self.location.href;

const CACHE_FILES = [
    "",
    "index.html",
    "app.js",
    "orchestrator_api.py",
    "style.css",
    "manifest.json",
    "icon-192.png",
    "icon-512.png"
].map(path => new URL(path, SCOPE).toString());


self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(CACHE_FILES);
        })
    );
    self.skipWaiting();
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
    self.clients.claim();
});


self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") {
        return;
    }

    // 外部CDN（Pyodide本体やパッケージ）やAPIサーバーへのリクエストは
    // このアプリ固有のキャッシュ管理下に置かず素通しする。
    const requestUrl = new URL(event.request.url);
    const scopeUrl = new URL(SCOPE);
    if (requestUrl.origin !== scopeUrl.origin) {
        return;
    }

    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
