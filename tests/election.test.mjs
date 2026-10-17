import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import candidates from '../config/candidates.json' with {type:'json'};
import {normalizeHouseAddress,calculateVoteTotals,normalizeCandidateAnswer} from '../lib/election.js';
const choices=candidates.map(c=>c.answers[0]);
const columns={timestamp:0,address:1,choice:2};
const date=minute=>new Date(Date.UTC(2026,9,17,1,minute));

test('blok angka/Romawi dan nol di depan setara',()=>{
  for(const input of ['Blok XI No. 5','Blok 11 No 5','XI/5','11/05','Blok XI, Nomor 005'])assert.equal(normalizeHouseAddress(input).key,'11/5');
  assert.equal(normalizeHouseAddress('VI/011 a').key,'6/11A');
  assert.notEqual(normalizeHouseAddress('IV/5').key,normalizeHouseAddress('VI/5').key);
  assert.notEqual(normalizeHouseAddress('6/11A').key,normalizeHouseAddress('6/11B').key);
});
test('alamat ambigu dan Romawi tidak baku ditolak',()=>{
  for(const input of ['IIX/5','IIII/5','IC/5','XI5','XI','0/5','XI/0','XI/11AB','XI/5 RT 1','XI/5 dan 11/6','Xll NO 8','XXI NO.V','X & 5 & 6'])assert.equal(normalizeHouseAddress(input),null,input);
});

test('pemisah ampersand, Block, nomer, dan titik sebelum No dikenali dengan batas jelas',()=>{
  for(const input of ['VII & 04','Block VII nomer 4','Blok.VII NOMER 04','blok vii. no. 4','BLOK 7 & NO. 4']) {
    assert.equal(normalizeHouseAddress(input)?.key,'7/4',input);
  }
  assert.equal(normalizeHouseAddress('Blok III nomer 8A').key,'3/8A');
  const result=calculateVoteTotals([[date(0),'Block VII nomer 4',choices[0]],[date(1),'7/04',choices[1]]],columns);
  assert.equal(result.statistics.validVotes,1);
  assert.equal(result.statistics.duplicates,1);
  assert.equal(result.candidates[0].votes,1);
});
test('respons valid pertama per rumah, pilihan tak dikenal tidak menghabiskan hak',()=>{
  const result=calculateVoteTotals([[date(0),'XI/5','UNKNOWN'],[date(20),'11/05',choices[1]],[date(10),'Blok XI No. 5',choices[0]],[date(30),'VI/11a',choices[3]],[date(40),'6/011A',choices[6]],[date(30),'6/11B',choices[6]]],columns);
  assert.deepEqual(result.candidates.map(c=>c.votes),[1,0,0,1,0,0,1]);assert.equal(result.statistics.duplicates,2);assert.equal(result.statistics.unmappedResponses,1);assert.equal(result.statistics.totalResponses,6);
});
test('timestamp sama mengikuti urutan baris; metadata tidak sah dipisahkan',()=>{
  const result=calculateVoteTotals([[date(10),'X/1',choices[1]],[date(10),'10/1',choices[0]],[null,'V/2',choices[2]],[date(10),'IIX/3',choices[3]],['','','']],columns,10);
  assert.equal(result.statistics.validVotes,1);assert.equal(result.candidates[1].votes,1);assert.equal(result.statistics.duplicates,1);assert.equal(result.statistics.invalidMetadata,2);assert.equal(result.statistics.participation,10);
});
test('tujuh pilihan lengkap cocok; nama saja tidak cukup',()=>{
  const result=calculateVoteTotals(choices.map((choice,i)=>[date(i),(20+i)+'/1',choice.toUpperCase().replace(/ /g,'  ')]),columns);
  assert.equal(result.statistics.validVotes,7);assert.ok(result.candidates.every(c=>c.votes===1));
  assert.equal(calculateVoteTotals([[date(0),'XI/1','Muslimin']],columns).statistics.unmappedResponses,1);
  assert.equal(candidates[5].name,'Syaifuddin Nizar');assert.match(choices[5],/^Syaifudin Nizar,/);
});
test('snapshot label Form resmi cocok setelah normalisasi',()=>{
  const expected=[[289,2454087466],[935,3574156899],[445,1411642956],[314,4257003876],[327,569313560],[393,2459842712],[244,1629276963]];
  assert.deepEqual(choices.map(answer=>{const s=normalizeCandidateAnswer(answer);let hash=2166136261;for(let i=0;i<s.length;i++)hash=Math.imul(hash^s.charCodeAt(i),16777619);return [s.length,hash>>>0];}),expected);
});
test('sheet kosong aman, kategori konsisten, payload tidak memuat pemilih',()=>{
  const empty=calculateVoteTotals([],columns);assert.equal(empty.statistics.validVotes,0);assert.ok(empty.candidates.every(c=>c.percentage===0));assert.equal(empty.statistics.participation,null);
  const result=calculateVoteTotals([[date(0),'XI/5',choices[0],'Private Person','08123456789'],[date(1),'11/5',choices[1]],[date(2),'XI/6','RAW_UNKNOWN']],columns);
  const s=result.statistics;assert.equal(s.totalResponses,s.validVotes+s.excludedResponses);assert.equal(s.excludedResponses,s.duplicates+s.unmappedResponses+s.invalidMetadata);assert.doesNotMatch(JSON.stringify(result),/Private Person|08123456789|XI\/5|RAW_UNKNOWN/);
});
test('profil publik berisi tujuh poster lokal dan tanpa pemetaan atau rahasia',()=>{
  const profiles=JSON.parse(fs.readFileSync(new URL('../public/candidates.json',import.meta.url),'utf8'));
  assert.equal(profiles.length,7);assert.deepEqual(profiles.map(c=>c.missions.length),[3,5,3,3,3,3,2]);
  assert.ok(profiles.every(c=>!('answers' in c)&&c.photo.startsWith('/assets/candidates/')));
  assert.equal(profiles[5].missions[0],'Menjaga keindahan & fasilitas umum di lingkungan JRK 3.');
  assert.doesNotMatch(JSON.stringify(profiles),/private_key|client_email|GOOGLE_SERVICE_ACCOUNT/);
});
