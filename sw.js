// Cut N' Fade foglaló — service worker (telepíthető webapp)
// Szabály: MINDIG a hálózat az első, hogy minden frissítés azonnal látszódjon.
// A gyorsítótár csak akkor kell, ha nincs net: ilyenkor az utoljára betöltött oldal jön be.
// A Supabase (adatbázis, levélküldés) és más külső kérések NEM mennek át rajta.
const CACHE = "cnf-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // külső (Supabase, CDN, betűk): a böngészőre bízzuk

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === "navigate" || SHELL.some((p) => url.pathname.endsWith(p.replace("./", "/"))))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? "./" : req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req.mode === "navigate" ? "./" : req).then((r) => r || caches.match("./")))
  );
});

// ===== Telefonos értesítés (Web Push) — a push-notify szerverfüggvény küldi =====
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Cut N' Fade", {
    body: d.body || "",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { date: d.date || "" },
  }));
});

// Koppintás az értesítésre: az app az admin naptárban, a foglalás napján nyílik meg
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const date = (e.notification.data && e.notification.data.date) || "";
  const url = new URL(date ? "./?nap=" + date : "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        c.postMessage({ type: "cnf-open-date", date });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
