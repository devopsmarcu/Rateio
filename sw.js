const V='rateio-v9',SHELL=['./','index.html','styles.css','oauth.html','oauth-relay.js','db-worker.js','manifest.json','lib/pdf.min.mjs','lib/pdf.worker.min.mjs','icon-192.png','icon-512.png','sqlite/sqlite3.mjs','sqlite/sqlite3.wasm','sqlite/sqlite3-opfs-async-proxy.js','src/main.js','src/core/state.js','src/core/format.js','src/core/pix.js','src/core/theme.js','src/core/ui.js','src/core/banco.js','src/core/db.js','src/features/inicio.js','src/features/faturas.js','src/features/parcelas.js','src/features/pessoas.js','src/features/ajustes.js','src/features/rateio.js','src/features/importacao/parse.js','src/features/importacao/view.js','src/integrations/oauth/config.js','src/integrations/oauth/service.js'];
// Injeta COOP/COEP (necessário p/ SharedArrayBuffer => VFS opfs) em respostas same-origin.
// EXCEÇÃO: a ponte OAuth (oauth.html/oauth-relay.js) é servida SEM esses cabeçalhos, pois
// COOP:same-origin severa janelas de popup e impediria o Google Identity Services de devolver
// o resultado da autorização. Ver oauth-relay.js.
const NO_ISOLATION=new Set(['/oauth.html','/oauth-relay.js']);
const wrap=(r,p)=>{if(!r||r.type==='opaque'||!r.status||NO_ISOLATION.has(p))return r;const h=new Headers(r.headers);h.set('Cross-Origin-Embedder-Policy','require-corp');h.set('Cross-Origin-Opener-Policy','same-origin');return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h})};
self.oninstall=e=>{self.skipWaiting();e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>0)))))};
self.onactivate=e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>clients.claim()));
self.onfetch=e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 e.respondWith((async()=>{const c=await caches.open(V),hit=await c.match(e.request,{ignoreSearch:true});
  const net=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r}).catch(()=>hit);
  return wrap(hit||await net,u.pathname)})())};
