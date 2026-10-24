import {createHmac,randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export class AuditError extends Error { constructor(code,status=400){super(code);this.code=code;this.status=status;} }
export function canonical(value) {
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export async function passwordHash(password,salt=randomBytes(16).toString('hex')) {
  const derived=await scrypt(password,salt,64,{N:16384,r:8,p:1});
  return 'scrypt$'+salt+'$'+derived.toString('hex');
}
export async function checkPassword(password,hash) {
  if(typeof password!=='string'||password.length>256) return false;
  const parts=hash.split('$');
  if(parts.length!==3||parts[0]!=='scrypt'||!/^[a-f0-9]{32}$/.test(parts[1])||!/^[a-f0-9]{128}$/.test(parts[2])) return false;
  const actual=await passwordHash(password,parts[1]);
  return timingSafeEqual(Buffer.from(actual),Buffer.from(hash));
}
export function securityConfig(env) {
  if(!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(env.ANALYSIS_PASSWORD_HASH||'')||! /^[a-f0-9]{64,128}$/.test(env.ANALYSIS_SIGNING_KEY||'')) throw new AuditError('NOT_CONFIGURED',503);
  return {hash:env.ANALYSIS_PASSWORD_HASH,key:env.ANALYSIS_SIGNING_KEY};
}
export function signer(key) {
  const mac=(type,data)=>createHmac('sha256',key).update(type+'\n'+canonical(data)).digest('base64url');
  return {
    sign(type,data){return {type,data,signature:mac(type,data)};},
    verify(envelope,type){
      if(!envelope||envelope.type!==type||typeof envelope.signature!=='string'||!envelope.data) throw new AuditError('INVALID_SIGNATURE');
      const actual=mac(type,envelope.data), supplied=envelope.signature;
      if(actual.length!==supplied.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(supplied))) throw new AuditError('INVALID_SIGNATURE');
      return envelope.data;
    }
  };
}
export const COOKIE='jr3_audit_session';
export function createSession(config,now) {
  const data={expires:now+8*3600000,version:createHash('sha256').update(config.hash).digest('hex'),nonce:randomBytes(16).toString('hex')};
  return Buffer.from(JSON.stringify(signer(config.key).sign('session',data))).toString('base64url');
}
export function validSession(request,config,now) {
  try {
    const raw=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    if(!raw||raw.length>2048) return false;
    const data=signer(config.key).verify(JSON.parse(Buffer.from(raw,'base64url').toString()),'session');
    return data.expires>now && data.expires<=now+8*3600000 && data.version===createHash('sha256').update(config.hash).digest('hex');
  } catch {return false;}
}
export function sessionCookie(value,development=false) {
  return COOKIE+'='+value+'; HttpOnly; '+(development?'':'Secure; ')+'SameSite=Strict; Path=/api/analysis; Max-Age='+(value?28800:0);
}
