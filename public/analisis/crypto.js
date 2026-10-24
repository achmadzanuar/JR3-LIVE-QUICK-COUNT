const iterations=310000;
function encode(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}
function decode(text){if(typeof text!=='string'||text.length>4100000||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))throw Error('Berkas audit tidak sesuai.');return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
async function key(password,salt,usage){
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations,salt},material,{name:'AES-GCM',length:256},false,[usage]);
}
export async function encryptAudit(document,password){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('JR3AUDIT:1')},await key(password,salt,'encrypt'),new TextEncoder().encode(JSON.stringify(document)));
  return JSON.stringify({format:'JR3AUDIT',version:1,kdf:'PBKDF2-SHA256',iterations,salt:encode(salt),iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext))});
}
export async function decryptAudit(text,password){
  try{
    if(text.length>4200000)throw Error();
    const file=JSON.parse(text);
    if(file.format!=='JR3AUDIT'||file.version!==1||file.kdf!=='PBKDF2-SHA256'||file.iterations!==iterations)throw Error();
    const salt=decode(file.salt),iv=decode(file.iv);if(salt.length!==16||iv.length!==12)throw Error();
    const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('JR3AUDIT:1')},await key(password,salt,'decrypt'),decode(file.ciphertext));
    return JSON.parse(new TextDecoder().decode(raw));
  }catch{throw Error('Password berkas salah atau berkas audit rusak / telah berubah.');}
}
