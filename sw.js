const V='rateio-v6',SHELL=['./','index.html','styles.css','app.js','db-worker.js','manifest.json','lib/pdf.min.mjs','lib/pdf.worker.min.mjs','icon-192.png','icon-512.png','sqlite/sqlite3.mjs','sqlite/sqlite3.wasm','sqlite/sqlite3-opfs-async-proxy.js'];
// Injeta COOP/COEP (necessário p/ SharedArrayBuffer => VFS opfs) em respostas same-origin
const wrap=r=>{if(!r||r.type==='opaque'||!r.status)return r;const h=new Headers(r.headers);h.set('Cross-Origin-Embedder-Policy','require-corp');h.set('Cross-Origin-Opener-Policy','same-origin');return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h})};
self.oninstall=e=>{self.skipWaiting();e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>0)))))};
self.onactivate=e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>clients.claim()));
self.onfetch=e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith((async()=>{const c=await caches.open(V),hit=await c.match(e.request,{ignoreSearch:true});
  const net=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r}).catch(()=>hit);
  return wrap(hit||await net)})())};
