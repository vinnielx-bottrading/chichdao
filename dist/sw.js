// CHI.CH DAO. service worker: lets the site install as an app and open fast.
// Only same-origin static files are cached. API calls, media and auth never touch this cache.
const VERSION='chichdao-v0.5.1';
const SHELL=['./','index.html','styles.css','app.js','api.js','model.js','album.js','manifest.webmanifest','assets/logo.png','assets/favicon.svg','assets/long-1.jpg','assets/DejaVuSans.ttf','assets/DejaVuSans-Bold.ttf','assets/icons/icon-192.png','assets/icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 const req=e.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==location.origin)return;
 // Always fresh: pages, config and admin files (network first, cache only as offline fallback).
 if(req.mode==='navigate'||/\/(config\.js|admin\.(html|js|css))$/.test(url.pathname)){
  e.respondWith(fetch(req).then(r=>{if(r.ok&&req.mode==='navigate'){const copy=r.clone();caches.open(VERSION).then(c=>c.put('index.html',copy));}return r;}).catch(()=>caches.match(req).then(r=>r||caches.match('index.html'))));
  return;
 }
 // Static assets: stale-while-revalidate.
 e.respondWith(caches.open(VERSION).then(async c=>{const hit=await c.match(req);const net=fetch(req).then(r=>{if(r.ok)c.put(req,r.clone());return r;}).catch(()=>hit);return hit||net;}));
});
