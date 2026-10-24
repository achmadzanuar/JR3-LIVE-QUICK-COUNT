import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateAnalysis,serialToInstant,CUTOFF,RULES} from '../lib/analysis/engine.js';
import {passwordHash,checkPassword,signer,canonical} from '../lib/analysis/security.js';
import {createAnalysisHandler} from '../api/analysis.js';
import {createAuditSource} from '../lib/analysis/source.js';
import {encryptAudit,decryptAudit} from '../public/analisis/crypto.js';
import candidates from '../config/candidates.json' with {type:'json'};

const serial=iso=>Date.parse(iso)/86400000+25569;
const row=(id,address,candidate=0,timestamp='2026-10-23T11:00:00.000Z')=>({id,address,choice:candidates[candidate].answers[0],timestamp,rawTimestamp:serial(timestamp),reviewedAddress:null,correctionStale:false});
const snapshot=rows=>({id:'synthetic-test',rules:RULES,cutoff:CUTOFF,timeZone:'Asia/Jakarta',readAt:'2026-10-24T01:00:00Z',source:{spreadsheetId:'SYNTHETIC',gid:123},rows});
test('audit cutoff is inclusive: before / on / after 19:00 WIB',()=>{
  const r=calculateAnalysis(snapshot([row(2,'1/1',0,'2026-10-23T11:59:59.999Z'),row(3,'1/2',0,CUTOFF),row(4,'1/3',0,'2026-10-23T12:00:00.001Z')]));
  assert.equal(r.counts.counted,2);assert.equal(r.counts.late,1);
});
test('Sheets civil serial correctly interpreted in UTC, WIB and non-integer zones',()=>{
  const value=serial('2026-10-23T19:00:00.000Z');
  assert.equal(serialToInstant(value,'Asia/Jakarta'),CUTOFF);
  assert.equal(serialToInstant(value,'Etc/UTC'),'2026-10-23T19:00:00.000Z');
  assert.equal(serialToInstant(value,'Asia/Kathmandu'),'2026-10-23T13:15:00.000Z');
  assert.equal(serialToInstant('10/23/2026 19:00','Asia/Jakarta'),null);
  assert.equal(serialToInstant(-1,'UTC'),null);
  assert.throws(()=>serialToInstant(value,'bad-zone'),/TIMEZONE_INVALID/);
});
test('ambiguous / nonexistent DST wall times require review',()=>{
  assert.equal(serialToInstant(serial('2026-11-01T01:30:00Z'),'America/New_York'),null);
  assert.equal(serialToInstant(serial('2026-03-08T02:30:00Z'),'America/New_York'),null);
  assert.equal(serialToInstant(serial('2026-07-01T12:00:00Z'),'America/New_York'),'2026-07-01T16:00:00.000Z');
});
test('cross-format duplicate, suffix houses, canonical Romans, row-order tie',()=>{
  const r=calculateAnalysis(snapshot([row(3,'11/05',1),row(2,'Blok XI No. 5'),row(4,'IV/11A'),row(5,'VI/11A'),row(6,'4/11B'),row(7,'IIX/1')]));
  assert.equal(r.rows.find(r=>r.id===3).countedResponse,2);assert.equal(r.counts.counted,4);assert.equal(r.counts.review,1);
  assert.deepEqual(r.duplicates,[{house:'11/5',counted:2,responses:[3]}]);
});
test('unknown choice and timestamp never consume house; every row one category',()=>{
  const a=row(2,'1/1');a.choice='unknown';const b=row(3,'1/1');b.timestamp=null;
  const r=calculateAnalysis(snapshot([a,b,row(4,'1/1'),row(5,'1/1',1)]));
  assert.equal(r.counts.counted,1);assert.equal(r.counts.review,2);assert.equal(r.counts.duplicate,1);assert.equal(Object.values(r.counts).reduce((a,b)=>a+b),r.total);
});
test('committee correction and rejection reallocate duplicate eligibility',()=>{
  const source=snapshot([row(2,'unresolved'),row(3,'1/1',1),row(4,'1/1',2)]);
  let r=calculateAnalysis(source,{2:{action:'correct',address:'I/01',reason:'Confirmed'}});
  assert.equal(r.rows[0].status,'counted');assert.equal(r.rows[1].status,'duplicate');
  r=calculateAnalysis(source,{2:{action:'reject',reason:'Not eligible'}});
  assert.equal(r.rows[0].status,'rejected');assert.equal(r.rows[1].status,'counted');assert.equal(r.rows[2].status,'duplicate');
});
test('reviewed server correction retained; stale source correction flagged',()=>{
  const a=row(2,'unclear');a.reviewedAddress='9/9';const b=row(3,'9/10');b.correctionStale=true;
  const r=calculateAnalysis(snapshot([a,b]));assert.equal(r.rows[0].status,'counted');assert.equal(r.rows[1].status,'review');
});
test('points sum to valid votes, percentages and shared rank/gap',()=>{
  const r=calculateAnalysis(snapshot([row(2,'1/1'),row(3,'1/2'),row(4,'1/3',1),row(5,'1/4',1),row(6,'1/5',2)]));
  assert.deepEqual(r.standings.slice(0,3).map(c=>[c.points,c.rank,c.gap]),[[2,1,0],[2,1,0],[1,3,1]]);
  assert.equal(r.standings.reduce((a,c)=>a+c.points,0),r.counts.counted);assert.equal(r.standings.reduce((a,c)=>a+c.percentage,0),100);
  assert.ok(calculateAnalysis(snapshot([])).standings.every(c=>c.percentage===0));
});
const password='synthetic test password 2026',key='ab'.repeat(32),hash=await passwordHash(password);
const env={ANALYSIS_PASSWORD_HASH:hash,ANALYSIS_SIGNING_KEY:key,NODE_ENV:'production',ANALYSIS_ORIGIN:'https://audit.example'};
async function setup(rows=[row(2,'1/1'),row(3,'1/1',1),row(4,'unclear')]){
  let time=Date.parse('2026-10-24T01:00:00Z'),cookie='',reads=0;
  const handler=createAnalysisHandler({env,now:()=>time,source:async()=>{reads++;return snapshot(rows);}});
  async function call(action,body={},options={}){
    const response=await handler(new Request('https://audit.example/api/analysis/'+action,{method:options.method||'POST',headers:{Origin:'https://audit.example',Cookie:cookie,'Content-Type':'application/json',...options.headers},...(options.method==='GET'?{}:{body:JSON.stringify(body)})}));
    const data=await response.json();return {response,data};
  }
  const login=await call('login',{password});cookie=login.response.headers.get('set-cookie').split(';')[0];
  return {call,handler,login,advance:ms=>{time+=ms;},get reads(){return reads;}};
}
test('password hash and typed canonical signatures reject modifications',async()=>{
  assert.equal(await checkPassword(password,hash),true);assert.equal(await checkPassword('wrong',hash),false);
  const s=signer(key),doc=s.sign('draft',{b:1,a:2});assert.equal(canonical({a:2,b:1}),canonical({b:1,a:2}));assert.equal(s.verify(doc,'draft').a,2);
  assert.throws(()=>s.verify(doc,'source'));doc.data.b=3;assert.throws(()=>s.verify(doc,'draft'));
});
test('session cookies secure, origin checks, no-store, expiry and no anonymous source read',async()=>{
  const s=await setup();const cookie=s.login.response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Max-Age=28800/);
  let r=await s.call('snapshot',{}, {headers:{Cookie:''}});assert.equal(r.response.status,401);assert.equal(s.reads,0);assert.equal(r.response.headers.get('cache-control'),'no-store');
  r=await s.call('snapshot',{}, {headers:{Origin:'https://evil.example'}});assert.equal(r.response.status,403);assert.equal(s.reads,0);
  s.advance(8*3600000);r=await s.call('snapshot');assert.equal(r.response.status,401);
});
test('login failures throttled per process; logout removes cookie; missing secrets fail closed',async()=>{
  const s=await setup();for(let i=0;i<5;i++)assert.equal((await s.call('login',{password:'bad'})).response.status,401);
  assert.equal((await s.call('login',{password})).response.status,429);s.advance(900001);assert.equal((await s.call('login',{password})).response.status,200);
  assert.match((await s.call('logout')).response.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await createAnalysisHandler({env:{}})(new Request('https://audit.example/api/analysis/session',{method:'POST'}))).status,503);
});
test('snapshots cannot add rows or change choice/time/address; even decisions are signed',async()=>{
  const s=await setup();const {data}=await s.call('snapshot');assert.equal(s.reads,1);
  for(const mutate of [d=>d.data.snapshot.data.rows.push(row(99,'2/2')),d=>d.data.snapshot.data.rows[0].choice='changed',d=>d.data.snapshot.data.rows[0].timestamp=CUTOFF,d=>d.data.decisions[2]={action:'reject',reason:'injected'}]){
    const changed=structuredClone(data.document);mutate(changed);assert.equal((await s.call('verify',{document:changed})).response.status,400);
  }
  assert.equal((await s.call('preview',{document:data.document})).data.result.total,3);assert.equal(s.reads,1);
});
test('parallel login attempts cannot bypass the per-process rate limit',async()=>{
  const s=await setup();
  const statuses=await Promise.all(Array.from({length:12},async()=> (await s.call('login',{password:'incorrect'})).response.status));
  assert.equal(statuses.filter(s=>s===401).length,5);assert.equal(statuses.filter(s=>s===429).length,7);
});
test('review decisions record server time before/after, require reason, protect immutable fields',async()=>{
  const s=await setup();let {data}=await s.call('snapshot');
  assert.equal((await s.call('finalize',{document:data.document})).data.error.code,'UNRESOLVED');
  assert.equal((await s.call('decision',{document:data.document,change:{id:4,action:'correct',address:'2/2',reason:''}})).response.status,400);
  assert.equal((await s.call('decision',{document:data.document,change:{id:4,action:'correct',address:'IIX/2',reason:'confirmed'}})).response.status,400);
  data=(await s.call('decision',{document:data.document,change:{id:4,action:'correct',address:'2/2',reason:'Confirmed address',choice:'changed',timestamp:CUTOFF}})).data;
  assert.equal(data.result.counts.review,0);const history=data.document.data.history[0];assert.equal(history.before,null);assert.equal(history.addressBefore,'unclear');assert.equal(history.addressAfter,'2/2');assert.equal(history.at,'2026-10-24T01:00:00.000Z');assert.equal(data.document.data.snapshot.data.rows[2].choice,candidates[0].answers[0]);
  data=(await s.call('decision',{document:data.document,change:{id:2,action:'reject',reason:'Confirmed not eligible'}})).data;
  assert.equal(data.result.rows[1].status,'counted');assert.equal(data.result.counts.rejected,1);
});
test('final archive immutable, revision advances version and points to prior signed final',async()=>{
  const s=await setup([row(2,'1/1')]);let {data}=await s.call('snapshot');
  const final=(await s.call('finalize',{document:data.document})).data;assert.equal(final.document.type,'final');
  assert.equal((await s.call('decision',{document:final.document,change:{id:2,action:'reject',reason:'Change final'}})).data.error.code,'FINAL_LOCKED');
  const revision=(await s.call('revise',{document:final.document})).data;
  assert.equal(revision.document.type,'draft');assert.equal(revision.document.data.version,2);assert.equal(revision.document.data.parent.signature,final.document.signature);assert.notEqual(revision.document.data.id,final.document.data.id);
  assert.deepEqual((await s.call('verify',{document:final.document})).data.result,final.result);
});
test('encrypted draft export/import, wrong password and ciphertext modification',async()=>{
  const s=await setup();const {data}=await s.call('snapshot');const doc=data.document;
  assert.equal((await s.call('export',{document:doc,password:'wrong'})).response.status,401);
  assert.equal((await s.call('export',{document:doc,password})).response.status,200);
  const encrypted=await encryptAudit(doc,password);assert.ok(!encrypted.includes(password));assert.ok(!encrypted.includes('unclear'));assert.ok(!encrypted.includes(candidates[0].answers[0]));
  const decoded=await decryptAudit(encrypted,password);assert.deepEqual(decoded,doc);assert.equal((await s.call('verify',{document:decoded})).response.status,200);
  await assert.rejects(decryptAudit(encrypted,'wrong'));
  const file=JSON.parse(encrypted);file.ciphertext='A'+file.ciphertext.slice(1);await assert.rejects(decryptAudit(JSON.stringify(file),password));
});
test('private source reads timezone and only the 3 needed columns; retains original addresses',async()=>{
  const requests=[];const source=createAuditSource({env:{GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',client_email:'test@test-project.iam.gserviceaccount.com',private_key:'-----BEGIN PRIVATE KEY-----TEST'})},tokenProvider:async()=> 'TEST_TOKEN',fetchImpl:async(url)=>{
    requests.push(url);
    if(url.includes('values:batchGet'))return Response.json({valueRanges:[{values:[[serial('2026-10-23T19:00:00Z')]]},{values:[['XI/5']]},{values:[[candidates[0].answers[0]]]}]});
    if(url.includes('/values/'))return Response.json({values:[['Timestamp','Nama Lengkap Pemilih','Blok & Nomor Rumah','Daftar Calon Ketua Paguyuban Periode 2026-2027','Kontak']]});
    return Response.json({properties:{timeZone:'Asia/Jakarta'},sheets:[{properties:{sheetId:861129643,title:'Responses',gridProperties:{rowCount:200,columnCount:5}}}]});
  }});
  const value=await source();assert.equal(value.timeZone,'Asia/Jakarta');assert.equal(value.rows[0].timestamp,CUTOFF);assert.equal(value.rows[0].address,'XI/5');
  assert.deepEqual(new URL(requests[2]).searchParams.getAll('ranges'),["'Responses'!A2:A","'Responses'!C2:C","'Responses'!D2:D"]);
  assert.doesNotMatch(JSON.stringify(value),/Nama Lengkap|Kontak|TEST_TOKEN/);
});
