/* SCEC door tracker – offline cache. Static files and photos come from the phone's cache so the
   app opens instantly and doesn't flicker on poor site signal; live data (/api) always goes to the server. */
const V="scec-v1";
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("scec")&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
const good=(r,img)=>r&&r.ok&&r.type==="basic"&&!r.redirected&&(!img||/^image\//.test(r.headers.get("content-type")||""));
async function put(req,res){try{const c=await caches.open(V);await c.put(req,res)}catch(e){}}
async function cacheFirst(req){const c=await caches.match(req);if(c)return c;const r=await fetch(req);if(good(r,true))put(req,r.clone());return r}
async function swr(req,img){const c=await caches.match(req);const net=fetch(req).then(r=>{if(good(r,img))put(req,r.clone());return r}).catch(()=>c);return c||net}
async function netFirst(req,ms){const c=caches.match(req);try{const r=await Promise.race([fetch(req),new Promise((_,j)=>setTimeout(()=>j(new Error("slow")),ms))]);if(good(r))put(req,r.clone());return r}catch(e){const m=await c;if(m)return m;return fetch(req)}}
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET")return;const u=new URL(r.url);if(u.origin!==location.origin)return;const p=u.pathname;
  if(p.startsWith("/api/photo/"))return e.respondWith(cacheFirst(r));
  if(p.startsWith("/api/")||p.startsWith("/cdn-cgi/"))return;
  if(/\.(png|jpe?g|webp|gif|svg)$/i.test(p))return e.respondWith(swr(r,true));
  if(p.endsWith(".json")||p.endsWith(".js"))return e.respondWith(netFirst(r,3500));
  if(r.mode==="navigate"||p==="/"||p.endsWith(".html"))return e.respondWith(netFirst(r,4000));
});
