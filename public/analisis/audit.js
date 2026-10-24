import {encryptAudit,decryptAudit} from './crypto.js';
const $=id=>document.getElementById(id);
const labels={counted:'Dihitung',duplicate:'Duplikat',late:'Lewat waktu',review:'Perlu pemeriksaan',rejected:'Ditolak panitia'};
let audit=null,result=null,profiles=[],dirty=false,busy=false,page=0,selected=null;
const pageSize=25;
const fmt=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'medium'});
const date=value=>value?fmt.format(new Date(value))+' WIB':'Tidak valid';
const percentage=value=>value.toLocaleString('id-ID',{maximumFractionDigits:2})+'%';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
function notice(message){$('notice').textContent=message;$('notice').hidden=!message;}
function setDirty(value){dirty=value;$('unsaved').hidden=!value;}
function auth(yes){$('login-panel').hidden=yes;$('workspace').hidden=!yes;$('logout').hidden=!yes;}
async function api(action,body={}){
  const response=await fetch('/api/analysis/'+action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  let data;try{data=await response.json();}catch{throw Error('Server belum dapat dijangkau. Draf di halaman tetap tersedia.');}
  if(!response.ok){if(data.error?.code==='UNAUTHORIZED')auth(false);throw Error(data.error?.message||'Permintaan gagal.');}
  return data;
}
async function run(callback){if(busy)return;busy=true;document.body.setAttribute('aria-busy','true');notice('');try{await callback();}catch(e){notice(e.message);}finally{busy=false;document.body.removeAttribute('aria-busy');}}
function accept(data,changed=true){audit=data.document;result=data.result;page=0;setDirty(changed);render();}
function render(){
  const final=audit.type==='final',data=audit.data,source=data.snapshot.data;
  $('audit-content').hidden=false;$('document-status').textContent=final?'FINAL TERKUNCI':'DRAF · VERSI '+data.version;
  $('audit-heading').textContent=final?'Arsip hasil final':'Audit salinan sumber';
  $('source-info').textContent='Diambil '+date(source.readAt)+' · Zona sumber '+source.timeZone+' · Audit '+data.id.slice(0,8)+(data.parent?' · Revisi final '+data.parent.id.slice(0,8):'');
  $('save-audit').disabled=false;$('save-audit').textContent=final?'Simpan Arsip Final':'Simpan Berkas Draf';
  $('finalize').hidden=final;$('finalize').disabled=result.counts.review>0;$('finalize').title=result.counts.review?'Masih ada '+result.counts.review+' respons perlu pemeriksaan':'';$('revise').hidden=!final;
  $('stats').replaceChildren(...[['total','Total respons'],...Object.entries(labels)].map(([status,label])=>{const card=el('div',undefined,'stat');card.dataset.status=status;card.append(el('span',label),el('strong',String(status==='total'?result.total:result.counts[status])));return card;}));
  $('standings').replaceChildren(...result.standings.map(c=>{const p=profiles.find(p=>p.id===c.id),tr=el('tr'),identity=el('td'),wrap=el('div',undefined,'candidate'),img=el('img');img.src=p.photo;img.alt='Poster '+c.name;const name=el('div');name.append(el('span',p.number,'number'),el('strong',c.name));wrap.append(img,name);identity.append(wrap);const percent=el('td',percentage(c.percentage)),bar=el('div',undefined,'bar'),fill=el('span');fill.style.width=c.percentage+'%';bar.append(fill);percent.append(bar);tr.append(identity,el('td',String(c.points),'points'),percent,el('td','#'+c.rank),el('td',c.gap+' poin'));return tr;}));
  const previousBlock=$('block-filter').value,previousCandidate=$('candidate-filter').value;
  $('block-filter').replaceChildren(new Option('Semua blok',''),...Array.from(new Set(result.rows.map(r=>r.normalized?.block).filter(Boolean))).sort((a,b)=>a-b).map(b=>new Option('Blok '+b,String(b))));$('block-filter').value=previousBlock;
  $('candidate-filter').replaceChildren(new Option('Semua calon',''),...profiles.map(c=>new Option(c.number+' · '+c.name,c.id)));$('candidate-filter').value=previousCandidate;
  renderRows();
  $('duplicate-groups').replaceChildren(...result.duplicates.map(g=>{const group=el('div',undefined,'group');group.append(el('strong','Rumah '+g.house),el('div','Dihitung: respons #'+g.counted),el('span','Duplikat: '+g.responses.map(i=>'#'+i).join(', ')));return group;}));
  if(!result.duplicates.length)$('duplicate-groups').append(el('p','Tidak ada kelompok duplikat.','muted'));
  $('history').replaceChildren(...data.history.slice().reverse().map(event=>{const item=el('details',undefined,'event');item.append(el('summary','#'+event.response+' · '+date(event.at)),el('p',event.reason));const describe=d=>d?d.action+(d.address?' → '+d.address:''):'Tanpa keputusan khusus';item.append(el('p','Sebelum: '+describe(event.before)+'\nSesudah: '+describe(event.after)+'\nAlamat sebelum: '+event.addressBefore+'\nAlamat sesudah: '+event.addressAfter),el('p',event.actor,'muted'));return item;}));
  if(!data.history.length)$('history').append(el('p','Belum ada keputusan tambahan. Koreksi terdahulu yang cocok dengan sumber sudah diterapkan.','muted'));
}
function renderRows(){
  const q=$('search').value.trim().toLowerCase(),status=$('status-filter').value,block=$('block-filter').value,candidate=$('candidate-filter').value;
  const rows=result.rows.filter(r=>(!q||[r.id,r.address,r.effectiveAddress,r.normalized?.key].join(' ').toLowerCase().includes(q))&&(!status||r.status===status)&&(!block||String(r.normalized?.block)===block)&&(!candidate||r.candidateId===candidate));
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);
  $('visible-count').textContent=rows.length+' dari '+result.total+' respons';$('page-info').textContent='Halaman '+(page+1)+' / '+pages;$('previous-page').disabled=page===0;$('next-page').disabled=page===pages-1;
  $('response-rows').replaceChildren(...rows.slice(page*pageSize,(page+1)*pageSize).map(r=>{
    const tr=el('tr'),time=el('td',date(r.timestamp)),address=el('td',r.address),choice=el('td',profiles.find(p=>p.id===r.candidateId)?.name||'Tidak dikenali'),state=el('td'),actions=el('td');
    if(!r.timestamp)time.append(el('small','Nilai sumber: '+String(r.rawTimestamp)));
    address.append(el('small',r.normalized?'Blok '+r.normalized.block+' · Rumah '+r.normalized.house:'Belum terpetakan'));if(r.reviewedAddress)address.append(el('small','Koreksi terdahulu: '+r.reviewedAddress));if(r.effectiveAddress!==r.address)address.append(el('small','Alamat efektif: '+r.effectiveAddress));
    if(!r.candidateId)choice.append(el('small',r.choice));state.append(el('span',labels[r.status],'status '+r.status),el('small',r.reason));
    if(audit.type==='draft'){const button=el('button','Tinjau','row-action');button.addEventListener('click',()=>openDecision(r));actions.append(button);}else actions.textContent='Terkunci';
    tr.append(el('td','#'+r.id),time,address,choice,state,actions);return tr;
  }));
  if(!rows.length){const td=el('td','Tidak ada respons sesuai filter.');td.colSpan=6;const tr=el('tr');tr.append(td);$('response-rows').append(tr);}
}
function openDecision(row){if(busy)return;selected=row;$('decision-id').textContent='#'+row.id;$('decision-context').textContent='Alamat asli: '+row.address+' · '+labels[row.status];$('decision-action').value='correct';$('address-field').hidden=false;$('decision-address').value=row.normalized?.key||row.effectiveAddress;$('decision-reason').value='';$('decision-dialog').showModal();}
function askPassword(title){return new Promise(resolve=>{const dialog=$('password-dialog');$('password-title').textContent=title;$('file-password').value='';dialog.showModal();let submitted=false;const submit=event=>{event.preventDefault();submitted=true;const password=$('file-password').value;$('file-password').value='';dialog.close();resolve(password);};const closed=()=>{dialog.removeEventListener('close',closed);$('password-form').removeEventListener('submit',submit);$('file-password').value='';if(!submitted)resolve(null);};$('password-form').addEventListener('submit',submit);dialog.addEventListener('close',closed);});}
async function save(){
  const password=await askPassword('Password panitia untuk menyimpan berkas');if(password===null)return;
  await api('export',{document:audit,password});
  const text=await encryptAudit(audit,password),blob=new Blob([text],{type:'application/octet-stream'}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='JR3-'+audit.type+'-v'+audit.data.version+'-'+audit.data.id.slice(0,8)+'.jr3audit';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setDirty(false);notice('Unduhan berkas audit dimulai. Pastikan berkas berhasil tersimpan sebelum menutup halaman.');
}
$('login-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{const password=$('login-password').value;$('login-password').value='';await api('login',{password});auth(true);});});
$('logout').addEventListener('click',()=>run(async()=>{if(dirty&&!confirm('Perubahan belum diekspor. Keluar dan hapus draf dari halaman?'))return;await api('logout');audit=null;result=null;setDirty(false);$('audit-content').hidden=true;$('response-rows').replaceChildren();$('history').replaceChildren();$('duplicate-groups').replaceChildren();$('save-audit').disabled=true;$('finalize').disabled=true;$('revise').hidden=true;$('document-status').textContent='Belum ada audit';$('audit-heading').textContent='Mulai pemeriksaan';$('source-info').textContent='Ambil salinan sumber atau buka berkas audit.';auth(false);}));
$('new-audit').addEventListener('click',()=>run(async()=>{if(audit&&!confirm('Ambil sumber sebagai audit baru? Audit aktif akan diganti. Simpan berkas terlebih dahulu jika masih dibutuhkan.'))return;accept(await api('snapshot'));}));
$('open-audit').addEventListener('click',()=>{if(!busy)$('file-input').click();});
$('file-input').addEventListener('change',()=>{const file=$('file-input').files[0];$('file-input').value='';if(!file)return;run(async()=>{if(file.size>4200000)throw Error('Berkas terlalu besar.');if(audit&&!confirm('Buka berkas dan ganti audit aktif? Keputusan tidak digabungkan. Simpan perubahan terlebih dahulu.'))return;const password=await askPassword('Password untuk membuka berkas audit');if(password===null)return;const document=await decryptAudit(await file.text(),password);accept(await api('verify',{document}),false);notice('Berkas berhasil dibuka dan tanda tangan server terverifikasi.');});});
$('save-audit').addEventListener('click',()=>run(save));
$('finalize').addEventListener('click',()=>run(async()=>{if(!confirm('Kunci hasil berdasarkan salinan dan keputusan ini? Arsip final tidak dapat diedit. Perubahan berikutnya harus melalui revisi draf.'))return;accept(await api('finalize',{document:audit}));await save();}));
$('revise').addEventListener('click',()=>run(async()=>{if(!confirm('Buat draf versi baru yang merujuk arsip final ini? Arsip final sebelumnya tetap utuh.'))return;accept(await api('revise',{document:audit}));}));
$('decision-action').addEventListener('change',()=>{$('address-field').hidden=$('decision-action').value!=='correct';});
$('decision-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{const change={id:selected.id,action:$('decision-action').value,address:$('decision-address').value,reason:$('decision-reason').value};const data=await api('decision',{document:audit,change});$('decision-dialog').close();accept(data);});});
$('cancel-decision').addEventListener('click',()=>$('decision-dialog').close());$('cancel-password').addEventListener('click',()=>$('password-dialog').close());
for(const id of ['search','status-filter','block-filter','candidate-filter'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=0;if(result)renderRows();});
$('previous-page').addEventListener('click',()=>{page--;renderRows();});$('next-page').addEventListener('click',()=>{page++;renderRows();});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
try{profiles=await fetch('/candidates.json').then(r=>r.json());await api('session');auth(true);}catch(error){auth(false);if(!error.message.includes('Silakan masuk'))notice(error.message);}
