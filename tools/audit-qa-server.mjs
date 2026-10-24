import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createAnalysisHandler} from '../api/analysis.js';
import {passwordHash} from '../lib/analysis/security.js';
import {CUTOFF,RULES} from '../lib/analysis/engine.js';
import candidates from '../config/candidates.json' with {type:'json'};
const root=path.resolve(import.meta.dirname,'../public');
const secret='JR3 audit browser test only';
const source=async()=>({id:'synthetic-browser',rules:RULES,cutoff:CUTOFF,readAt:'2026-10-24T01:00:00Z',timeZone:'Asia/Jakarta',source:{spreadsheetId:'SYNTHETIC',gid:123},rows:[
  {id:2,name:'Responden Uji A',address:'XI/5',choice:candidates[0].answers[0],timestamp:'2026-10-23T10:00:00Z',rawTimestamp:46318.7},
  {id:3,name:'Responden Uji B',address:'11/05',choice:candidates[1].answers[0],timestamp:'2026-10-23T11:00:00Z',rawTimestamp:46318.75},
  {id:4,name:'Responden Uji C',address:'alamat sintetis perlu diperiksa',choice:candidates[2].answers[0],timestamp:'2026-10-23T11:10:00Z',rawTimestamp:46318.76},
  {id:5,name:'Responden Uji D',address:'IV/11A',choice:candidates[1].answers[0],timestamp:CUTOFF,rawTimestamp:46318.8},
  {id:6,name:'Responden Uji E',address:'VI/11B',choice:candidates[2].answers[0],timestamp:'2026-10-23T12:00:01Z',rawTimestamp:46318.81}
]});
const handler=createAnalysisHandler({env:{ANALYSIS_PASSWORD_HASH:await passwordHash(secret),ANALYSIS_SIGNING_KEY:'cc'.repeat(32),NODE_ENV:'development'},source});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg'};
createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname.startsWith('/api/analysis/')){const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await handler(new Request(url,{method:req.method,headers:req.headers,body:Buffer.concat(chunks)}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
  const file=url.pathname==='/qa.html'?path.resolve(import.meta.dirname,'../tests/analysis-browser.html'):path.resolve(root,'.'+url.pathname.replace(/^\/analisis\/?$/,'/analisis/index.html'));
  if(!file.startsWith(root+path.sep)&&!file.endsWith('analysis-browser.html')){res.writeHead(404);res.end();return;}
  const content=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(content);
}catch{res.writeHead(404);res.end();}}).listen(8771,'127.0.0.1',()=>console.log('Synthetic audit QA: http://127.0.0.1:8771/analisis'));
