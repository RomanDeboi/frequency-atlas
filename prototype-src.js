// Frequency Atlas: standalone local prototype + optional /cloud data adapter (injected by Next.js).
const colors = {uav:'var(--uav)',wifi:'var(--wifi)',bluetooth:'var(--bluetooth)',cellular:'var(--cellular)',gnss:'var(--gnss)',vhf:'var(--vhf)',uhf:'var(--uhf)',other:'var(--other)'};
const labels = {uav:'БПЛА',wifi:'Wi‑Fi',bluetooth:'Bluetooth',cellular:'GSM / LTE / 5G',gnss:'GNSS',vhf:'VHF',uhf:'UHF',other:'Інше'};
const demoData=[
{id:'airband',entity:'Civil aviation voice',band:'VHF Airband',cat:'vhf',a:118,b:137,purpose:'Voice / aviation communications',tech:'AM',desc:'Демонстраційний довідковий запис цивільного VHF авіадіапазону.',tags:['VHF','aviation','voice','AM']},
{id:'ism433',entity:'Short-range devices',band:'433 MHz reference region',cat:'uhf',a:433.05,b:434.79,purpose:'Short-range devices / telemetry examples',tech:'Various',desc:'Довідкова область для прикладу. Регуляторні правила залежать від країни.',tags:['UHF','SRD','telemetry']},
{id:'uav1',entity:'Example UAV profile',band:'Demo control link',cat:'uav',a:915,b:928,purpose:'Demo only — control / telemetry',tech:'Example record',desc:'Вигаданий демонстраційний запис, який показує структуру картки БПЛА.',tags:['UAV','control','demo']},
{id:'wifi',entity:'Wi‑Fi',band:'2.4 GHz',cat:'wifi',a:2400,b:2483.5,purpose:'Wireless LAN',tech:'IEEE 802.11',desc:'Довідковий запис для області Wi‑Fi 2.4 GHz / ISM.',tags:['Wi-Fi','2.4 GHz','OFDM','DSSS']},
{id:'bt',entity:'Bluetooth',band:'2.4 GHz',cat:'bluetooth',a:2402,b:2480,purpose:'Short-range data',tech:'Bluetooth Classic / LE',desc:'Довідковий запис Bluetooth у 2.4 GHz ISM.',tags:['Bluetooth','FHSS','2.4 GHz']},
{id:'uav2',entity:'Example UAV profile',band:'Demo video link',cat:'uav',a:5725,b:5850,purpose:'Demo only — video/data',tech:'Example record',desc:'Другий вигаданий діапазон того самого демонстраційного об’єкта.',tags:['UAV','video','demo']}
];
const MAX=7000, MINSPAN=2, DB_NAME='frequency-atlas-offline-v2';
let data=[], center=2450, span=500, selected=null, enabled=new Set(Object.keys(labels)), drag=null, store=null, editingId=null, entityIdForForm=null, imageBusy=false, saving=false, exportBusy=false;
const cloudMode=new URLSearchParams(location.search).get('cloud')==='1';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fmt=v=>v>=1000?(v/1000).toFixed(v>=10000?2:3)+' GHz':(v>=10?(v%1?v.toFixed(2):v.toFixed(0)):v.toFixed(3))+' MHz';
function parseFreq(s){const m=String(s).trim().toLowerCase().replace(',','.').replace(/\s/g,'').match(/^([0-9]+(?:\.[0-9]+)?)(ghz|g|mhz|m|khz|k|hz)?$/);if(!m)return null;let v=Number(m[1]);const u=m[2]||'mhz';if(u==='ghz'||u==='g')v*=1000;else if(u==='khz'||u==='k')v/=1000;else if(u==='hz')v/=1e6;return Number.isFinite(v)?v:null}
function normalize(s){return String(s||'').toLowerCase().replace(/[‑–—]/g,'-').replace(/,/g,'.').replace(/\s+/g,' ').trim()}
function matches(d,search){const q=normalize(search);if(!q)return true;const hay=normalize([d.entity,d.band,labels[d.cat],d.cat,d.purpose,d.tech,d.desc,...(d.tags||[]),d.a,d.b,`${d.a}-${d.b} MHz`,...(d.images||[]).map(x=>x.caption)].join(' '));return q.split(' ').every(t=>{const f=parseFreq(t);return (f!==null&&f>=d.a&&f<=d.b)||hay.includes(t)})}
function stepFor(s){const r=s/10,p=10**Math.floor(Math.log10(r)),n=r/p;return (n<1.5?1:n<3?2:n<7?5:10)*p}
function range(){const a=clamp(center-span/2,0,MAX),b=clamp(center+span/2,0,MAX);return[a,b,b-a||span]}
function notify(message, bad=false){const e=$('#notice');e.textContent=message;e.classList.toggle('bad',bad);e.classList.remove('hide');clearTimeout(notify.timer);notify.timer=setTimeout(()=>e.classList.add('hide'),4300)}
function openDb(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window))return reject(new Error('IndexedDB недоступна у цьому браузері.'));const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('bands',{keyPath:'id'});db.createObjectStore('meta',{keyPath:'key'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function txRequest(name,method,...args){return new Promise((resolve,reject)=>{const tx=store.transaction(name,'readonly'),req=tx.objectStore(name)[method](...args);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function saveAll(records){return new Promise((resolve,reject)=>{const tx=store.transaction(['bands','meta'],'readwrite');const object=tx.objectStore('bands');object.clear();records.forEach(record=>object.put(record));tx.objectStore('meta').put({key:'initialized',value:true});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Не вдалося записати дані'))})}
async function persist(next,selection=selected){
  if(saving){notify('Дочекайся завершення попереднього збереження.',true);return false}
  saving=true;
  $('#storageStatus').textContent=cloudMode?'Синхронізація з хмарою…':'Збереження в браузері…';
  try{
    let warning;
    if(cloudMode){const outcome=await window.AtlasCloud.save(next);data=outcome.records;warning=outcome.warning}
    else{await saveAll(next);data=next}
    selected=selection && data.some(d=>d.id===selection)?selection:data[0]?.id??null;
    render();renderGlobalSearch();
    if(warning)notify(warning,true);
    return true;
  }catch(e){notify('Не вдалося зберегти: '+e.message,true);return false}
  finally{saving=false;$('#storageStatus').textContent=cloudMode?'Приватна хмарна база · Supabase':'Локальна база · IndexedDB'}
}
async function load(){
  if(saving){notify('Спочатку заверши збереження.',true);return}
  try{
    $('#storageStatus').textContent=cloudMode?'Завантаження з хмари…':'Завантаження локальної бази…';
    if(cloudMode){
      if(!window.AtlasCloud)throw Error('Відкрий приватну базу через /cloud і увійди в акаунт.');
      data=await window.AtlasCloud.load();
      const aside=$('.asideNote');if(aside)aside.textContent='Хмарні дані цього акаунта. Експорт JSON створює переносиму копію зі скриншотами. Автономна база окрема.';
    }else{
      store=await openDb();
      const marker=await txRequest('meta','get','initialized');
      if(!marker){const seeded=demoData.map(d=>({...d,entityId:d.entity==='Example UAV profile'?'demo-uav':d.id,images:[]}));await saveAll(seeded)}
      data=await txRequest('bands','getAll');
    }
    selected=selected&&data.some(d=>d.id===selected)?selected:data.find(d=>d.id==='wifi')?.id??data[0]?.id??null;
    $('#storageStatus').textContent=cloudMode?'Приватна хмарна база · Supabase':'Локальна база · IndexedDB';
    $('#newBtn').disabled=false;$('#importBtn').disabled=false;
    renderFilters();render();renderGlobalSearch();
  }catch(e){
    if(cloudMode){data=[];selected=null;$('#storageStatus').textContent='Помилка хмарної бази';$('#newBtn').disabled=true;$('#importBtn').disabled=true;renderFilters();render();notify('Не вдалося відкрити хмарну базу: '+e.message,true);return}
    data=demoData.map(d=>({...d,entityId:d.id,images:[]}));selected=data[0]?.id??null;
    $('#storageStatus').textContent='Збереження недоступне';$('#newBtn').disabled=true;$('#importBtn').disabled=true;
    renderFilters();render();notify('Не вдалося відкрити локальну базу. Перевір налаштування браузера: '+e.message,true);
  }
}
function renderFilters(){$('#filters').innerHTML=Object.entries(labels).map(([key,label])=>`<label class="filter"><input type="checkbox" data-cat="${key}" ${enabled.has(key)?'checked':''}><span class="dot" style="background:${colors[key]}"></span><span>${label}</span></label>`).join('');$$('[data-cat]').forEach(el=>el.onchange=()=>{el.checked?enabled.add(el.dataset.cat):enabled.delete(el.dataset.cat);render()})}
function select(id){selected=id;render()}
function renderSelected(){const d=data.find(x=>x.id===selected);$('#selected').innerHTML=d?`<small>${escapeHtml(labels[d.cat])}</small><strong>${escapeHtml(d.entity)}</strong><span>${escapeHtml(d.band)}</span><small>${escapeHtml(d.a)}–${escapeHtml(d.b)} MHz</small><button class="ghost smallBtn" data-card="${escapeHtml(d.id)}">Відкрити картку</button>`:'<small>Нічого не вибрано</small>';const button=$('#selected [data-card]');if(button)button.onclick=()=>openCard(d.id)}
function renderMap(){const [a,b,w]=range();$('#centerStat').textContent=fmt(center);$('#spanStat').textContent=fmt(w);$('#cursorLabel').textContent=fmt(center);$('#startLabel').textContent=fmt(a);$('#endLabel').textContent=fmt(b);const visible=data.filter(x=>enabled.has(x.cat)&&x.b>=a&&x.a<=b);$('#visibleStat').textContent=visible.length;const step=stepFor(w);let ticks='';for(let v=Math.ceil(a/step)*step;v<=b+step*.001;v+=step)ticks+=`<div class="tick" style="left:${((v-a)/w)*100}%"><span>${fmt(v)}</span></div>`;$('#axis').innerHTML=ticks;const lanes=[];[...visible].sort((x,y)=>x.a-y.a).forEach(d=>{const lane=lanes.find(l=>l[l.length-1].b+w*.008<d.a);lane?lane.push(d):lanes.push([d])});let html='';lanes.forEach((lane,i)=>lane.forEach(d=>{const s=Math.max(a,d.a),e=Math.min(b,d.b),left=(s-a)/w*100,width=Math.max((e-s)/w*100,.35);html+=`<button class="band ${d.id===selected?'sel':''}" data-id="${escapeHtml(d.id)}" title="${escapeHtml(d.entity+' · '+d.band)}" style="left:${left}%;width:${width}%;top:${i*72+18}px;background:${colors[d.cat]}"><strong>${escapeHtml(d.entity)}</strong><span>${escapeHtml(d.band)}</span></button>`}));$('#bands').innerHTML=html||'<div class="noBands">У цьому вікні немає записів.</div>';$$('.band').forEach(el=>{el.onpointerdown=e=>e.stopPropagation();el.onclick=()=>select(el.dataset.id);el.ondblclick=()=>openCard(el.dataset.id)});$('#bands').style.minHeight=Math.max(330,lanes.length*72+50)+'px';$('#overview').style.left=(a/MAX*100)+'%';$('#overview').style.width=Math.max(w/MAX*100,.6)+'%'}
function renderDb(){const term=$('#search').value.trim(),arr=data.filter(x=>enabled.has(x.cat)&&matches(x,term));$('#list').innerHTML=arr.map(d=>`<button class="row ${d.id===selected?'active':''}" data-row="${escapeHtml(d.id)}"><span class="dot" style="background:${colors[d.cat]}"></span><div><strong>${escapeHtml(d.entity)}</strong><span>${escapeHtml(d.band)}</span></div><small>${escapeHtml(d.a)}–${escapeHtml(d.b)}</small></button>`).join('')||'<div class="noBands">Нічого не знайдено.</div>';$$('[data-row]').forEach(el=>el.onclick=()=>select(el.dataset.row));const d=data.find(x=>x.id===selected)||arr[0];if(!d){$('#detail').innerHTML='<div class="noBands">Вибери запис або створи новий.</div>';return}const related=data.filter(x=>x.entityId===d.entityId&&x.id!==d.id);$('#detail').innerHTML=`
<div class="detailActions"><small>${escapeHtml(labels[d.cat])}</small><span class="spacer"></span><button class="ghost" id="editBtn">Редагувати</button><button class="ghost" id="addRelatedBtn">+ Діапазон</button><button class="ghost danger" id="deleteBtn">Видалити</button></div>
<h3>${escapeHtml(d.entity)}</h3><div class="muted">${escapeHtml(d.band)}</div><div class="range">${fmt(d.a)} — ${fmt(d.b)}</div>
<div class="facts"><div class="fact"><span>Призначення</span><strong>${escapeHtml(d.purpose||'Не вказано')}</strong></div><div class="fact"><span>Технологія</span><strong>${escapeHtml(d.tech||'Не вказано')}</strong></div></div>
<div class="sub"><h4>Опис</h4><p class="description">${escapeHtml(d.desc||'Опис ще не додано.')}</p></div>
<div class="sub"><h4>Теги</h4><div class="tagGroup">${(d.tags||[]).map(t=>`<span>${escapeHtml(t)}</span>`).join('')||'<small>Поки немає</small>'}</div></div>
${related.length?`<div class="sub"><h4>Інші діапазони цього об’єкта</h4><div class="related">${related.map(b=>`<button class="ghost" data-related="${escapeHtml(b.id)}">${escapeHtml(b.band)} · ${fmt(b.a)}–${fmt(b.b)}</button>`).join('')}</div></div>`:''}
<div class="sub"><div class="subHead"><h4>Зразки спектра · ${(d.images||[]).length}</h4></div><div class="imageUpload"><select id="imageKind" aria-label="Тип скриншота"><option value="spectrum">Spectrum</option><option value="waterfall">Waterfall</option><option value="other">Інше</option></select><label class="ghost uploadButton">＋ Додати PNG/JPG<input type="file" id="imagesInput" accept="image/png,image/jpeg,image/webp" multiple hidden></label></div><div class="shots">${(d.images||[]).map(im=>`<div class="imageTile"><button class="thumb" data-view="${escapeHtml(im.id)}"><img src="${escapeHtml(im.dataUrl||'')}" alt="${escapeHtml(im.caption||im.name)}"><span>${escapeHtml(im.kind)}</span></button><input class="captionInput" data-caption="${escapeHtml(im.id)}" maxlength="180" value="${escapeHtml(im.caption||'')}" placeholder="Підпис до скриншота"><button class="ghost danger" data-remove-image="${escapeHtml(im.id)}">Видалити</button></div>`).join('')||'<div class="shot">Поки немає зразків. Додай власний скриншот Spectrum або Waterfall.</div>'}</div></div>`;
$('#editBtn').onclick=()=>openForm('edit',d);$('#addRelatedBtn').onclick=()=>openForm('related',d);$('#deleteBtn').onclick=()=>deleteSelected(d);$$('[data-related]').forEach(el=>el.onclick=()=>select(el.dataset.related));$('#imagesInput').onchange=async e=>{await addImages(d.id,e.target.files);e.target.value=''};$$('[data-remove-image]').forEach(el=>el.onclick=()=>removeImage(d.id,el.dataset.removeImage));$$('[data-view]').forEach(el=>el.onclick=()=>viewImage(d.id,el.dataset.view));$$('[data-caption]').forEach(el=>el.onchange=()=>updateCaption(d.id,el.dataset.caption,el.value))}
function render(){renderSelected();renderMap();renderDb()}
function jump(v){center=clamp(v,0,MAX);$('#jumpInput').value=String(v);$('#err').textContent='';renderMap()}
function showMap(){$('#mapPage').classList.remove('hide');$('#dbPage').classList.add('hide');$('#mapTab').classList.add('active');$('#dbTab').classList.remove('active')}
function showDb(){$('#dbPage').classList.remove('hide');$('#mapPage').classList.add('hide');$('#dbTab').classList.add('active');$('#mapTab').classList.remove('active');renderDb()}
function openCard(id){selected=id;showDb();render()}
function showOnMap(id){const d=data.find(x=>x.id===id);if(!d)return;selected=id;enabled.add(d.cat);renderFilters();showMap();jump((d.a+d.b)/2);render()}
function renderGlobalSearch(){const term=$('#globalSearch').value.trim(),box=$('#globalResults');if(!term){box.classList.add('hide');box.innerHTML='';return}const all=data.filter(d=>matches(d,term)),result=all.slice(0,8);box.classList.remove('hide');box.innerHTML=`<div class="gmeta">${all.length?'Знайдено: '+all.length:'Нічого не знайдено'}</div>`+result.map(d=>`<div class="growsearch"><button class="gmain" data-open="${escapeHtml(d.id)}"><span class="dot" style="background:${colors[d.cat]}"></span><span class="gtext"><strong>${escapeHtml(d.entity)}</strong><small>${escapeHtml(d.band)} · ${fmt(d.a)}–${fmt(d.b)}</small><em>${escapeHtml([d.purpose,d.tech,...(d.tags||[])].filter(Boolean).slice(0,4).join(' · '))}</em></span></button><button class="gmap" data-map="${escapeHtml(d.id)}" title="Показати на карті">↗</button></div>`).join('');$$('[data-open]').forEach(el=>el.onclick=()=>{box.classList.add('hide');openCard(el.dataset.open)});$$('[data-map]').forEach(el=>el.onclick=()=>{box.classList.add('hide');showOnMap(el.dataset.map)})}
function addBandRow(v={}){const container=$('#bandRows'),row=document.createElement('fieldset');row.className='bandFormRow';row.innerHTML=`<legend>Діапазон <span class="rowNum"></span></legend><div class="fields"><label>Назва діапазону <input name="band" required maxlength="120" value="${escapeHtml(v.band||'')}" placeholder="Наприклад, 2.4 GHz"></label><label>Призначення <input name="purpose" maxlength="160" value="${escapeHtml(v.purpose||'')}" placeholder="Зв’язок / телеметрія / інше"></label><label>Початок, MHz <input name="a" inputmode="decimal" required value="${escapeHtml(v.a??'')}" placeholder="2400 або 2.4G"></label><label>Кінець, MHz <input name="b" inputmode="decimal" required value="${escapeHtml(v.b??'')}" placeholder="2483.5"></label><label>Технологія <input name="tech" maxlength="160" value="${escapeHtml(v.tech||'')}" placeholder="Наприклад, OFDM"></label><label>Теги (через кому) <input name="tags" maxlength="500" value="${escapeHtml((v.tags||[]).join(', '))}" placeholder="Wi-Fi, 2.4 GHz"></label><label class="full">Опис діапазону <textarea name="desc" rows="3" maxlength="5000" placeholder="Характерні ознаки, примітки…">${escapeHtml(v.desc||'')}</textarea></label></div><button type="button" class="removeRow ghost danger">Прибрати цей діапазон</button>`;container.append(row);row.querySelector('.removeRow').onclick=()=>{if($$('.bandFormRow').length===1){notify('Потрібен хоча б один діапазон.',true);return}row.remove();renumberRows()};renumberRows()}
function renumberRows(){$$('.bandFormRow .rowNum').forEach((n,i)=>n.textContent=String(i+1));$$('.removeRow').forEach(button=>button.disabled=$$('.bandFormRow').length===1)}
function openForm(mode,source=null){editingId=mode==='edit'?source.id:null;entityIdForForm=mode==='create'?uid():source.entityId;$('#formTitle').textContent=mode==='edit'?'Редагування діапазону':mode==='related'?'Додати діапазон до об’єкта':'Новий об’єкт / технологія';$('#entityName').value=source?.entity||'';$('#entityCategory').value=source?.cat||'other';$('#bandRows').innerHTML='';addBandRow(mode==='edit'?source:{});$('#formError').textContent='';$('#editModal').classList.remove('hide');$('#editModal').setAttribute('aria-hidden','false');$('#entityName').focus()}
function closeForm(){$('#editModal').classList.add('hide');$('#editModal').setAttribute('aria-hidden','true')}
function readForm(){const entity=$('#entityName').value.trim(),cat=$('#entityCategory').value;if(!entity||entity.length>120)throw Error('Введи назву об’єкта (до 120 символів).');if(!labels[cat])throw Error('Вибери категорію.');const rows=$$('.bandFormRow').map(row=>{const val=name=>row.querySelector(`[name="${name}"]`).value.trim();const a=parseFreq(val('a')),b=parseFreq(val('b'));if(!val('band'))throw Error('Вкажи назву кожного діапазону.');if(a===null||b===null||a<0||a>MAX||b<0||b>MAX||b<a)throw Error('Частоти мають бути в межах 0–7000 MHz, початок не більший за кінець.');return{band:val('band'),a,b,purpose:val('purpose'),tech:val('tech'),desc:val('desc'),tags:val('tags').split(',').map(t=>t.trim()).filter(Boolean).slice(0,30)}});return{entity,cat,rows}}
async function saveForm(e){e.preventDefault();let form;try{form=readForm()}catch(error){$('#formError').textContent=error.message;return}const existing=editingId?data.find(x=>x.id===editingId):null;const next=data.map(d=>d.entityId===entityIdForForm?{...d,entity:form.entity,cat:form.cat}:d);const now=new Date().toISOString();form.rows.forEach((row,i)=>{if(i===0&&existing){const index=next.findIndex(d=>d.id===existing.id);next[index]={...next[index],...row,updatedAt:now}}else next.push({id:uid(),entityId:entityIdForForm,entity:form.entity,cat:form.cat,...row,images:[],createdAt:now,updatedAt:now})});const nextSelection=existing?.id||next[next.length-form.rows.length]?.id||next[next.length-1]?.id;const success=await persist(next,nextSelection);if(success){enabled.add(form.cat);renderFilters();closeForm();showDb();notify(form.rows.length+' діапазон(и) збережено.')}}
async function deleteSelected(d){if(!confirm(`Видалити «${d.entity} — ${d.band}» разом із прикріпленими скриншотами?`))return;const next=data.filter(x=>x.id!==d.id);if(await persist(next,null))notify('Діапазон видалено.')}
function readImage(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)})}
async function addImages(id,fileList){if(imageBusy||!fileList?.length)return;const allowed=new Set(['image/png','image/jpeg','image/webp']),target=data.find(d=>d.id===id);if(!target)return;const files=Array.from(fileList);if(files.some(f=>!allowed.has(f.type)||f.size>10*1024*1024)){notify('Дозволено PNG/JPG/WebP до 10 МБ на файл.',true);return}if((target.images||[]).length+files.length>30){notify('Не більше 30 скриншотів на діапазон.',true);return}imageBusy=true;$('#storageStatus').textContent='Збереження скриншотів…';try{const incoming=[];for(const file of files){const dataUrl=await readImage(file);incoming.push({id:uid(),name:file.name,kind:$('#imageKind').value,caption:'',dataUrl})}const next=data.map(d=>d.id===id?{...d,images:[...(d.images||[]),...incoming]}:d);if(await persist(next,id))notify('Додано скриншотів: '+incoming.length)}catch(e){notify('Не вдалося додати зображення: '+e.message,true)}finally{imageBusy=false;$('#storageStatus').textContent=cloudMode?'Приватна хмарна база · Supabase':'Локальна база · IndexedDB'}}
async function removeImage(bandId,imgId){if(!confirm('Видалити цей скриншот?'))return;await persist(data.map(d=>d.id===bandId?{...d,images:(d.images||[]).filter(im=>im.id!==imgId)}:d),bandId)}
async function updateCaption(bandId,imgId,caption){await persist(data.map(d=>d.id===bandId?{...d,images:(d.images||[]).map(im=>im.id===imgId?{...im,caption:caption.slice(0,180)}:im)}:d),bandId)}
function viewImage(bandId,imgId){const im=data.find(d=>d.id===bandId)?.images?.find(x=>x.id===imgId);if(!im)return;$('#imagePreview').src=im.dataUrl;$('#previewCaption').textContent=im.caption||im.name;$('#previewModal').classList.remove('hide')}
function validateImport(entry){if(!entry||typeof entry!=='object')throw Error('Некоректний запис у файлі.');const a=Number(entry.a),b=Number(entry.b);if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<a||b>MAX)throw Error('Некоректний діапазон частот.');if(!Object.prototype.hasOwnProperty.call(labels,entry.cat))throw Error('Некоректна категорія.');if(typeof entry.entity!=='string'||!entry.entity.trim()||typeof entry.band!=='string'||!entry.band.trim())throw Error('Пропущена назва.');const images=Array.isArray(entry.images)?entry.images:[];if(images.length>30)throw Error('Забагато скриншотів в одному записі.');for(const image of images){if(typeof image.dataUrl!=='string'||!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(image.dataUrl)||image.dataUrl.length>14*1024*1024)throw Error('Некоректне зображення у файлі.')}return{id:String(entry.id||uid()).slice(0,120),entityId:String(entry.entityId||uid()).slice(0,120),entity:entry.entity.slice(0,120),band:entry.band.slice(0,120),cat:entry.cat,a,b,purpose:String(entry.purpose||'').slice(0,160),tech:String(entry.tech||'').slice(0,160),desc:String(entry.desc||'').slice(0,5000),tags:Array.isArray(entry.tags)?entry.tags.map(t=>String(t).slice(0,80)).slice(0,30):[],images:images.map(im=>({id:String(im.id||uid()).slice(0,120),name:String(im.name||'screenshot').slice(0,160),kind:['spectrum','waterfall','other'].includes(im.kind)?im.kind:'other',caption:String(im.caption||'').slice(0,180),dataUrl:im.dataUrl}))}}
async function exportBackup(){
  if(exportBusy)return;
  exportBusy=true;
  try{
    $('#storageStatus').textContent=cloudMode?'Завантаження скриншотів до резервної копії…':'Створення резервної копії…';
    const records=cloudMode?await window.AtlasCloud.exportBackup(data):data;
    const blob=new Blob([JSON.stringify({format:'frequency-atlas-v2',exportedAt:new Date().toISOString(),records},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`frequency-atlas-backup-${new Date().toISOString().slice(0,10)}.json`;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    notify('Резервну копію створено. Збережи JSON у надійному місці.');
  }catch(e){notify('Не вдалося створити резервну копію: '+e.message,true)}
  finally{exportBusy=false;$('#storageStatus').textContent=cloudMode?'Приватна хмарна база · Supabase':'Локальна база · IndexedDB'}
}
async function importBackup(file){if(!file)return;if(file.size>80*1024*1024){notify('Файл імпорту завеликий (максимум 80 МБ).',true);return}try{const parsed=JSON.parse(await file.text());if(parsed.format!=='frequency-atlas-v2'||!Array.isArray(parsed.records)||parsed.records.length>10000)throw Error('Це не резервна копія Frequency Atlas v2.');const records=parsed.records.map(validateImport);if(new Set(records.map(x=>x.id)).size!==records.length)throw Error('У файлі є повторювані ID.');if(!confirm(`Замінити поточну базу (${data.length} записів) даними з файлу (${records.length} записів)? Спочатку експортуй резервну копію, якщо потрібно.`))return;if(await persist(records,records[0]?.id??null)){renderFilters();notify('Базу імпортовано: '+records.length+' записів.')}}catch(e){notify('Помилка імпорту: '+e.message,true)}}
$('#jumpBtn').onclick=()=>{const v=parseFreq($('#jumpInput').value);if(v===null||v<0||v>MAX)$('#err').textContent='Введи 0–7000 MHz, наприклад 433, 2450 або 2.4G';else jump(v)};$('#jumpInput').onkeydown=e=>{if(e.key==='Enter')$('#jumpBtn').click()};$$('[data-jump]').forEach(button=>button.onclick=()=>jump(Number(button.dataset.jump)));$('#zin').onclick=()=>{span=clamp(span*.65,MINSPAN,MAX);renderMap()};$('#zout').onclick=()=>{span=clamp(span*1.5,MINSPAN,MAX);renderMap()};
$('#viewport').addEventListener('wheel',e=>{e.preventDefault();const r=e.currentTarget.getBoundingClientRect(),x=clamp((e.clientX-r.left)/r.width,0,1),[a,,w]=range(),anchor=a+x*w,ns=clamp(span*(e.deltaY>0?1.16:.86),MINSPAN,MAX);span=ns;center=clamp(anchor-(x-.5)*ns,0,MAX);renderMap()},{passive:false});$('#viewport').onpointerdown=e=>{e.currentTarget.setPointerCapture(e.pointerId);drag={x:e.clientX,c:center}};$('#viewport').onpointermove=e=>{if(!drag)return;const w=e.currentTarget.clientWidth||1;center=clamp(drag.c-(e.clientX-drag.x)/w*span,0,MAX);renderMap()};$('#viewport').onpointerup=$('#viewport').onpointercancel=()=>drag=null;
$('#mapTab').onclick=showMap;$('#dbTab').onclick=showDb;$('#search').oninput=renderDb;$('#globalSearch').oninput=renderGlobalSearch;$('#globalSearch').onfocus=renderGlobalSearch;$('#clearGlobal').onclick=()=>{$('#globalSearch').value='';renderGlobalSearch();$('#globalSearch').focus()};document.addEventListener('click',e=>{if(!e.target.closest('.gsearch'))$('#globalResults').classList.add('hide')});
$('#newBtn').onclick=()=>openForm('create');$('#newFromDb').onclick=()=>openForm('create');$('#addBandRow').onclick=()=>addBandRow();$('#recordForm').onsubmit=saveForm;$('#closeForm').onclick=closeForm;$('#cancelForm').onclick=closeForm;$('#editModal').onclick=e=>{if(e.target.id==='editModal')closeForm()};$('#closePreview').onclick=()=>$('#previewModal').classList.add('hide');$('#previewModal').onclick=e=>{if(e.target.id==='previewModal')$('#previewModal').classList.add('hide')};document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeForm();$('#previewModal').classList.add('hide')}});
$('#exportBtn').onclick=exportBackup;$('#importBtn').onclick=()=>$('#importInput').click();$('#importInput').onchange=async e=>{await importBackup(e.target.files[0]);e.target.value=''};

if(cloudMode){
  window.addEventListener('atlas-cloud-ready',load,{once:true});
  window.addEventListener('atlas-cloud-reload',async()=>{if(!$('#editModal').classList.contains('hide'))closeForm();await load()});
  window.addEventListener('atlas-cloud-refocus',async()=>{
    if(saving||!window.AtlasCloud)return;
    try{
      if(await window.AtlasCloud.hasRemoteChanges()){
        if(!$('#editModal').classList.contains('hide')){
          notify('У хмарі є нові зміни. Закрий форму та натисни «Оновити з хмари».',true);
          return;
        }
        await load();notify('Карту синхронізовано з хмарою.');
      }else{
        const updated=await window.AtlasCloud.refreshIfNeeded(data);
        if(updated!==data){data=updated;renderDb()}
      }
    }catch(e){notify('Не вдалося перевірити хмарні зміни: '+e.message,true)}
  });
  setTimeout(()=>{if(!window.AtlasCloud){$('#storageStatus').textContent='Потрібен вхід через /cloud';notify('Відкрий цю версію через /cloud, щоб увійти до приватної бази.',true)}},5000);
}else load();
