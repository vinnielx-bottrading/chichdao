// CHI.CH DAO. service worker: lets the site install as an app and open fast.
// Only same-origin static files are cached. API calls, media and auth never touch this cache.
const VERSION='chichdao-v0.12.0';
const SHELL=['./','index.html','themes.css','styles.css','themes.js','app.js','api.js','model.js','album.js','regions.js','i18n.js','manifest.webmanifest','assets/logos/logo-navy-coral.png','assets/favicon.svg','assets/long-1.jpg','assets/DejaVuSans.ttf','assets/DejaVuSans-Bold.ttf','assets/icons/icon-192.png','assets/icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 const req=e.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==location.origin)return;
 // Code and pages: network first (always newest after a deploy), cache only as offline fallback.
 if(req.mode==='navigate'||/\.(js|css|html|webmanifest)$/.test(url.pathname)){
  e.respondWith(fetch(req).then(r=>{if(r.ok){const copy=r.clone();caches.open(VERSION).then(c=>c.put(req.mode==='navigate'?'index.html':req,copy));}return r;}).catch(()=>caches.match(req).then(r=>r||caches.match('index.html'))));
  return;
 }
 // Images and fonts: stale-while-revalidate.
 e.respondWith(caches.open(VERSION).then(async c=>{const hit=await c.match(req);const net=fetch(req).then(r=>{if(r.ok)c.put(req,r.clone());return r;}).catch(()=>hit);return hit||net;}));
});
// Tapping a chat notification focuses the app (or opens it) and pops that conversation up.
self.addEventListener('notificationclick',e=>{
 e.notification.close();const chat=e.notification.data?.chat;
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
  const c=list.find(x=>new URL(x.url).origin===location.origin);
  if(c){c.postMessage({openChat:chat});return c.focus();}
  return self.clients.openWindow(chat?`./?chat=${encodeURIComponent(chat)}#messages`:'./#messages');
 }));
});
