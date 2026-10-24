import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import handler from '../api/results.js';
import analysis from '../api/analysis.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg'};
const port=Number(process.env.PORT || 8767);
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://'+req.headers.host);
  try{
    if(url.pathname==='/api/results'||url.pathname.startsWith('/api/analysis/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const response=await (url.pathname==='/api/results'?handler:analysis).fetch(new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}));
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const filename=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname.replace(/^\/analisis\/?$/,'/analisis/index.html')));
    if(!filename.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
    const data=await fs.readFile(filename);res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port));
