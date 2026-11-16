import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
const source=readFileSync(new URL('../site/pwa.js',import.meta.url),'utf8');
const {detectPlatform,isStandalone,shouldShowInstall,initInstallUI}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function storage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}}
function environment({ios=false,standalone=false,related,local=storage(),session=storage(),secure=true}={}){
 const events=new Map(),elements=new Map();let registrations=0;
 function element(id){if(!elements.has(id))elements.set(id,{id,hidden:true,disabled:false,open:false,textContent:'',innerHTML:'',dataset:{},classList:{toggle(){}},setAttribute(){},addEventListener(){},close(){this.open=false},showModal(){this.open=true}});return elements.get(id)}
 for(const id of ['install-promo','install-app','install-dialog','install-help','install-steps','install-already','install-mark-done','install-dismiss','install-close'])element(id);
 const platformButtons=['android','ios'].map(platform=>{const b=element('button-'+platform);b.dataset.installPlatform=platform;return b});
 const location=new URL((secure?'https://example.test':'http://example.test')+'/conquistas-2027/');
 const win={location,localStorage:local,sessionStorage:session,matchMedia:q=>({matches:standalone&&q==='(display-mode: standalone)',addEventListener(){}}),addEventListener:(name,fn)=>events.set(name,fn)};
 const doc={baseURI:location.href,body:{style:{}},readyState:'complete',visibilityState:'visible',getElementById:id=>elements.get(id)||null,querySelectorAll:()=>platformButtons,querySelector:()=>element('install-dialog').open?element('install-dialog'):null,addEventListener(){}};
 const nav={userAgent:ios?'iPhone Safari':'Android Chrome',platform:ios?'iPhone':'Linux',maxTouchPoints:5,serviceWorker:{register:async()=>{registrations++}}};
 if(related)nav.getInstalledRelatedApps=async()=>related;
 const ui=initInstallUI(win,doc,nav);
 return {ui,win,doc,nav,elements,events,registrations:()=>registrations};
}
test('identifica Android, iPhone e iPad que usa identificação de Mac',()=>{
 assert.equal(detectPlatform('Android'),'android');assert.equal(detectPlatform('iPhone'),'ios');
 assert.equal(detectPlatform('Macintosh','MacIntel',5),'ios');assert.equal(detectPlatform('Macintosh','MacIntel',0),'desktop');
});
test('instalação fica oculta em modos de app, em instalações conhecidas e após escolha do usuário',()=>{
 assert.equal(shouldShowInstall(),true);
 for(const flag of ['standalone','relatedInstalled','installedEvent','hiddenByUser','dismissed'])assert.equal(shouldShowInstall({[flag]:true}),false);
 assert.equal(isStandalone({matchMedia:()=>({matches:false})},{standalone:true}),true);
});
test('botão aparece na primeira abertura de Android e iPhone',()=>{
 for(const ios of [false,true]){const e=environment({ios});assert.equal(e.elements.get('install-promo').hidden,false);assert.match(e.elements.get('install-app').textContent,ios?/iPhone/:/Android/);assert.equal(e.registrations(),1)}
});
test('iPhone recebe instruções e não uma promessa de instalação automática',async()=>{
 const e=environment({ios:true});await e.ui.triggerInstall();
 assert.equal(e.elements.get('install-dialog').open,true);assert.match(e.elements.get('install-steps').innerHTML,/Safari/);assert.match(e.elements.get('install-steps').innerHTML,/Adicionar à Tela de Início/);
});
test('aberto pelo ícone, o app não mostra convite de instalação',()=>{
 const e=environment({standalone:true});assert.equal(e.elements.get('install-promo').hidden,true);assert.equal(e.elements.get('install-help').hidden,true);
});
test('Chrome reconhece este app instalado e ignora aplicativos de outro escopo',async()=>{
 const e=environment({related:[{platform:'webapp',url:'https://example.test/conquistas-2027/manifest.webmanifest'}]});await e.ui.checkInstalled();assert.equal(e.elements.get('install-promo').hidden,true);
 const other=environment({related:[{platform:'webapp',url:'https://example.test/outro/manifest.webmanifest'}]});await other.ui.checkInstalled();assert.equal(other.elements.get('install-promo').hidden,false);
});
test('botão chama o prompt nativo só após clique e uma vez por evento',async()=>{
 const e=environment();let prompts=0,prevented=0;
 e.events.get('beforeinstallprompt')({preventDefault(){prevented++},async prompt(){prompts++},userChoice:Promise.resolve({outcome:'dismissed'})});
 assert.equal(prompts,0);assert.equal(prevented,1);
 await e.ui.triggerInstall();assert.equal(prompts,1);
 await e.ui.triggerInstall();assert.equal(prompts,1);assert.equal(e.elements.get('install-dialog').open,true);
 e.events.get('appinstalled')();assert.equal(e.elements.get('install-promo').hidden,true);assert.equal(e.elements.get('install-dialog').open,false);
});
test('Já instalei respeita a preferência nas visitas seguintes sem inventar detecção do iPhone',()=>{
 const local=storage();const e=environment({ios:true,local});e.elements.get('install-already').onclick();assert.equal(e.elements.get('install-promo').hidden,true);
 const next=environment({ios:true,local});assert.equal(next.elements.get('install-promo').hidden,true);assert.equal(next.ui.state.relatedInstalled,false);
});
test('service worker não é registrado em HTTP público sem HTTPS',()=>{
 const e=environment({secure:false});assert.equal(e.registrations(),0);
});
test('manifesto funciona em subpasta e inclui ícones compatíveis',()=>{
 const m=JSON.parse(readFileSync(new URL('../site/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(m.scope,'./');assert.equal(m.start_url,'./');assert.equal(m.display,'standalone');
 for(const size of ['192x192','512x512'])assert.ok(m.icons.some(i=>i.sizes===size&&i.type==='image/png'));
 for(const icon of m.icons)assert.ok(existsSync(new URL('../site/'+icon.src,import.meta.url)));
});
test('service worker nunca intercepta Supabase, fotos privadas, requisições autenticadas ou gravações',()=>{
 const callbacks={};const origin='https://example.test',scope=origin+'/conquistas-2027/';
 vm.runInNewContext(readFileSync(new URL('../site/sw.js',import.meta.url),'utf8'),{URL,self:{registration:{scope},location:{origin},addEventListener:(name,fn)=>callbacks[name]=fn}});
 const requests=[{url:'https://project.supabase.co/rest/v1/conquista_photos',method:'GET',mode:'cors',headers:new Headers()},
 {url:'https://project.supabase.co/storage/v1/object/sign/private/photo.jpg',method:'GET',mode:'cors',headers:new Headers()},
 {url:scope+'index.html',method:'GET',mode:'navigate',headers:new Headers({Authorization:'Bearer test'})},
 {url:scope+'index.html',method:'POST',mode:'navigate',headers:new Headers()},
 {url:origin+'/other/app.js',method:'GET',mode:'cors',headers:new Headers()}];
 for(const request of requests){let intercepted=false;callbacks.fetch({request,respondWith(){intercepted=true}});assert.equal(intercepted,false,request.url)}
});
