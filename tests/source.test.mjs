import test from 'node:test';
import assert from 'node:assert/strict';
import candidates from '../config/candidates.json' with {type:'json'};
import {createResultsService,resolveColumns,readConfiguration,sheetTimestamp,SourceError,publicSourceError} from '../lib/source.js';
import {createResultsHandler} from '../api/results.js';
const credential={type:'service_account',client_email:'unit-test@jr3-unit-test.iam.gserviceaccount.com',private_key:'-----BEGIN PRIVATE KEY-----\nNOT_A_REAL_KEY\n-----END PRIVATE KEY-----\n'};
const headers=['Timestamp','Nama Lengkap Pemilih','Blok & Nomor Rumah','Daftar Calon Ketua Paguyuban Periode 2026-2027','Nomor WhatsApp Aktif KK'];
const fixture=()=>[headers,[46312.4,'Private Person','Blok XI No. 5',candidates[0].answers[0],'08123456789'],[46312.5,'Private Person','11/05',candidates[1].answers[0],'08123456789']];
function setup(options={}){
  const env={GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify(credential),ELECTION_MODE:'dummy',...options.env};
  let now=Date.parse('2026-10-17T03:00:00Z'),calls=0,tokens=0;
  const requests=[];
  const service=createResultsService({env,now:()=>now,tokenProvider:async()=>{tokens++;return 'UNIT_TEST_TOKEN';},fetchImpl:async(url,init)=>{
    calls++;requests.push({url,init});
    if(options.status)return Response.json({error:{message:'Private Person 08123456789'}},{status:options.status});
    if(url.includes('/values/'))return Response.json({values:options.values || fixture()});
    return Response.json({sheets:[{properties:{sheetId:123,title:'Wrong tab',gridProperties:{rowCount:100,columnCount:5}}},{properties:{sheetId:861129643,title:"Form's responses",gridProperties:{rowCount:1000,columnCount:5}}}]});
  }});
  return {env,service,requests,advance:ms=>{now+=ms;},get calls(){return calls;},get tokens(){return tokens;},now:()=>now};
}
test('header diperiksa dari teks aktual tanpa bergantung posisi',()=>{
  assert.deepEqual(resolveColumns(headers),{choice:3,address:2,timestamp:0});
  assert.deepEqual(resolveColumns([...headers].reverse()),{choice:1,address:2,timestamp:4});
});
test('header hilang, duplikat, dan ambigu ditolak',()=>{
  for(const h of [['Timestamp','Alamat','Pilihan'],[...headers,'Timestamp'],[...headers,'Cap waktu']])assert.throws(()=>resolveColumns(h),/HEADER_INVALID/);
  assert.deepEqual(resolveColumns(['Waktu','Alamat','Pilihan'],{timestamp:'Waktu',address:'Alamat',choice:'Pilihan'}),{choice:2,address:1,timestamp:0});
});
test('timestamp serial Sheets valid; teks lokal tidak ditebak',()=>{
  assert.equal(sheetTimestamp(46312.5).getUTCHours(),12);
  assert.equal(sheetTimestamp('17/10/2026 12:00'),null);assert.equal(sheetTimestamp(null),null);assert.equal(sheetTimestamp(-1),null);
  assert.ok(sheetTimestamp(46312.4).getTime()<sheetTimestamp(46312.5).getTime());
});
test('sumber belum terhubung dan konfigurasi salah ditolak',()=>{
  assert.throws(()=>readConfiguration({}),/SOURCE_NOT_CONFIGURED/);
  assert.throws(()=>readConfiguration({GOOGLE_SERVICE_ACCOUNT_JSON:'not json'}),/GOOGLE_AUTH_INVALID/);
  assert.throws(()=>readConfiguration({GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify(credential),REGISTERED_VOTERS:'0'}),/CONFIG_INVALID/);
  assert.throws(()=>readConfiguration({GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify(credential),ELECTION_MODE:'made-up'}),/CONFIG_INVALID/);
  assert.throws(()=>readConfiguration({GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify(credential),ELECTION_MODE:'production'}),/CONFIG_INVALID/);
});
test('membaca tab berdasarkan GID, date serial, dan mengembalikan agregat saja',async()=>{
  const s=setup();const result=await s.service();assert.equal(result.ok,true);assert.equal(result.mode,'dummy');assert.equal(result.statistics.validVotes,1);assert.equal(result.statistics.duplicates,1);assert.equal(s.calls,2);
  const valuesUrl=new URL(s.requests[1].url);assert.match(decodeURIComponent(valuesUrl.pathname),/Form''s responses/);assert.equal(valuesUrl.searchParams.get('dateTimeRenderOption'),'SERIAL_NUMBER');assert.equal(valuesUrl.searchParams.get('valueRenderOption'),'UNFORMATTED_VALUE');
  assert.equal(s.requests[0].init.headers.Authorization,'Bearer UNIT_TEST_TOKEN');assert.doesNotMatch(JSON.stringify(result),/Private Person|08123456789|UNIT_TEST_TOKEN|private_key|Blok XI/);
});
test('cache dibatasi lima detik dengan waktu baca asli',async()=>{
  const s=setup();const a=await s.service();s.advance(4999);const b=await s.service();assert.equal(a.readAt,b.readAt);assert.equal(s.calls,2);
  s.advance(1);const c=await s.service();assert.notEqual(a.readAt,c.readAt);assert.equal(s.calls,4);
});
test('permintaan sumber bersamaan digabung',async()=>{
  const s=setup();const results=await Promise.all(Array.from({length:20},()=>s.service()));assert.equal(s.calls,2);assert.equal(s.tokens,1);assert.ok(results.every(r=>r.readAt===results[0].readAt));
});
test('perubahan konfigurasi tidak memakai cache dummy sebelumnya',async()=>{
  const s=setup();await s.service();s.env.ELECTION_MODE='production';s.env.GOOGLE_SPREADSHEET_ID='UNIT_TEST_MAIN_SPREADSHEET_12345';s.env.GOOGLE_SHEET_GID='861129643';const result=await s.service();assert.equal(result.mode,'production');assert.equal(result.label,'HASIL SEMENTARA');assert.equal(s.calls,4);
});
test('sumber tanpa izin dan rate limit disanitasi',async()=>{
  for(const [status,expected] of [[403,'SHEET_ACCESS_DENIED'],[404,'SHEET_NOT_FOUND'],[429,'SOURCE_BUSY']]){const s=setup({status});await assert.rejects(s.service(),error=>publicSourceError(error).code===expected);}
  assert.doesNotMatch(JSON.stringify(publicSourceError(new Error('Private Person 08123456789 PRIVATE_KEY'))),/Private Person|08123456789|PRIVATE_KEY/);
});
test('header berubah tidak berubah menjadi hasil nol',async()=>{
  const s=setup({values:[['Wrong','Headers']]});await assert.rejects(s.service(),/HEADER_INVALID/);
});
test('API tanpa kredensial: status 503, mode dummy, tanpa hasil palsu',async()=>{
  const handle=createResultsHandler(createResultsService({env:{}}),{});const response=await handle(new Request('https://example.test/api/results'));const body=await response.json();
  assert.equal(response.status,503);assert.equal(body.mode,'dummy');assert.equal(body.error.code,'SOURCE_NOT_CONFIGURED');assert.equal(body.statistics,undefined);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('API hanya GET dan anggaran cache CDN tidak menambah umur data',async()=>{
  const s=setup();const handle=createResultsHandler(s.service,s.env,s.now);const post=await handle(new Request('https://example.test/api/results',{method:'POST'}));assert.equal(post.status,405);assert.equal(s.calls,0);
  await s.service();s.advance(1500);const response=await handle(new Request('https://example.test/api/results'));assert.match(response.headers.get('cache-control'),/s-maxage=3/);assert.doesNotMatch(response.headers.get('cache-control'),/stale-while-revalidate/);
});
