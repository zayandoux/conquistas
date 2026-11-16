// A instalação só guarda preferências locais. Fotos e progresso continuam no Supabase.
export function detectPlatform(userAgent='',platform='',touchPoints=0){
 if(/iPad|iPhone|iPod/i.test(userAgent)||(platform==='MacIntel'&&touchPoints>1))return 'ios';
 if(/Android/i.test(userAgent))return 'android';
 return 'desktop';
}
export function isStandalone(win,nav){
 return !!nav.standalone||['standalone','fullscreen','minimal-ui','window-controls-overlay'].some(mode=>win.matchMedia?.(`(display-mode: ${mode})`).matches);
}
export function shouldShowInstall({standalone=false,relatedInstalled=false,installedEvent=false,hiddenByUser=false,dismissed=false}={}){
 return !standalone&&!relatedInstalled&&!installedEvent&&!hiddenByUser&&!dismissed;
}

export function initInstallUI(win,doc,nav){
 const byId=id=>doc.getElementById(id);
 const promo=byId('install-promo'),button=byId('install-app'),dialog=byId('install-dialog');
 if(!promo||!button||!dialog)return null;
 const base=new URL('./',doc.baseURI),manifestURL=new URL('manifest.webmanifest',base).href;
 const hiddenKey='conquistas.install.hidden:'+base.pathname;
 const dismissedKey='conquistas.install.dismissed:'+base.pathname;
 const read=(storage,key)=>{try{return storage.getItem(key)==='yes'}catch{return false}};
 const write=(storage,key,value)=>{try{value?storage.setItem(key,'yes'):storage.removeItem(key)}catch{}};
 const state={standalone:isStandalone(win,nav),relatedInstalled:false,installedEvent:false,hiddenByUser:read(win.localStorage,hiddenKey),dismissed:read(win.sessionStorage,dismissedKey)};
 const platform=detectPlatform(nav.userAgent,nav.platform,nav.maxTouchPoints);
 let pendingPrompt=null,prompting=false,selectedPlatform=platform==='ios'?'ios':'android';

 function update(){
  state.standalone=isStandalone(win,nav);
  promo.hidden=!shouldShowInstall(state);
  button.textContent=platform==='ios'?'Instalar no iPhone ↗':platform==='android'?'Instalar no Android ↗':'Instalar app ↗';
  byId('install-help').hidden=state.standalone||state.relatedInstalled||state.installedEvent;
  if((state.standalone||state.relatedInstalled||state.installedEvent)&&dialog.open)closeInstructions();
 }
 function closeInstructions(){dialog.close();if(!doc.querySelector('dialog[open]'))doc.body.style.overflow=''}
 function hideAsInstalled(){state.hiddenByUser=true;write(win.localStorage,hiddenKey,true);closeInstructions();update()}
 function drawInstructions(){
  doc.querySelectorAll('[data-install-platform]').forEach(b=>{b.classList.toggle('active',b.dataset.installPlatform===selectedPlatform);b.setAttribute('aria-pressed',String(b.dataset.installPlatform===selectedPlatform))});
  const secure=win.location.protocol==='https:'||['localhost','127.0.0.1'].includes(win.location.hostname);
  const localNotice=secure?'':'<p class="own-note">Para instalar, abra a versão publicada do site com HTTPS. Um arquivo aberto direto no computador não pode ser instalado como app.</p>';
  const embedded=/Instagram|FBAN|FBAV|Line\//i.test(nav.userAgent);
  let html=localNotice;
  if(selectedPlatform==='ios'){
   html+=`<ol class="install-steps"><li><span>1</span><p>Abra este site no <strong>Safari</strong> do iPhone.</p></li><li><span>2</span><p>Toque em <strong>Compartilhar</strong> <span class="share-symbol" aria-label="quadrado com seta para cima">↥</span>. Se necessário, abra primeiro o menu do navegador.</p></li><li><span>3</span><p>Escolha <strong>Adicionar à Tela de Início</strong>. Ative <strong>Abrir como App</strong>, se essa opção aparecer.</p></li><li><span>4</span><p>Confirme em <strong>Adicionar</strong>. O ícone ZL vai aparecer na sua tela inicial.</p></li></ol>`;
   html+='<p class="install-note">Depois, abra pelo ícone ZL. Dentro do app, este aviso não aparece.</p>';
  }else if(pendingPrompt&&platform!=='ios'){
   html+='<p class="own-note">Seu navegador já está pronto para instalar. Confirme a instalação na próxima janela.</p><button class="primary wide" id="install-native">Instalar Conquistas ZL ↗</button>';
  }else{
   html+='<ol class="install-steps"><li><span>1</span><p>Abra este site no <strong>Chrome</strong> do Android.</p></li><li><span>2</span><p>Toque no menu <strong>⋮</strong> do navegador.</p></li><li><span>3</span><p>Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong> e confirme.</p></li></ol><p class="install-note">Se a opção ainda não aparecer, aguarde o carregamento, atualize a página e confira se o endereço começa com HTTPS. As opções dependem do navegador.</p>';
  }
  if(embedded)html='<p class="own-note">Você está em um navegador dentro de outro app. Abra o link no Safari ou Chrome para instalar.</p>'+html;
  byId('install-steps').innerHTML=html;
  if(byId('install-native'))byId('install-native').onclick=triggerInstall;
 }
 function openInstructions(target=platform==='ios'?'ios':'android'){
  if(state.standalone||state.relatedInstalled||state.installedEvent)return;
  selectedPlatform=target;drawInstructions();if(!dialog.open)dialog.showModal();doc.body.style.overflow='hidden';
 }
 async function triggerInstall(){
  if(prompting||state.standalone||state.relatedInstalled||state.installedEvent)return;
  if(!pendingPrompt||platform==='ios'){openInstructions();return}
  const event=pendingPrompt;pendingPrompt=null;prompting=true;button.disabled=true;
  try{
   closeInstructions();await event.prompt();
   const result=await event.userChoice;
   // appinstalled confirme a instalação; aceitar a janela pode ainda estar instalando.
   if(result?.outcome==='accepted'){state.dismissed=true;write(win.sessionStorage,dismissedKey,true)}
  }catch{openInstructions()}finally{prompting=false;button.disabled=false;update()}
 }
 async function checkInstalled(){
  state.standalone=isStandalone(win,nav);
  if(typeof nav.getInstalledRelatedApps==='function'){
   try{const related=await nav.getInstalledRelatedApps();state.relatedInstalled=related.some(app=>app.platform==='webapp'&&app.url&&new URL(app.url,base).href===manifestURL)}catch{}
  }
  update();
 }
 function onPrompt(event){
  event.preventDefault();pendingPrompt=event;state.installedEvent=false;state.relatedInstalled=false;update();if(dialog.open)drawInstructions();
 }
 function onInstalled(){pendingPrompt=null;state.installedEvent=true;closeInstructions();update()}

 button.onclick=triggerInstall;
 byId('install-already').onclick=hideAsInstalled;
 byId('install-mark-done').onclick=hideAsInstalled;
 byId('install-dismiss').onclick=()=>{state.dismissed=true;write(win.sessionStorage,dismissedKey,true);update()};
 byId('install-close').onclick=closeInstructions;
 byId('install-help').onclick=()=>openInstructions();
 doc.querySelectorAll('[data-install-platform]').forEach(b=>b.onclick=()=>{selectedPlatform=b.dataset.installPlatform;drawInstructions()});
 dialog.addEventListener('close',()=>{if(!doc.querySelector('dialog[open]'))doc.body.style.overflow=''});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeInstructions()}});
 win.addEventListener('beforeinstallprompt',onPrompt);
 win.addEventListener('appinstalled',onInstalled);
 for(const mode of ['standalone','fullscreen','minimal-ui','window-controls-overlay'])win.matchMedia?.(`(display-mode: ${mode})`).addEventListener?.('change',checkInstalled);
 doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible')checkInstalled()});
 const secure=win.location.protocol==='https:'||['localhost','127.0.0.1'].includes(win.location.hostname);
 const register=()=>{if(secure&&'serviceWorker' in nav)nav.serviceWorker.register(new URL('sw.js',base).href,{scope:base.href,updateViaCache:'none'}).catch(()=>{/* A página continua disponível se o navegador não permitir instalar. */})};
 if(doc.readyState==='complete')register();else win.addEventListener('load',register,{once:true});
 // O banner surge na primeira abertura; APIs de detecção aprimoram a resposta sem bloquear a página.
 if(typeof nav.getInstalledRelatedApps==='function')checkInstalled();else update();
 return {state,update,checkInstalled,openInstructions,triggerInstall};
}
if(typeof window!=='undefined'&&typeof document!=='undefined')initInstallUI(window,document,navigator);
