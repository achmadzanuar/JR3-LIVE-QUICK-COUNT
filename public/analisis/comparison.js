// Presentation only. Eligibility and deduplication remain server decisions.
const normalizeName=value=>String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const time=value=>Number.isFinite(Date.parse(value))?Date.parse(value):Infinity;
const formatter=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,hourCycle:'h23'});
export function comparisonTime(value){return value&&Number.isFinite(Date.parse(value))?formatter.format(new Date(value))+' WIB':'Tidak valid';}
export function buildDuplicateComparison(result,responseId){
  const group=result?.duplicates.find(g=>g.counted===responseId||g.responses.includes(responseId));
  if(!group)return null;
  const winner=result.rows.find(r=>r.id===group.counted),selected=result.rows.find(r=>r.id===responseId);
  if(!winner||!selected)return null;
  const house=winner.normalized;
  const reason=row=>{
    if(row.status==='counted')return 'Respons #'+row.id+' adalah respons valid paling awal untuk rumah ini dan mendapat 1 poin.';
    if(row.status!=='duplicate')return row.reason;
    const sameTime=Date.parse(row.timestamp)===Date.parse(winner.timestamp);
    return 'Respons ini duplikat karena rumahnya sama dengan respons #'+winner.id+' (Blok '+house.block+', Rumah '+house.house+'). '+
      (sameTime?'Waktu keduanya sama persis; urutan baris #'+winner.id+' lebih awal daripada #'+row.id+'.':'Respons #'+winner.id+' valid dan masuk lebih awal.')+' Respons ini mendapat 0 poin.';
  };
  const rows=result.rows.filter(r=>r.normalized?.key===group.house).sort((a,b)=>{
    if(a.id===winner.id)return -1;if(b.id===winner.id)return 1;
    return time(a.timestamp)-time(b.timestamp)||a.id-b.id;
  }).map(row=>({row,points:row.status==='counted'?1:0,selected:row.id===responseId,reason:reason(row),
    nameMatch:!normalizeName(row.name)||!normalizeName(winner.name)?'unknown':normalizeName(row.name)===normalizeName(winner.name)?'same':'different',
    choiceMatch:!row.candidateId||!winner.candidateId?'unknown':row.candidateId===winner.candidateId?'same':'different'}));
  return {house,winner,rows,explanation:reason(selected)};
}
