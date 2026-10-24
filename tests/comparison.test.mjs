import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateAnalysis} from '../lib/analysis/engine.js';
import {buildDuplicateComparison,comparisonTime} from '../public/analisis/comparison.js';
import candidates from '../config/candidates.json' with {type:'json'};
const row=(id,address,name='Peserta Uji A',candidate=0,timestamp='2026-10-23T10:00:00.000Z')=>({id,address,name,choice:candidates[candidate].answers[0],timestamp});
const snapshot={rows:[row(2,'XI/5'),row(3,'11/05','Peserta Uji B',1,'2026-10-23T11:00:00Z'),row(4,'11/5','Peserta Uji B',1,'2026-10-23T12:00:01Z'),row(5,'IV/11A'),row(40,'Blok 11 No. 5','Peserta Uji C')]};
test('comparison includes counted, all duplicates and other same-house statuses from the full result',()=>{
  const result=calculateAnalysis(snapshot),comparison=buildDuplicateComparison(result,3);
  assert.equal(comparison.winner.id,2);assert.deepEqual(comparison.rows.map(r=>r.row.id),[2,40,3,4]);
  assert.deepEqual(comparison.rows.map(r=>r.points),[1,0,0,0]);assert.equal(comparison.rows.find(r=>r.row.id===4).row.status,'late');
  assert.equal(comparison.rows.find(r=>r.row.id===3).selected,true);assert.match(comparison.explanation,/Blok 11, Rumah 5/);assert.match(comparison.explanation,/#2 valid dan masuk lebih awal/);
  assert.equal(comparison.rows.find(r=>r.row.id===3).nameMatch,'different');assert.equal(comparison.rows.find(r=>r.row.id===3).choiceMatch,'different');
  assert.equal(buildDuplicateComparison(result,5),null);assert.equal(result.rows.find(r=>r.id===5).status,'counted');
});
test('exact timestamp tie uses source row, whereas millisecond differences use time',()=>{
  const same=calculateAnalysis({rows:[row(40,'11/5'),row(2,'XI/5')]});
  assert.match(buildDuplicateComparison(same,40).explanation,/sama persis; urutan baris #2 lebih awal daripada #40/);
  const subsecond=calculateAnalysis({rows:[row(2,'11/5','A',0,'2026-10-23T10:00:00.123Z'),row(3,'XI/5','B',0,'2026-10-23T10:00:00.124Z')]});
  assert.match(buildDuplicateComparison(subsecond,3).explanation,/masuk lebih awal/);assert.match(comparisonTime(subsecond.rows[0].timestamp),/123 WIB/);assert.match(comparisonTime(subsecond.rows[1].timestamp),/124 WIB/);assert.equal(comparisonTime(null),'Tidak valid');
});
test('rejection and correction change the current reference and group without altering the snapshot',()=>{
  const rejected=calculateAnalysis(snapshot,{2:{action:'reject',reason:'Diuji panitia'}}),comparison=buildDuplicateComparison(rejected,3);
  assert.equal(comparison.winner.id,40);assert.equal(comparison.rows.find(r=>r.row.id===2).points,0);assert.equal(comparison.rows.find(r=>r.row.id===2).row.status,'rejected');
  const extended={rows:[...snapshot.rows,row(41,'12/9','Peserta Uji D',0,'2026-10-23T11:00:00Z')]};
  const corrected=calculateAnalysis(extended,{2:{action:'correct',address:'12/9',reason:'Alamat dikonfirmasi'}}),changed=buildDuplicateComparison(corrected,41);
  assert.equal(changed.winner.id,2);assert.equal(changed.winner.address,'XI/5');assert.equal(changed.winner.effectiveAddress,'12/9');assert.equal(snapshot.rows[0].address,'XI/5');assert.equal(buildDuplicateComparison(corrected,3).winner.id,40);
});
test('legacy or blank names are unknown; name comparison is informational and whitespace/case tolerant',()=>{
  const legacy={rows:[row(2,'1/1',''),row(3,'1/1',undefined,1)]};delete legacy.rows[1].name;
  const comparison=buildDuplicateComparison(calculateAnalysis(legacy),3);assert.equal(comparison.rows[1].nameMatch,'unknown');assert.equal(comparison.rows[1].choiceMatch,'different');
  const same=buildDuplicateComparison(calculateAnalysis({rows:[row(2,'1/1','  Peserta   Uji A'),row(3,'I/01','peserta uji a')]}),3);
  assert.equal(same.rows[1].nameMatch,'same');assert.equal(same.rows[1].choiceMatch,'same');assert.equal(same.rows[1].points,0);
});
