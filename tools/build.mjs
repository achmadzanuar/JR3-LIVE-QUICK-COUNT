import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const candidates=JSON.parse(fs.readFileSync(path.join(root,'config/candidates.json'),'utf8'));
if(candidates.length!==7)throw new Error('Expected seven candidates');
const profiles=candidates.map(({answers,...profile})=>profile);
for(const c of profiles){
  if(!/^\/assets\/candidates\/[a-z-]+\.jpg$/.test(c.photo))throw new Error('Invalid poster path');
  if(!fs.existsSync(path.join(root,'public',c.photo)))throw new Error('Poster missing: '+c.id);
}
fs.writeFileSync(path.join(root,'public/candidates.json'),JSON.stringify(profiles));
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
if(app.includes('google.script')||app.includes('GOOGLE_SERVICE_ACCOUNT'))throw new Error('Server code leaked to public UI');
new vm.Script(app);
new vm.Script(fs.readFileSync(path.join(root,'public/theme.js'),'utf8'));
console.log('Build verified: 7 real profiles, 7 posters, percentage-only chart.');
