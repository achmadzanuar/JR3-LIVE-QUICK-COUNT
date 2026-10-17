import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2] || path.join(root,'../../work/jr3-vercel-qa'));
fs.mkdirSync(out,{recursive:true});
const profiles=JSON.parse(fs.readFileSync(path.join(root,'public/candidates.json'),'utf8'));
const mock=`<script>
const qa={mode:'config',calls:0,active:0,maxActive:0,pending:null};
const QA_PROFILES=${JSON.stringify(profiles)};
const realFetch=window.fetch.bind(window);
function qaResult(){
  const zero=qa.mode==='zero',unanimous=qa.mode==='unanimous';
  const votes=zero?[0,0,0,0,0,0,0]:unanimous?[100,0,0,0,0,0,0]:[3,2,1,1,1,0,0];
  const valid=zero?0:unanimous?100:8,excluded=zero||unanimous?0:2;
  return {ok:true,mode:'dummy',readAt:new Date(Date.now()+qa.calls).toISOString(),label:'SIMULASI · DATA DUMMY',statistics:{totalResponses:valid+excluded,validVotes:valid,duplicates:excluded/2,unmappedResponses:excluded/2,invalidMetadata:0,excludedResponses:excluded,candidateCount:7,registeredVoters:unanimous?null:12,participation:unanimous?null:valid/12*100},candidates:QA_PROFILES.map((c,i)=>({id:c.id,votes:votes[i],percentage:valid?votes[i]/valid*100:0}))};
}
window.fetch=async function(input,init){
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.pathname==='/candidates.json')return Response.json(QA_PROFILES);
  if(url.pathname!=='/api/results')return realFetch(input,init);
  qa.calls++;qa.active++;qa.maxActive=Math.max(qa.maxActive,qa.active);
  const respond=()=>{
    qa.active--;
    if(qa.mode==='failure')throw new Error('TEST FAILURE');
    let result=qaResult();
    if(qa.mode==='config')result={ok:false,mode:'dummy',error:{code:'SOURCE_NOT_CONFIGURED',message:'TEST ONLY: source not ready'}};
    if(qa.mode==='invalid')result.statistics.totalResponses=999;
    if(qa.mode==='old')result.readAt=new Date(Date.now()-60000).toISOString();
    return Response.json(result,{status:result.ok?200:503});
  };
  if(qa.mode==='pending')return new Promise((resolve,reject)=>{
    qa.pending=()=>resolve(respond());
    init?.signal?.addEventListener('abort',()=>{qa.active--;reject(new DOMException('Aborted','AbortError'));},{once:true});
  });
  return respond();
};
</script>`;
const tests=`<script>
const report=[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function assert(condition,message){if(!condition)throw new Error(message);}
async function settle(){const deadline=Date.now()+3000;while(state.inFlight&&Date.now()<deadline)await wait(10);assert(!state.inFlight,'Permintaan belum selesai');}
async function check(name,fn){try{await fn();report.push({name,status:'PASS'});}catch(error){report.push({name,status:'FAIL',message:error.message});}}
async function runUiTests(){
  const ready=Date.now()+5000;while((!state.profilesReady||state.inFlight)&&Date.now()<ready)await wait(10);
  await check('Sumber belum siap: angka tetap —, tanpa suara buatan',()=>{
    assert(state.profilesReady,'profil belum dimuat');
    assert($('stat-valid').textContent==='—'&&$('last-sync').textContent==='—','hasil atau waktu palsu');
    assert([...document.querySelectorAll('.bar-fill')].every(el=>el.hidden),'batang terlihat sebelum pembacaan');
    assert(document.querySelector('.provisional').textContent==='SIMULASI · DATA DUMMY','label dummy');
  });
  await check('Polling tidak menghasilkan permintaan bertumpuk',async()=>{
    qa.mode='pending';const before=qa.calls;for(let i=0;i<8;i++)loadResults();
    assert(qa.calls===before+1&&qa.active===1,'lebih dari satu permintaan');
    qa.mode='success';qa.pending();await settle();assert(qa.maxActive===1,'overlap');
  });
  await check('Grafik hanya menampilkan persen; total suara berada di kartu',()=>{
    assert($('stat-valid').textContent==='8'&&$('stat-responses').textContent==='10'&&$('stat-excluded').textContent==='2','total tidak cocok');
    assert(JSON.stringify([...document.querySelectorAll('.bar-value')].map(el=>el.textContent))===JSON.stringify(['37,5%','25%','12,5%','12,5%','12,5%','0%','0%']),'label bukan persen');
    assert($('chart-total').textContent==='Skala 0–100%','skala grafik');
  });
  await check('Batang vertikal memakai skala tetap 0–100% dan tujuh poster asli',()=>{
    assert([...document.querySelectorAll('.bar-track')].every(el=>el.getBoundingClientRect().height>el.getBoundingClientRect().width),'batang bukan vertikal');
    assert([...document.querySelectorAll('.bar-fill')].every((el,i)=>parseFloat(el.style.height)===state.results.candidates[i].percentage),'tinggi batang salah');
    assert(document.querySelector('.chart-axis').textContent==='100%50%0%','sumbu tidak tetap');
    const axis=document.querySelector('.chart-axis').getBoundingClientRect(),track=document.querySelector('.bar-track').getBoundingClientRect();
    assert(Math.abs(axis.top-track.top)<2&&Math.abs(axis.bottom-track.bottom)<2,'skala dan batas batang tidak sejajar');
    assert(document.querySelectorAll('.bar-portrait img').length===7,'poster calon tidak lengkap');
  });
  await check('Kegagalan koneksi mempertahankan hasil, batang, dan waktu terakhir',async()=>{
    const last=$('last-sync').textContent,first=document.querySelector('.bar-fill').style.height;
    qa.mode='failure';loadResults();await settle();
    assert($('stat-valid').textContent==='8'&&$('last-sync').textContent===last,'data terakhir hilang');
    assert(document.querySelector('.bar-fill').style.height===first,'batang terakhir berubah');
    assert($('connection-status').dataset.state==='error','status error');
  });
  await check('Payload tidak konsisten ditolak',async()=>{
    qa.mode='invalid';loadResults();await settle();assert($('stat-valid').textContent==='8','payload buruk diterima');assert($('notice').textContent.includes('konsistensi'),'pesan validasi');
  });
  await check('Pembaruan yang lebih lama ditolak',async()=>{
    qa.mode='old';loadResults();await settle();assert($('stat-valid').textContent==='8','hasil lama diterima');assert($('notice').textContent.includes('lebih lama'),'pesan waktu lama');
  });
  await check('Pergantian profil tidak mengubah urutan calon pada grafik',()=>{
    const order=[...$('bar-list').children].map(el=>el.dataset.candidate).join(',');
    $('next-button').click();assert($('candidate-name').textContent==='Muhammad Hidayat Nuryadin','profil berikutnya');
    assert([...$('bar-list').children].map(el=>el.dataset.candidate).join(',')===order,'urutan grafik berubah');
    assert($('candidate-missions').children.length===5,'misi hilang');
  });
  await check('Poster pada grafik memilih profil calon dan penanda aktif',()=>{
    document.querySelectorAll('.bar-candidate')[3].click();
    assert($('candidate-name').textContent==='Angga Nur Pramahardika','klik calon gagal');
    assert(document.querySelectorAll('.bar-candidate')[3].getAttribute('aria-current')==='true','penanda aktif salah');
  });
  await check('Polling mempertahankan fokus keyboard pada calon',async()=>{
    const button=document.querySelectorAll('.bar-candidate')[3];button.focus();
    qa.mode='success';loadResults();await settle();
    assert(document.activeElement===button&&button.isConnected,'fokus hilang saat polling');
  });
  await check('Pause dan lanjut slideshow',()=>{
    $('pause-button').click();assert(state.paused&&$('pause-button').getAttribute('aria-pressed')==='true','pause gagal');
    $('pause-button').click();assert(!state.paused,'lanjut gagal');
  });
  await check('Slideshow berpindah setelah 15 detik',async()=>{
    const index=state.profileIndex;state.slideStarted=Date.now()-15001;await wait(350);assert(state.profileIndex===(index+1)%7,'slideshow gagal');
  });
  await check('Data berumur lebih dari 25 detik ditandai stale',()=>{
    state.lastError='';state.results.readAt=new Date(Date.now()-26000).toISOString();tickClock();assert($('connection-status').dataset.state==='stale','status stale');
  });
  await check('Hasil 100% tetap berada pada batas skala yang sama',async()=>{
    qa.mode='unanimous';loadResults();await settle();
    assert(document.querySelector('.bar-value').textContent==='100%'&&document.querySelector('.bar-fill').style.height==='100%','skala 100% salah');
    assert([...document.querySelectorAll('.bar-fill')].slice(1).every(el=>el.style.height==='0%'),'batang nol salah');
  });
  await check('Pembacaan sheet kosong menghasilkan nol yang aman',async()=>{
    qa.mode='zero';loadResults();await settle();
    assert($('stat-valid').textContent==='0','nol suara sah');
    assert([...document.querySelectorAll('.bar-value')].every(el=>el.textContent==='0%'),'persentase nol');
    assert([...document.querySelectorAll('.bar-fill')].every(el=>el.style.height==='0%'&&!el.hidden),'batang nol tidak sah');
  });
  await check('Mode produksi memakai label HASIL SEMENTARA',()=>{
    applyMode('production');assert(document.querySelector('.provisional').textContent==='HASIL SEMENTARA','label produksi');
    assert(document.querySelector('.footer p').textContent.includes('panitia'),'penetapan panitia hilang');applyMode('dummy');
  });
  await check('Timer berhenti saat pagehide dan pulih saat pageshow',async()=>{
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    assert(state.stopped&&!state.refreshTimer&&!state.clockTimer&&!state.slideshowTimer,'timer masih aktif');
    const before=qa.calls;loadResults();assert(qa.calls===before,'permintaan setelah berhenti');
    qa.mode='success';window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    assert(!state.stopped&&state.refreshTimer&&state.clockTimer&&state.slideshowTimer,'timer tidak pulih');await settle();
  });
  await check('Tema terang dan gelap tidak mengubah data atau batang grafik',()=>{
    const values=[...document.querySelectorAll('.bar-value')].map(el=>el.textContent).join('|');
    const fills=[...document.querySelectorAll('.bar-fill')].map(el=>el.style.height).join('|');
    document.querySelector('[data-theme-choice="dark"]').click();
    assert(document.documentElement.dataset.theme==='dark','tema gelap gagal');
    assert(document.querySelector('[data-theme-choice="dark"]').getAttribute('aria-pressed')==='true','status tombol gelap');
    assert(document.querySelector('meta[name="theme-color"]').content==='#090c27','warna browser gelap');
    document.querySelector('[data-theme-choice="light"]').click();
    assert(document.documentElement.dataset.theme==='light','tema terang gagal');
    assert(document.querySelector('[data-theme-choice="light"]').getAttribute('aria-pressed')==='true','status tombol terang');
    assert(document.querySelector('meta[name="theme-color"]').content==='#f3f6fc','warna browser terang');
    assert([...document.querySelectorAll('.bar-value')].map(el=>el.textContent).join('|')===values,'angka berubah');
    assert([...document.querySelectorAll('.bar-fill')].map(el=>el.style.height).join('|')===fills,'batang berubah');
  });
  await check('Pilihan tema disimpan dan hanya satu tombol aktif',()=>{
    document.querySelector('[data-theme-choice="dark"]').click();
    assert(localStorage.getItem('jr3-theme')==='dark','tema gelap tidak tersimpan');
    assert(document.querySelectorAll('[data-theme-choice][aria-pressed="true"]').length===1,'dua tombol aktif');
    document.querySelector('[data-theme-choice="light"]').click();
    assert(localStorage.getItem('jr3-theme')==='light','tema terang tidak tersimpan');
  });
  stopTimers();showProfile(0);
  $('test-report').textContent=JSON.stringify({passed:report.filter(r=>r.status==='PASS').length,failed:report.filter(r=>r.status==='FAIL').length,skipped:0,tests:report},null,2);
  document.title='UI TEST '+(report.some(r=>r.status==='FAIL')?'FAILED':'PASSED')+' — JR3';
}
runUiTests();
</script>`;
let html=fs.readFileSync(path.join(root,'public/index.html'),'utf8')
  .replace('</head>',mock+'</head>')
  .replace('<script src="/app.js" defer></script>',()=>'<script>'+fs.readFileSync(path.join(root,'public/app.js'),'utf8')+'</script>'+tests)
  .replace('<body>','<body><aside style="position:fixed;top:0;left:0;right:0;padding:7px;background:#8b3122;color:white;font:bold 12px Arial;z-index:10;text-align:center">TEST ONLY — ANGKA SINTETIS, BUKAN HASIL PEMILIHAN</aside><details style="position:fixed;bottom:8px;right:8px;z-index:10;background:#111b35;border:1px solid #ffffff30;border-radius:8px;padding:10px;max-width:450px;font-size:11px"><summary>Hasil pengujian browser</summary><pre id="test-report" style="white-space:pre-wrap;max-height:300px;overflow:auto">Menjalankan pengujian…</pre></details>');
fs.writeFileSync(path.join(out,'index.html'),html);
fs.copyFileSync(path.join(root,'public/styles.css'),path.join(out,'styles.css'));
fs.copyFileSync(path.join(root,'public/theme.js'),path.join(out,'theme.js'));
fs.cpSync(path.join(root,'public/assets'),path.join(out,'assets'),{recursive:true});
console.log('Isolated browser tests: '+out);
