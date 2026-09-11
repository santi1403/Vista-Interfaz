// server.js - Servidor estatico sin MySQL (modo localStorage)
// Ejecuta: node server.js -> abre http://localhost:8000
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8000;
const ROOT = __dirname;
const mime = {'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json'};

const server=http.createServer((req,res)=>{
  const parsed=url.parse(req.url,true);
  const pathname=parsed.pathname;
  // API deshabilitada - modo localStorage (para MySQL Express futuro, reconfigurar aqui)
  if(pathname.startsWith('/api') || pathname==='/api.php'){
    res.writeHead(503,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    return res.end(JSON.stringify({ok:false,error:'API MySQL deshabilitada - usando modo local'}));
  }
  let filePath=path.join(ROOT, pathname==='/'?'index.html':pathname);
  if(!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(filePath,(err,data)=>{
    if(err){ res.writeHead(404); return res.end('Not found'); }
    const ext=path.extname(filePath); res.writeHead(200,{'Content-Type':mime[ext]||'text/plain'}); res.end(data);
  });
});
server.listen(PORT, ()=> console.log(`Servidor estatico listo -> http://localhost:${PORT} (sin MySQL, modo local)`));
