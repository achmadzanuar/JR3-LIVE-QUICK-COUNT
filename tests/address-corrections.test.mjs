import test from 'node:test';
import assert from 'node:assert/strict';
import {readAddressCorrections,applyAddressCorrections} from '../lib/address-corrections.js';

const spreadsheetId='UNIT_TEST_MAIN_SPREADSHEET_12345',gid=123;
const entry={row:2,expectedAddress:'REVIEWED AMBIGUOUS INPUT',correctedAddress:'7/4A'};
const config=entries=>JSON.stringify({spreadsheetId,gid,entries});

test('koreksi hanya berlaku pada spreadsheet, tab, baris dan input yang dikonfirmasi',()=>{
  const corrections=readAddressCorrections(config([entry]),spreadsheetId,gid);
  assert.deepEqual(readAddressCorrections(config([entry]),'OTHER_SOURCE',gid),[]);
  assert.deepEqual(readAddressCorrections(config([entry]),spreadsheetId,999),[]);
  const rows=[['date',entry.expectedAddress],['date',entry.expectedAddress]];
  const result=applyAddressCorrections(rows,1,corrections);
  assert.equal(result[0][1],'7/4A');
  assert.equal(result[1][1],entry.expectedAddress);
  assert.equal(rows[0][1],entry.expectedAddress); // Never mutate the source snapshot.
});

test('koreksi usang berhenti menghitung; perbaikan setara oleh pemilik diterima',()=>{
  const corrections=readAddressCorrections(config([entry]),spreadsheetId,gid);
  assert.throws(()=>applyAddressCorrections([['date','DIFFERENT INPUT']],1,corrections),/CORRECTION_STALE/);
  assert.throws(()=>applyAddressCorrections([],1,corrections),/CORRECTION_STALE/);
  const fixed=[['date','Blok VII No. 04a']];
  assert.equal(applyAddressCorrections(fixed,1,corrections)[0][1],fixed[0][1]);
});

test('konfigurasi rusak, baris ganda, nomor nol dan target ambigu ditolak',()=>{
  for(const text of ['null','{',config([entry,entry]),config([{...entry,row:1}]),
    config([{...entry,expectedAddress:''}]),config([{...entry,correctedAddress:'0/4'}]),
    config([{...entry,correctedAddress:'VII/V'}]),config([{...entry,correctedAddress:'7/4AB'}])]) {
    assert.throws(()=>readAddressCorrections(text,spreadsheetId,gid));
  }
  assert.deepEqual(readAddressCorrections('',spreadsheetId,gid),[]);
});
