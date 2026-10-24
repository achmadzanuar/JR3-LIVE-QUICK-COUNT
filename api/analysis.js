import {randomUUID,createHash} from 'node:crypto';
import {AuditError,securityConfig,signer,checkPassword,createSession,validSession,sessionCookie} from '../lib/analysis/security.js';
import {calculateAnalysis,RULES} from '../lib/analysis/engine.js';
import {createAuditSource} from '../lib/analysis/source.js';
import {publicSourceError,SourceError} from '../lib/source.js';

const messages={NOT_CONFIGURED:'Akses audit belum dikonfigurasi.',UNAUTHORIZED:'Silakan masuk kembali.',ORIGIN:'Asal permintaan tidak diizinkan.',LOGIN_FAILED:'Password tidak sesuai.',RATE_LIMIT:'Terlalu banyak percobaan. Coba lagi dalam 15 menit.',INVALID_SIGNATURE:'Berkas atau salinan audit tidak sah / telah berubah.',INVALID_REQUEST:'Permintaan tidak sesuai.',FINAL_LOCKED:'Arsip final terkunci. Buat revisi draf untuk mengubah keputusan.',UNRESOLVED:'Selesaikan seluruh respons yang perlu pemeriksaan terlebih dahulu.',TOO_LARGE:'Berkas terlalu besar.',METHOD:'Metode tidak tersedia.'};
export function createAnalysisHandler({env=process.env,source=createAuditSource({env}),now=Date.now}={}){
  const attempts=new Map();
  const development=env.NODE_ENV==='development'&&env.VERCEL_ENV!=='production';
  return async request=>{
    const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Vary':'Cookie'};
    const response=(data,status=200,extra={})=>Response.json(data,{status,headers:{...headers,...extra}});
    try{
      const config=securityConfig(env), signatures=signer(config.key);
      const url=new URL(request.url), action=url.searchParams.get('action')||url.pathname.split('/').pop();
      if(request.method!=='POST')throw new AuditError('METHOD',405);
      const expected=env.ANALYSIS_ORIGIN||url.origin;
      if(request.headers.get('origin')!==expected)throw new AuditError('ORIGIN',403);
      const authenticated=validSession(request,config,now());
      if(action!=='login'&&!authenticated)throw new AuditError('UNAUTHORIZED',401);
      if(Number(request.headers.get('content-length')||0)>3000000)throw new AuditError('TOO_LARGE',413);
      let text='';
      if(request.body){
        const reader=request.body.getReader();let bytes=0;const chunks=[];
        while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>3000000){await reader.cancel();throw new AuditError('TOO_LARGE',413);}chunks.push(Buffer.from(value));}
        text=Buffer.concat(chunks).toString('utf8');
      }
      let body;try{body=text?JSON.parse(text):{};}catch{throw new AuditError('INVALID_REQUEST');}
      if(!body||typeof body!=='object'||Array.isArray(body))throw new AuditError('INVALID_REQUEST');
      if(action==='login'){
        const ip=createHash('sha256').update(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'unknown').digest('hex');
        for(const [key,item]of attempts)if(now()-item.since>=900000)attempts.delete(key);
        const limit=attempts.get(ip)||{count:0,since:now()};
        if(limit.count>=5)throw new AuditError('RATE_LIMIT',429);
        if(!await checkPassword(body.password,config.hash)){
          limit.count++;if(attempts.size>=1000)attempts.delete(attempts.keys().next().value);attempts.set(ip,limit);
          throw new AuditError('LOGIN_FAILED',401);
        }
        attempts.delete(ip);
        return response({ok:true},200,{'Set-Cookie':sessionCookie(createSession(config,now()),development)});
      }
      if(action==='logout')return response({ok:true},200,{'Set-Cookie':sessionCookie('',development)});
      if(action==='session')return response({ok:true});
      const pack=document=>({ok:true,document,result:calculateAnalysis(signatures.verify(document,'draft').snapshot.data,document.data.decisions)});
      const validate=document=>{
        if(!['draft','final'].includes(document?.type))throw new AuditError('INVALID_SIGNATURE');
        const data=signatures.verify(document,document.type);
        const snapshot=signatures.verify(data.snapshot,'source');
        if(snapshot.rules!==RULES)throw new AuditError('INVALID_SIGNATURE');
        return {data,snapshot};
      };
      if(action==='snapshot'){
        const snapshot=signatures.sign('source',await source());
        const doc=signatures.sign('draft',{id:randomUUID(),version:1,createdAt:new Date(now()).toISOString(),snapshot,decisions:{},history:[],parent:null});
        return response(pack(doc));
      }
      const {data,snapshot}=validate(body.document);
      if(action==='verify'||action==='preview'||action==='export'){
        if(action==='export'&&!await checkPassword(body.password,config.hash))throw new AuditError('LOGIN_FAILED',401);
        return response({ok:true,document:body.document,result:calculateAnalysis(snapshot,data.decisions)});
      }
      if(action==='revise'){
        if(body.document.type!=='final')throw new AuditError('INVALID_REQUEST');
        const draft=signatures.sign('draft',{id:randomUUID(),version:data.version+1,createdAt:new Date(now()).toISOString(),snapshot:data.snapshot,decisions:data.decisions,history:data.history,parent:{id:data.id,signature:body.document.signature,finalizedAt:data.finalizedAt}});
        return response(pack(draft));
      }
      if(body.document.type==='final')throw new AuditError('FINAL_LOCKED');
      if(action==='decision'){
        const change=body.change;
        if(!change||!Number.isSafeInteger(change.id)||!snapshot.rows.some(r=>r.id===change.id)||!['correct','reject','reset'].includes(change.action)||typeof change.reason!=='string'||change.reason.trim().length<3||change.reason.length>1000)throw new AuditError('INVALID_REQUEST');
        if(change.action==='correct'){
          const {normalizeHouseAddress}=await import('../lib/election.js');
          if(typeof change.address!=='string'||change.address.length>200||!normalizeHouseAddress(change.address))throw new AuditError('INVALID_REQUEST');
        }
        if(data.history.length>=10000)throw new AuditError('TOO_LARGE',413);
        const before=data.decisions[change.id]||null;
        const after=change.action==='reset'?null:{action:change.action,...(change.action==='correct'?{address:change.address.trim()}:{}),reason:change.reason.trim()};
        const decisions={...data.decisions};if(after)decisions[change.id]=after;else delete decisions[change.id];
        const row=snapshot.rows.find(r=>r.id===change.id);
        const event={response:change.id,before,after,addressBefore:before?.action==='correct'?before.address:row.reviewedAddress||row.address,addressAfter:after?.action==='correct'?after.address:row.reviewedAddress||row.address,reason:change.reason.trim(),at:new Date(now()).toISOString(),actor:'Password panitia bersama; identitas tidak diverifikasi'};
        return response(pack(signatures.sign('draft',{...data,decisions,history:[...data.history,event]})));
      }
      if(action==='finalize'){
        const result=calculateAnalysis(snapshot,data.decisions);
        if(result.counts.review)throw new AuditError('UNRESOLVED');
        const final=signatures.sign('final',{...data,finalizedAt:new Date(now()).toISOString(),result});
        return response({ok:true,document:final,result});
      }
      throw new AuditError('INVALID_REQUEST');
    }catch(error){
      if(error instanceof SourceError)return response({ok:false,error:publicSourceError(error)},503);
      const code=error instanceof AuditError?error.code:'UNAVAILABLE';
      return response({ok:false,error:{code,message:messages[code]||'Audit belum dapat diproses. Coba kembali.'}},error instanceof AuditError?error.status:503);
    }
  };
}
export default {fetch:createAnalysisHandler()};
