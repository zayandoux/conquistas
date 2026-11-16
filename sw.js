// Cache apenas da interface pública. Nunca armazena fotos, tokens ou respostas do Supabase.
const PREFIX='conquistas-shell:'+self.registration.scope+':';
const CACHE=PREFIX+'v3';
const base=self.registration.scope;
const FILES=['./','index.html','style.css','app.js','logic.js','pwa.js','manifest.webmanifest',
 'icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','favicon.png'];
const SHELL_URLS=new Set(FILES.map(file=>new URL(file,base).href));
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([...SHELL_URLS])).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||req.headers.has('Authorization'))return;
 if(req.mode==='navigate'&&url.href.startsWith(base)){
  // Navegações com query string não são gravadas: tokens e links de autenticação ficam fora do cache.
  event.respondWith(fetch(req).then(async res=>{
   if(res.ok&&!url.search&&(url.href===base||url.href===new URL('index.html',base).href)){
    const copy=res.clone();try{const cache=await caches.open(CACHE);await cache.put(new URL('index.html',base).href,copy)}catch{}
   }
   return res;
  }).catch(async()=>await caches.match(new URL('index.html',base).href)||Response.error()));
  return;
 }
 if(!SHELL_URLS.has(url.href))return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  try{const res=await fetch(req);if(res.ok)await cache.put(req,res.clone());return res}
  catch{return await cache.match(req)||Response.error()}
 }));
});
