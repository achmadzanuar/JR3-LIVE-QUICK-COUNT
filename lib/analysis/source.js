import {readConfiguration,resolveColumns,SourceError} from '../source.js';
import {createGoogleAuthClient} from '../google-auth.js';
import {serialToInstant,CUTOFF,RULES} from './engine.js';
import {randomUUID} from 'node:crypto';
import {normalizeHouseAddress,normalizeCandidateAnswer} from '../election.js';
function column(n){let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
export function resolveRespondentNameColumn(headers){
  const matches=headers.flatMap((header,index)=>normalizeCandidateAnswer(header)==='nama lengkap pemilih'?[index]:[]);
  if(matches.length!==1)throw new SourceError('HEADER_INVALID');
  return matches[0];
}
export function createAuditSource({env=process.env,fetchImpl=fetch,tokenProvider,now=Date.now}={}) {
  return async()=>{
    const config=readConfiguration(env);
    let token;
    try {const result=tokenProvider?await tokenProvider(config):await createGoogleAuthClient(config).getAccessToken();token=typeof result==='string'?result:result?.token;if(!token)throw Error();}
    catch {throw new SourceError('GOOGLE_AUTH_INVALID');}
    async function get(url){
      let response;try {response=await fetchImpl(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});}catch{throw new SourceError('SOURCE_UNAVAILABLE');}
      if(!response.ok)throw new SourceError(response.status===403?'SHEET_ACCESS_DENIED':'SOURCE_UNAVAILABLE');
      return response.json();
    }
    const base='https://sheets.googleapis.com/v4/spreadsheets/'+config.spreadsheetId;
    const metadata=await get(base+'?fields='+encodeURIComponent('properties(timeZone),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'));
    const zone=metadata.properties?.timeZone;
    if(!zone)throw new SourceError('SOURCE_UNAVAILABLE');
    try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();}catch{throw new SourceError('SOURCE_UNAVAILABLE');}
    const sheet=metadata.sheets?.find(s=>s.properties?.sheetId===config.gid)?.properties;
    if(!sheet)throw new SourceError('SHEET_NOT_FOUND');
    const title="'"+sheet.title.replace(/'/g,"''")+"'!";
    const header=await get(base+'/values/'+encodeURIComponent(title+'1:1'));
    const columns=resolveColumns(header.values?.[0]||[],config.headers);
    columns.name=resolveRespondentNameColumn(header.values?.[0]||[]);
    // Names are available only in this authenticated audit; contacts are not requested.
    const query=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'});
    const keys=['timestamp','address','choice','name'];
    for(const k of keys) query.append('ranges',title+column(columns[k])+'2:'+column(columns[k]));
    const data=await get(base+'/values:batchGet?'+query);
    const arrays=data.valueRanges?.map(r=>r.values||[])||[];
    if(arrays.length!==4)throw new SourceError('SOURCE_UNAVAILABLE');
    const count=Math.max(...arrays.map(a=>a.length));
    if(count>5000)throw new SourceError('SOURCE_BUSY');
    const rows=[];
    for(let i=0;i<count;i++){
      const [rawTimestamp,rawAddress,rawChoice,rawName]=arrays.map(a=>a[i]?.[0]??'');
      if([rawTimestamp,rawAddress,rawChoice].every(v=>v===''))continue;
      const address=String(rawAddress), choice=String(rawChoice);
      const correction=config.addressCorrections.find(c=>c.row===i+2);
      const matches=correction&&(address===correction.expectedAddress||normalizeHouseAddress(address)?.key===correction.correctedAddress);
      rows.push({id:i+2,name:String(rawName),rawTimestamp,timestamp:serialToInstant(rawTimestamp,zone),address,choice,
        reviewedAddress:matches?correction.correctedAddress:null,correctionStale:!!correction&&!matches});
    }
    return {id:randomUUID(),rules:RULES,cutoff:CUTOFF,readAt:new Date(now()).toISOString(),timeZone:zone,source:{spreadsheetId:config.spreadsheetId,gid:config.gid},rows};
  };
}
