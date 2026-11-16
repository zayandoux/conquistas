import {completionState,canEditPerson,canManagePhoto,photoPath,comparePhotoDates} from './logic.js';
const SUPABASE_URL = 'https://zkvtyfmqqnipyefltxlg.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_ckeks3LJkDsd4P9q2T29Rw_V3zlS_Nk';
const SESSION_KEY = 'conquistas2027.session';
const PEOPLE = {zayan:'Zayan',leo:'Léo'};
const STATUS = {pending:'Não comecei',in_progress:'Em progresso',completed:'Concluído'};
const paths = {
 training:'<path d="m6 6 12 12M4 10l6-6m4 16 6-6M2 8l6-6m8 20 6-6m-13-3 4-4"/>',
 business:'<path d="M3 10v11h18V10M2 10l3-7h14l3 7M3 10c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0M9 21v-7h6v7"/>',
 pc:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 22h8m-4-5v5M6 8h5m-5 4h9"/>',
 cnh:'<rect x="2" y="5" width="20" height="15" rx="3"/><circle cx="8" cy="11" r="2"/><path d="M5 16c0-3 6-3 6 0m4-5h3m-3 4h3M6 5V2m12 3V2"/>',
 celebrate:'<path d="m3 21 5-15 10 10-15 5Z"/><path d="m12 4 1-2m4 7 5-3m-3 6h3m-7-6 3-4M6 13l5 5"/><circle cx="20" cy="2" r=".5"/>'
};
const GOALS = [
 {id:'training',title:'Começar a treinar',desc:'O primeiro passo para a nossa melhor versão.',detail:'Cada um marca o próprio começo. A meta fica verde quando os dois começarem. Registrem a evolução com quantas fotos quiserem e acompanhem um ao outro.',color:'#c5f36b',kind:'individual'},
 {id:'business',title:'Começar um negócio',desc:'Tirar nossa ideia do papel. Construir algo nosso.',detail:'Um plano compartilhado. Marquem em progresso quando começarem e concluído quando o negócio estiver dando certo.',color:'#dfb585',kind:'shared'},
 {id:'pc',title:'Montar um PC Gamer',desc:'Peça por peça, o setup dos sonhos ganha forma.',detail:'Cada um tem o próprio setup. Marque em progresso enquanto compra as peças e concluído quando tudo estiver montado.',color:'#b9a5e7',kind:'individual'},
 {id:'cnh',title:'Tirar CNH',desc:'Mais liberdade. Novos caminhos pela frente.',detail:'Da matrícula à carteira na mão: cada um acompanha o próprio caminho até a habilitação.',color:'#9cc7da',kind:'individual'},
 {id:'celebrate',title:'Comemorar as conquistas',desc:'Porque toda vitória merece um brinde juntos.',detail:'Reservem um momento para celebrar o que construíram. Uma conquista compartilhada, marcada de uma vez para os dois.',color:'#dfb0c5',kind:'shared'}
];
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const escapeHTML = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = id=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id]}</svg>`;
let session=null, members=[], goals=[], photos=[], me=null, connected=false, filter='all', activeGoal=null, selectedPerson='zayan', refreshing=null, busy=false, activeAuthMode='login', toastTimer;
let authRevision=0;
const signedCache = new Map();
try{session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{}

function persistSession(value){session=value;try{value?localStorage.setItem(SESSION_KEY,JSON.stringify(value)):localStorage.removeItem(SESSION_KEY)}catch{}}
function normalizeSession(s){return {...s,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600)}}
function toast(message,error=false){const t=$('#toast');t.textContent=message;t.className='toast visible'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),error?6500:3500)}
function friendlyError(err){
 const raw=String(err?.message||err||'');
 if(/invalid login credentials/i.test(raw))return 'E-mail ou senha incorretos.';
 if(/email not confirmed/i.test(raw))return 'Confirme seu e-mail antes de entrar.';
 if(/rate limit|too many requests|over_email_send_rate_limit/i.test(raw))return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
 if(/user already registered/i.test(raw))return 'Esse e-mail já tem uma conta. Use a opção Entrar.';
 if(/password.*(least|short|weak)/i.test(raw))return 'Escolha uma senha mais forte, com pelo menos 8 caracteres.';
 if(/Convite|perfil|conta|seman|futura/i.test(raw))return raw;
 if(/23505|duplicate|already exists/i.test(raw))return 'O envio encontrou um conflito. Tente selecionar a foto novamente.';
 if(err?.status===404||/PGRST205|schema cache|does not exist/i.test(raw))return 'O espaço de vocês ainda precisa ser ativado. Termine a configuração inicial no Supabase.';
 if(err?.status===401)return 'Sua sessão expirou. Entre novamente.';
 if(err?.status===403)return 'Sua conta não tem permissão para essa alteração.';
 if(/fetch|network|offline|failed to load|timeout|aborted/i.test(raw))return 'Não foi possível conectar. Confira a internet e tente novamente.';
 return 'Não foi possível concluir. Tente novamente em instantes.';
}
async function request(path,{method='GET',body,headers={},auth=true}={}){
 if(auth&&session&&session.expires_at<Date.now()/1000+90)await refreshSession();
 const h={apikey:PUBLISHABLE_KEY,...(auth&&session?{Authorization:`Bearer ${session.access_token}`}:{})};
 if(body!==undefined&&!(body instanceof Blob))h['Content-Type']='application/json';
 const res=await fetch(SUPABASE_URL+path,{method,headers:{...h,...headers},body:body===undefined?undefined:body instanceof Blob?body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const txt=await res.text();let data;try{data=txt?JSON.parse(txt):null}catch{data=null}
 if(!res.ok){const err=new Error(data?.msg||data?.message||data?.error_description||data?.error||`HTTP ${res.status}`);err.status=res.status;err.code=data?.code;throw err}
 return data;
}
async function refreshSession(){
 if(refreshing)return refreshing;
 refreshing=(async()=>{try{const data=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:{refresh_token:session.refresh_token}});persistSession(normalizeSession(data))}catch(err){if([400,401].includes(err.status)){persistSession(null);me=null;connected=false;members=[];goals=[];photos=[];render();}throw err}finally{refreshing=null}})();
 return refreshing;
}
async function sync({notify=false}={}){
 if(!session)return;
 const revision=authRevision;
 try{
  if(!session.user){session.user=await request('/auth/v1/user');persistSession(session)}
  const newMembers=await request('/rest/v1/conquista_members?select=user_id,person');
  if(revision!==authRevision)return;
  members=newMembers;me=members.find(m=>m.user_id===session.user.id)||null;
  if(!me){connected=false;render();showAuth('join');return}
  const [newGoals,newPhotos]=await Promise.all([request('/rest/v1/conquista_goals?select=*&order=goal,person'),readAllPhotos()]);
  if(revision!==authRevision)return;
  goals=newGoals;photos=newPhotos;connected=true;render();
  if(notify)toast('Tudo atualizado.');
 }catch(err){if(revision!==authRevision)return;connected=false;render();if(notify||session)toast(friendlyError(err),true)}
}
function goalStatus(id){
 return completionState(id,goals,connected);
}
function rowFor(id,person){return goals.find(g=>g.goal===id&&g.person===person)}
function statusLabel(id,status){if(status==='unknown')return 'A nossa próxima conquista';if(status==='completed')return id==='training'?'Os dois começaram!':'Conquista completa';if(id==='training')return 'Falta o primeiro passo dos dois';return status==='in_progress'?'Em progresso':'Ainda não começamos'}
function personStatus(id,person){const s=rowFor(id,person)?.status||'pending';return id==='training'?(s==='completed'?'Já começou':'Ainda não começou'):STATUS[s]}
function render(){
 const completed=connected?GOALS.filter(g=>goalStatus(g.id)==='completed').length:null;
 $('#progress-count').innerHTML=`${completed??'—'}<span> / 5</span>`;
 $('#progress-percent').textContent=completed===null?'—':`${completed*20}%`;
 $('#progress-ring').style.setProperty('--progress',`${(completed||0)*20}%`);
 $('#sync-label').textContent=connected?'Sincronizado':session?'Conexão pendente':'Entre para sincronizar';
 $('#refresh').classList.toggle('connected',connected);
 $('#account-label').textContent=me?PEOPLE[me.person]:'Entrar';
 $('#connection-note').hidden=connected;
 if(session&&!connected){$('#connection-note p').textContent='Seu espaço ainda não está disponível. Conclua a configuração ou tente atualizar.';$('#start').textContent='Minha conta →'}
 else{$('#connection-note p').innerHTML='<strong>Esse ano é de vocês.</strong> Entre para salvar os primeiros passos e acompanhar tudo juntos.';$('#start').textContent='Vamos começar →'}
 renderCards();
}
function renderCards(){
 const list=GOALS.filter(g=>filter==='all'||(filter==='in_progress'?((g.id==='training'&&connected&&goals.some(r=>r.goal==='training'&&r.status==='completed')&&goalStatus(g.id)!=='completed')||goalStatus(g.id)==='in_progress'):goalStatus(g.id)===filter));
 $('#empty-filter').hidden=!!list.length;
 $('#goal-grid').innerHTML=list.map(g=>{
  const s=goalStatus(g.id),i=GOALS.indexOf(g)+1;
  const people=g.id==='training'?`<div class="participant-panel">${Object.entries(PEOPLE).map(([p,name])=>`<div class="participant-line"><span class="avatar ${p==='leo'?'leo':''}">${p==='leo'?'L':'Z'}</span><strong>${name}</strong><span class="participant-state ${connected?(rowFor(g.id,p)?.status||'pending'):''}">${connected?personStatus(g.id,p):'Próximo passo'}</span></div>`).join('')}<p class="participant-panel-foot">Cada registro, uma nova versão de nós.<span class="photo-label">◫ Comparação da primeira à última foto</span></p></div>`:'';
  return `<button class="goal-card ${g.id} ${s}" data-goal="${g.id}" style="--accent:${g.color}" aria-label="${g.title}. ${statusLabel(g.id,s)}"><div><div class="card-heading"><span class="icon-tile">${icon(g.id)}</span><span class="card-index">0${i} / 05</span></div><h3>${g.title}</h3><p class="desc">${g.desc}</p><div class="card-bottom"><div class="card-footer-left"><span class="badge ${s}">${statusLabel(g.id,s)}</span>${g.kind==='shared'?'<span class="card-avatars"><span class="avatar">Z</span><span class="avatar leo">L</span></span>':''}</div><span class="card-arrow">↗</span></div></div>${people}</button>`;
 }).join('');
 $$('[data-goal]').forEach(b=>b.onclick=()=>openGoal(b.dataset.goal));
}
function openDialog(id){const d=$('#'+id);if(!d.open)d.showModal();document.body.style.overflow='hidden'}
function closeDialog(id){$('#'+id).close();if(!$$('dialog[open]').length)document.body.style.overflow=''}
$$('[data-close]').forEach(b=>b.onclick=()=>closeDialog(b.dataset.close));
$$('dialog').forEach(d=>{d.addEventListener('close',()=>{if(!$$('dialog[open]').length)document.body.style.overflow=''});d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(d.id)}})});
function openGoal(id){activeGoal=id;selectedPerson=me?.person||'zayan';renderGoal();openDialog('goal-dialog')}
function renderGoal(){
 const g=GOALS.find(g=>g.id===activeGoal);if(!g)return;
 const individual=g.kind==='individual',person=individual?selectedPerson:'both',row=rowFor(g.id,person),own=canEditPerson(me?.person,person),status=row?.status||'pending';
 $('#goal-kicker').textContent=`CONQUISTA 0${GOALS.indexOf(g)+1} / 05`;
 let html=`<div class="icon-tile detail-icon" style="--accent:${g.color}">${icon(g.id)}</div><h2>${g.title}</h2><p class="detail-desc">${g.detail}</p>`;
 if(!connected){html+='<div class="own-note" style="margin-top:22px">Entre na sua conta para ver e atualizar o progresso de vocês.</div><button class="primary wide" id="detail-login">Entrar no nosso espaço ↗</button>';$('#goal-content').innerHTML=html;$('#detail-login').onclick=()=>showAuth('login');return}
 if(individual)html+=`<div class="people-tabs" role="group" aria-label="Escolher perfil">${Object.entries(PEOPLE).map(([p,n])=>`<button data-person="${p}" class="${p===person?'active':''}" aria-pressed="${p===person}"><span class="avatar ${p==='leo'?'leo':''}">${p==='leo'?'L':'Z'}</span>${n}</button>`).join('')}</div>`;
 else html+='<span class="detail-shared">Zayan + Léo · conquista compartilhada</span>';
 if(!own)html+=`<p class="own-note">Você está acompanhando ${PEOPLE[person]}. Somente ele pode alterar o próprio progresso e suas fotos.</p>`;
 if(g.id==='training')html+=`<div class="status-control"><label class="check-start"><input type="checkbox" id="training-start" ${status==='completed'?'checked':''} ${!own?'disabled':''}><span><strong>Já comecei a treinar</strong><small>${status==='completed'?'Primeiro passo dado. Agora é manter o ritmo!':'Marque quando der o seu primeiro passo.'}</small></span></label></div>`;
 else if(g.id==='celebrate')html+=`<div class="celebrate-banner"><span aria-hidden="true">✳</span><p>${status==='completed'?'Vitórias celebradas. Que venham as próximas!':'Vocês chegaram até aqui juntos.<br>Essa parte também merece sair do papel.'}</p><button class="primary" id="celebrate" ${!own?'disabled':''}>${status==='completed'?'✓ Comemoração concluída':'Comemoramos nossas conquistas! ↗'}</button>${status==='completed'&&own?'<div><button class="text-button" id="undo-celebrate">Desfazer marcação</button></div>':''}</div>`;
 else html+=`<div class="status-control"><span class="field-title">${individual?'Meu progresso':'Nosso progresso'}</span><div class="status-buttons">${Object.entries(STATUS).map(([s,label])=>`<button data-status="${s}" class="${s===status?'selected':''}" aria-pressed="${s===status}" ${!own?'disabled':''}>${label}</button>`).join('')}</div></div>`;
 if(g.id!=='training')html+=`<div class="notes"><label class="field-title" for="goal-notes">${g.id==='pc'?'Peças e próximos passos':g.id==='celebrate'?'Como vamos comemorar?':'Planos e próximos passos'}</label><textarea id="goal-notes" maxlength="3000" placeholder="${g.id==='pc'?'Ex.: já comprei o gabinete. Próxima peça: placa de vídeo.':'Uma ideia, uma data ou o próximo passo…'}" ${!own?'readonly':''}>${escapeHTML(row?.notes||'')}</textarea>${own?'<button class="secondary save-notes" id="save-notes">Salvar anotação</button>':''}</div>`;
 html+='<div class="sheet-saving" id="save-indicator">Alterações salvas online</div>';
 if(g.id==='training')html+=`<section class="photos-section"><div class="photos-header"><div><h3>Evolução de ${PEOPLE[person]}</h3><span>Sem limite semanal · primeira e última lado a lado</span></div><button class="secondary compare-button" id="compare" disabled>◫ Comparar</button></div>${own?`<div class="upload-box"><p><strong>Cada passo merece um registro.</strong>Escolha a data e envie uma ou mais fotos. Elas são reduzidas para economizar espaço.</p><input type="date" id="photo-date" value="${today()}" max="${today()}" aria-label="Data da foto"><button class="primary" id="upload-photo">+ Adicionar fotos</button><input id="photo-file" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden></div>`:''}<div id="photo-gallery" aria-live="polite"></div></section>`;
 $('#goal-content').innerHTML=html;
 $$('[data-person]').forEach(b=>b.onclick=()=>{if(busy)return;selectedPerson=b.dataset.person;renderGoal()});
 const save=(s,n)=>saveGoal(g.id,person,s,n);
 if($('#training-start'))$('#training-start').onchange=e=>save(e.target.checked?'completed':'pending');
 $$('[data-status]').forEach(b=>b.onclick=()=>save(b.dataset.status));
 if($('#celebrate'))$('#celebrate').onclick=()=>{if(status!=='completed')save('completed')};
 if($('#undo-celebrate'))$('#undo-celebrate').onclick=()=>save('pending');
 if($('#save-notes'))$('#save-notes').onclick=()=>save(undefined,$('#goal-notes').value);
 if(g.id==='training'){
  if($('#upload-photo')){$('#upload-photo').onclick=()=>{if(!$('#photo-date').value){toast('Escolha a data da foto.',true);return}$('#photo-file').click()};$('#photo-file').onchange=()=>uploadPhotos([...$('#photo-file').files],person)}
  renderPhotos(person);
 }
}
async function saveGoal(goal,person,status,notes){
 if(busy)return;if(!canEditPerson(me?.person,person)){toast('Você só pode alterar suas próprias metas individuais.',true);return}busy=true;const old=rowFor(goal,person);const unsavedNotes=$('#goal-notes')?.value;
 const patch={};if(status!==undefined)patch.status=status;if(notes!==undefined)patch.notes=notes;
 $('#goal-content').classList.add('loading');if($('#save-indicator'))$('#save-indicator').textContent='Salvando…';
 try{const data=await request(`/rest/v1/conquista_goals?goal=eq.${goal}&person=eq.${person}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:patch});if(!data?.length)throw Object.assign(new Error('Permission denied'),{status:403});goals=goals.map(g=>g===old?data[0]:g);render();renderGoal();if(notes===undefined&&unsavedNotes!==undefined&&$('#goal-notes'))$('#goal-notes').value=unsavedNotes;toast(status==='completed'?'Mais um passo na nossa história!':'Alteração salva online.')}catch(err){renderGoal();if(unsavedNotes!==undefined&&$('#goal-notes'))$('#goal-notes').value=unsavedNotes;toast(friendlyError(err),true)}finally{busy=false;$('#goal-content').classList.remove('loading')}
}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function dateLabel(date){return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))}
function photoList(person){const id=members.find(m=>m.person===person)?.user_id;return photos.filter(p=>p.user_id===id).sort(comparePhotoDates)}
async function readAllPhotos(){
 const result=[];let offset=0;
 for(;;){const page=await request(`/rest/v1/conquista_photos?select=*&order=captured_on.asc,created_at.asc,id.asc&limit=500&offset=${offset}`);result.push(...page);if(page.length<500)return result;offset+=page.length}
}
async function signedURL(path){const old=signedCache.get(path);if(old&&old.until>Date.now())return old.url;const data=await request('/storage/v1/object/sign/conquista-evolucao/'+path,{method:'POST',body:{expiresIn:3600}});const url=data.signedURL.startsWith('http')?data.signedURL:SUPABASE_URL+'/storage/v1'+data.signedURL;signedCache.set(path,{url,until:Date.now()+3300000});return url}
async function renderPhotos(person){
 const list=photoList(person),gallery=$('#photo-gallery');if(!gallery)return;
 $('#compare').disabled=list.length<2;$('#compare').onclick=()=>comparePhotos(person);
 if(!list.length){gallery.innerHTML='<p class="photo-placeholder">A primeira foto é o começo da sua história.<br>As próximas vão mostrar o quanto você evoluiu.</p>';return}
 gallery.innerHTML='<p class="photo-placeholder">Carregando suas fotos…</p>';
 const images=await Promise.all(list.map(async(p)=>{try{return {...p,url:await signedURL(p.storage_path)}}catch{return {...p,url:null}}}));
 if(selectedPerson!==person||activeGoal!=='training'||!gallery.isConnected)return;
 gallery.innerHTML=`<div class="photo-grid">${images.map((p,i)=>`<figure class="photo-card">${p.url?`<img src="${escapeHTML(p.url)}" loading="lazy" alt="Evolução de ${PEOPLE[person]} em ${dateLabel(p.captured_on)}" data-view="${p.id}">`:'<div class="photo-placeholder">Não foi possível carregar esta foto. Tente atualizar.</div>'}<figcaption><span>${i===0?'Início · ':''}${dateLabel(p.captured_on)}</span>${me?.person===person?`<span class="photo-actions"><button data-edit="${p.id}" aria-label="Editar data da foto de ${dateLabel(p.captured_on)}">Editar</button><button data-delete="${p.id}" aria-label="Excluir foto de ${dateLabel(p.captured_on)}">Excluir</button></span>`:''}</figcaption></figure>`).join('')}</div>`;
 $$('[data-delete]',gallery).forEach(b=>b.onclick=()=>deletePhoto(b.dataset.delete));
 $$('[data-edit]',gallery).forEach(b=>b.onclick=()=>viewPhoto(images.find(p=>p.id===b.dataset.edit),person));
 $$('[data-view]',gallery).forEach(img=>img.onclick=()=>viewPhoto(images.find(p=>p.id===img.dataset.view),person));
}
async function compressPhoto(file){
 if(file.size>25*1024*1024)throw new Error('A foto precisa ter menos de 25 MB.');
 let bitmap;try{bitmap=await createImageBitmap(file)}catch{throw new Error('Não consegui abrir essa foto. Escolha uma imagem JPG, PNG ou WebP.')}
 const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));if(!blob||blob.size>3*1024*1024)throw new Error('Não consegui reduzir a foto. Escolha outra imagem.');return blob;
}
async function uploadPhotos(files,person){
 if(!files.length||busy||!canEditPerson(me?.person,person))return;const date=$('#photo-date').value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today()){toast('Escolha uma data válida, até hoje.',true);return}
 busy=true;$('#upload-photo').disabled=true;let saved=0;
 try{
  for(const file of files){
   if($('#upload-photo'))$('#upload-photo').textContent=`Enviando ${saved+1}/${files.length}…`;
   const id=crypto.randomUUID(),path=photoPath(session.user.id,id);let uploaded=false;
   try{
    const blob=await compressPhoto(file);
    await request('/storage/v1/object/conquista-evolucao/'+path,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'false'},body:blob});uploaded=true;
    const data=await request('/rest/v1/conquista_photos',{method:'POST',headers:{Prefer:'return=representation'},body:{id,user_id:session.user.id,captured_on:date,storage_path:path}});photos.push(data[0]);saved++;
   }catch(err){if(uploaded)try{await request('/storage/v1/object/conquista-evolucao',{method:'DELETE',body:{prefixes:[path]}})}catch{}throw err}
  }
  toast(saved===1?'Foto salva online. Mais um registro da sua evolução!':`${saved} fotos salvas online!`);
 }catch(err){const message=/foto|imagem|MB|JPG/.test(err.message)?err.message:friendlyError(err);toast((saved?`${saved} foto(s) já salva(s). `:'')+message,true)}finally{busy=false;if(activeGoal==='training')renderGoal()}
}
async function deletePhoto(id){
 if(busy)return;const p=photos.find(p=>p.id===id);if(!p||!canManagePhoto(session?.user?.id,p.user_id))return;
 if(!confirm('Excluir esta foto da evolução? Ela será removida para vocês dois.'))return;
 busy=true;
 try{
  // Apaga o arquivo primeiro: se falhar, o registro continua disponível para tentar novamente.
  await request('/storage/v1/object/conquista-evolucao',{method:'DELETE',body:{prefixes:[p.storage_path]}});
  await request('/rest/v1/conquista_photos?id=eq.'+id,{method:'DELETE'});
  photos=photos.filter(x=>x.id!==id);signedCache.delete(p.storage_path);renderGoal();toast('Foto excluída.');
 }catch(err){toast(friendlyError(err),true)}finally{busy=false}
}
async function comparePhotos(person){
 const list=photoList(person);if(list.length<2)return;
 try{const first=list[0],last=list.at(-1);const urls=await Promise.all([signedURL(first.storage_path),signedURL(last.storage_path)]);$('#compare-content').innerHTML=`<h2>A evolução de ${PEOPLE[person]}.</h2><p class="compare-description">O mesmo objetivo. ${list.length} registros de uma nova versão.</p><div class="compare-photos"><figure><img src="${escapeHTML(urls[0])}" alt="Primeira foto de ${PEOPLE[person]}"><figcaption><strong>O COMEÇO</strong><span>${dateLabel(first.captured_on)}</span></figcaption></figure><figure><img src="${escapeHTML(urls[1])}" alt="Foto mais recente de ${PEOPLE[person]}"><figcaption><strong>ATÉ AQUI</strong><span>${dateLabel(last.captured_on)}</span></figcaption></figure></div>`;openDialog('compare-dialog')}catch(err){toast(friendlyError(err),true)}
}
function viewPhoto(photo,person){
 if(!photo?.url)return;const own=canManagePhoto(session?.user?.id,photo.user_id);
 $('#compare-content').innerHTML=`<h2>${PEOPLE[person]} · evolução</h2><p class="compare-description">${dateLabel(photo.captured_on)}</p><img src="${escapeHTML(photo.url)}" alt="Registro da evolução de ${PEOPLE[person]}" style="width:100%;max-height:60vh;object-fit:contain;margin-top:18px;border-radius:12px;background:#10160d">${own?`<form class="auth-form" id="edit-photo-form"><label>Data da foto<input type="date" name="date" value="${photo.captured_on}" max="${today()}" required></label><button class="primary" type="submit">Salvar data</button></form>`:''}`;
 if(own)$('#edit-photo-form').onsubmit=e=>{e.preventDefault();editPhotoDate(photo.id,new FormData(e.currentTarget).get('date'))};openDialog('compare-dialog');
}
async function editPhotoDate(id,date){
 if(busy)return;const photo=photos.find(p=>p.id===id);if(!photo||!canManagePhoto(session?.user?.id,photo.user_id))return;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today()){toast('Escolha uma data válida, até hoje.',true);return}
 busy=true;const button=$('#edit-photo-form button');if(button)button.disabled=true;
 try{const data=await request('/rest/v1/conquista_photos?id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=representation'},body:{captured_on:date}});if(!data?.length)throw Object.assign(new Error('Permission denied'),{status:403});photos=photos.map(p=>p.id===id?data[0]:p);closeDialog('compare-dialog');renderGoal();toast('Data da foto atualizada.')}catch(err){toast(friendlyError(err),true)}finally{busy=false;if(button?.isConnected)button.disabled=false}
}
function authMessage(message,success=false){const e=$('#auth-message');if(e){e.textContent=message;e.classList.toggle('success',success)}}
function showAuth(mode='login'){
 if(session&&me&&mode!=='recovery')mode='profile';else if(session&&!me&&mode==='login')mode='join';
 activeAuthMode=mode;
 const c=$('#auth-content');
 if(mode==='profile'){
  c.innerHTML=`<h2>O nosso espaço.</h2><p class="auth-description">Seu progresso fica salvo online e acompanha você em qualquer celular.</p><div class="account-profile"><span class="avatar ${me.person==='leo'?'leo':''}">${me.person==='leo'?'L':'Z'}</span><div><strong>${PEOPLE[me.person]}</strong><small>${escapeHTML(session.user.email)}</small></div></div><div class="account-stats"><div><strong>${goals.filter(g=>g.person===me.person&&g.status==='completed').length}</strong><span>passos individuais concluídos</span></div><div><strong>${photoList(me.person).length}</strong><span>fotos da sua evolução</span></div></div><button class="secondary wide" id="account-refresh">Atualizar conquistas ↻</button><button class="text-button" id="logout" style="margin-top:17px">Sair da minha conta</button>`;
  $('#logout').onclick=logout;$('#account-refresh').onclick=()=>sync({notify:true});openDialog('auth-dialog');return;
 }
 if(mode==='recovery'){
  c.innerHTML='<h2>Uma nova senha.</h2><p class="auth-description">Escolha uma senha para voltar ao seu espaço.</p><form class="auth-form" id="auth-form"><label>Nova senha<input name="password" type="password" required minlength="8" autocomplete="new-password"></label><p class="inline-message" id="auth-message" role="alert"></p><button class="primary wide" type="submit">Salvar nova senha</button></form>';
 }else if(mode==='join'){
  c.innerHTML='<h2>Seu lugar na história.</h2><p class="auth-description">Vincule sua conta a um dos dois perfis com o convite recebido na configuração inicial.</p><form class="auth-form" id="auth-form"><label>Quem é você?<select name="person"><option value="zayan">Zayan</option><option value="leo">Léo</option></select></label><label>Código do seu convite<input name="invite" type="text" required autocomplete="off" placeholder="Cole seu código aqui" spellcheck="false"></label><p class="inline-message" id="auth-message" role="alert"></p><button class="primary wide" type="submit">Entrar na nossa história ↗</button></form><button class="text-button" id="join-logout" style="margin-top:17px">Sair e usar outra conta</button>';
  $('#join-logout').onclick=logout;
 }else{
  const signup=mode==='signup',reset=mode==='reset';
  c.innerHTML=`<h2>${reset?'Vamos recuperar?':'Nossa história começa aqui.'}</h2><p class="auth-description">${reset?'Você vai receber um link para escolher uma nova senha.':'Zayan e Léo. Cinco metas para transformar 2027.'}</p>${!reset?`<div class="form-tabs"><button data-auth="login" class="${!signup?'active':''}">Entrar</button><button data-auth="signup" class="${signup?'active':''}">Criar minha conta</button></div>`:''}<form class="auth-form" id="auth-form"><label>Seu e-mail<input name="email" type="email" required autocomplete="email" placeholder="voce@email.com"></label>${!reset?`<label>Sua senha<input name="password" type="password" required ${signup?'minlength="8"':''} autocomplete="${signup?'new-password':'current-password'}" placeholder="${signup?'Pelo menos 8 caracteres':'Digite sua senha'}"></label>`:''}<p class="inline-message" id="auth-message" role="alert"></p><button class="primary wide" type="submit">${reset?'Enviar link':signup?'Criar minha conta ↗':'Entrar no nosso espaço ↗'}</button>${!signup&&!reset?'<button type="button" class="text-button" data-auth="reset">Esqueci minha senha</button>':''}</form><p class="auth-footnote">${signup?'Depois de confirmar o e-mail, você usa seu convite para vincular o perfil. Cada pessoa só altera o próprio progresso.':reset?'<button class="text-button" data-auth="login">Voltar para entrar</button>':'As fotos e o progresso ficam disponíveis apenas para os dois perfis autorizados.'}</p>`;
  $$('[data-auth]',c).forEach(b=>b.onclick=()=>showAuth(b.dataset.auth));
 }
 $('#auth-form').onsubmit=submitAuth;
 openDialog('auth-dialog');
}
async function submitAuth(e){
 e.preventDefault();const f=e.currentTarget,form=new FormData(f),button=$('button[type=submit]',f),mode=activeAuthMode;button.disabled=true;authMessage('');
 try{
  if(mode==='join'){
   await request('/rest/v1/rpc/conquista_join',{method:'POST',body:{chosen_person:form.get('person'),invite_code:String(form.get('invite')).trim()}});closeDialog('auth-dialog');await sync();if(me){toast(`Seu espaço está pronto, ${PEOPLE[me.person]}!`);if(activeGoal)renderGoal()}
  }else if(mode==='recovery'){
   await request('/auth/v1/user',{method:'PUT',body:{password:form.get('password')}});closeDialog('auth-dialog');toast('Nova senha salva.');await sync();
  }else if(mode==='reset'){
   await request('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+location.pathname),{method:'POST',auth:false,body:{email:String(form.get('email')).trim()}});authMessage('Se esse e-mail tiver uma conta, o link de recuperação chegará em instantes.',true);
  }else if(mode==='signup'){
   const data=await request('/auth/v1/signup?redirect_to='+encodeURIComponent(location.origin+location.pathname),{method:'POST',auth:false,body:{email:String(form.get('email')).trim(),password:form.get('password')}});
   if(data.access_token){authRevision++;persistSession(normalizeSession(data));await sync()}else{authMessage('Confira seu e-mail e confirme o cadastro. Depois volte aqui e entre com sua senha.',true);f.reset()}
  }else{
   const data=await request('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email:String(form.get('email')).trim(),password:form.get('password')}});authRevision++;persistSession(normalizeSession(data));closeDialog('auth-dialog');await sync();if(me&&activeGoal)renderGoal();
  }
 }catch(err){authMessage(friendlyError(err))}finally{if(button.isConnected)button.disabled=false}
}
async function logout(){
 const token=session?.access_token;authRevision++;persistSession(null);me=null;members=[];goals=[];photos=[];signedCache.clear();connected=false;closeDialog('auth-dialog');closeDialog('goal-dialog');closeDialog('compare-dialog');$('#photo-gallery')?.replaceChildren();$('#compare-content').replaceChildren();render();toast('Você saiu da sua conta.');
 if(token)try{await fetch(SUPABASE_URL+'/auth/v1/logout',{method:'POST',headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)})}catch{}
}
$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderCards()});
$('#refresh').onclick=()=>session?sync({notify:true}):showAuth();
$('#account').onclick=()=>showAuth();$('#start').onclick=()=>showAuth();$('#nav-account').onclick=()=>showAuth();
$('#nav-evolution').onclick=()=>openGoal('training');$('#nav-goals').onclick=()=>{$('#goals-heading').scrollIntoView({behavior:'smooth',block:'start'})};
let syncing=false;setInterval(async()=>{if(session&&me&&!busy&&!syncing&&document.visibilityState==='visible'){syncing=true;try{await sync()}finally{syncing=false}}},30000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&session&&!busy)sync()});
window.addEventListener('storage',e=>{if(e.key===SESSION_KEY){authRevision++;try{session=JSON.parse(e.newValue||'null')}catch{session=null}if(session)sync();else{me=null;members=[];goals=[];photos=[];connected=false;signedCache.clear();$$('dialog[open]').forEach(d=>closeDialog(d.id));$('#goal-content').replaceChildren();$('#compare-content').replaceChildren();render()}}});
async function initialize(){
 render();
 const hash=new URLSearchParams(location.hash.slice(1));
 if(hash.has('error_description')){toast(hash.get('error_description'),true);history.replaceState(null,'',location.pathname+location.search)}
 if(hash.has('access_token')){
  authRevision++;persistSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Number(hash.get('expires_at'))||Math.floor(Date.now()/1000)+Number(hash.get('expires_in')||3600)});const recovery=hash.get('type')==='recovery';history.replaceState(null,'',location.pathname+location.search);
  if(recovery){showAuth('recovery');return}
 }
 if(session)await sync();
}
initialize();
