import candidates from '../../config/candidates.json' with {type:'json'};
import {normalizeCandidateAnswer, normalizeHouseAddress} from '../election.js';

export const CUTOFF = '2026-10-23T12:00:00.000Z';
export const RULES = 'jr3-audit-1';
export const STATUSES = ['counted','duplicate','late','review','rejected'];
const answers = new Map(candidates.flatMap(c => c.answers.map(a => [normalizeCandidateAnswer(a),c.id])));

// A Sheets serial is a wall-clock time in the spreadsheet's IANA zone.
// Test possible offsets and reject ambiguous/nonexistent civil times at DST boundaries.
export function serialToInstant(value, timeZone) {
  if(typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 2958465) return null;
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}); }
  catch { throw new Error('TIMEZONE_INVALID'); }
  const wall = Math.round((value-25569)*86400000);
  const second = Math.floor(wall/1000)*1000;
  const offset = epoch => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(epoch)).map(p=>[p.type,p.value]));
    return Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second)-Math.floor(epoch/1000)*1000;
  };
  const offsets = new Set([-2,-1,0,1,2].map(d=>offset(second+d*86400000)));
  const matches = [...offsets].map(o=>wall-o).filter(t=>t+offset(t)===wall);
  return matches.length===1 ? new Date(matches[0]).toISOString() : null;
}

export function calculateAnalysis(snapshot, decisions = {}) {
  const rows = snapshot.rows.map(source => {
    const decision = decisions[source.id];
    const effectiveAddress = decision?.action==='correct' ? decision.address : (source.reviewedAddress || source.address);
    const normalized = normalizeHouseAddress(effectiveAddress);
    const candidateId = answers.get(normalizeCandidateAnswer(source.choice)) || null;
    const time = typeof source.timestamp==='string' ? Date.parse(source.timestamp) : NaN;
    const row = {...source,effectiveAddress,normalized,candidateId,status:'review',reason:'',countedResponse:null};
    if(decision?.action==='reject') { row.status='rejected'; row.reason=decision.reason; }
    else if(Number.isFinite(time) && time>Date.parse(CUTOFF)) { row.status='late'; row.reason='Respons masuk setelah penutupan.'; }
    else {
      const issues=[];
      if(!candidateId) issues.push('Pilihan calon tidak dikenali');
      if(!normalized) issues.push('Alamat belum dapat dipastikan');
      if(!Number.isFinite(time)) issues.push('Timestamp tidak valid / waktu lokal ambigu');
      if(source.correctionStale && !decision) issues.push('Koreksi terdahulu perlu diperiksa kembali');
      row.reason=issues.join('; ');
      if(!issues.length) row.status='eligible';
    }
    return row;
  });
  const houses = new Map();
  rows.filter(r=>r.status==='eligible').sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||a.id-b.id).forEach(row=>{
    const prior=houses.get(row.normalized.key);
    if(prior){row.status='duplicate';row.countedResponse=prior.id;row.reason='Rumah yang sama sudah dihitung pada respons #'+prior.id+'.';}
    else {row.status='counted';row.reason='Respons valid paling awal untuk rumah ini.';houses.set(row.normalized.key,row);}
  });
  const counts=Object.fromEntries(STATUSES.map(s=>[s,rows.filter(r=>r.status===s).length]));
  const points=candidates.map(c=>rows.filter(r=>r.status==='counted'&&r.candidateId===c.id).length);
  const leader=Math.max(...points);
  const standings=candidates.map((c,i)=>({id:c.id,name:c.name,points:points[i],percentage:counts.counted ? points[i]/counts.counted*100 : 0,rank:1+points.filter(p=>p>points[i]).length,gap:leader-points[i]}));
  const duplicates=[...houses].flatMap(([house,winner])=>{
    const others=rows.filter(r=>r.status==='duplicate'&&r.countedResponse===winner.id);
    return others.length ? [{house,counted:winner.id,responses:others.map(r=>r.id)}] : [];
  });
  return {counts,total:rows.length,standings,rows,duplicates};
}
