// server-sql.js - Servidor Node para SQL Server CAJAIMPORTADOS\SQLINTERFAZ (sin tocar interfaz)
// Ejecutar: npm install mssql && node server-sql.js  -> http://localhost:8000
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
let sql;
try { sql = require('mssql'); } catch(e){ console.log('Falta mssql. Ejecuta: npm install mssql'); process.exit(1); }

const DB = {
  server: 'CAJAIMPORTADOS\\SQLINTERFAZ',
  database: 'gestion_clientes',
  user: 'sa',
  password: 'Grup0IVK1*', // misma de ConfiguracionInstalacion.Cfg, cambia si tu sa tiene otra
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
  pool: { max: 10, min: 0 }
};
// Si usas Windows Auth sin password, comenta user/password y usa: options: { trustedConnection: true }

const docConfig = {
  'CC':  {label:'Cédula de Ciudadanía', tipo:'numeric', min:6, max:10},
  'CE':  {label:'Cédula de Extranjería', tipo:'numeric', min:3, max:7},
  'TI':  {label:'Tarjeta de Identidad', tipo:'numeric', min:10, max:11},
  'PA':  {label:'Pasaporte', tipo:'alphanumeric', min:6, max:16},
  'NIT': {label:'NIT', tipo:'numeric', min:9, max:10},
  'PEP': {label:'PEP', tipo:'numeric', min:15, max:15},
  'PPT': {label:'PPT', tipo:'numeric', min:6, max:8},
  'Otro':{label:'Otro', tipo:'alphanumeric', min:3, max:20}
};
function validarDocumento(tipo, num){
  const cfg = docConfig[tipo] || docConfig['CC'];
  let clean = String(num||'').replace(/[\s\.\-]/g,'');
  if(['PA','Otro'].includes(tipo)) clean = clean.toUpperCase();
  if(clean.length < cfg.min || clean.length > cfg.max) return `${cfg.label} debe tener entre ${cfg.min} y ${cfg.max} caracteres (actual: ${clean.length})`;
  const ok = cfg.tipo==='numeric' ? /^[0-9]+$/.test(clean) : /^[a-zA-Z0-9]+$/.test(clean);
  if(!ok) return cfg.tipo==='numeric' ? `Solo números para ${cfg.label}` : `Solo letras y números para ${cfg.label}`;
  return null;
}
const PORT = 8000, ROOT = __dirname;
const mime = {'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json'};

let pool;
async function getPool(){ if(pool && pool.connected) return pool; pool = await sql.connect(DB); return pool; }

async function handleApi(req,res,parsed){
  const action = parsed.query.action || '';
  let body=''; req.on('data',c=>body+=c);
  req.on('end', async ()=>{
    try{
      let input={}; try{ input=JSON.parse(body||'{}')}catch{}
      res.setHeader('Access-Control-Allow-Origin','*');
      res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers','Content-Type');
      if(req.method==='OPTIONS'){ res.writeHead(204); return res.end(); }
      const p = await getPool();

      if(req.method==='GET' && (action==='list' || action==='')){
        const estado=parsed.query.estado||'todos';
        let q='SELECT * FROM clientes'; if(estado==='activo'||estado==='suspendido') q+=' WHERE estado=\''+estado+'\''; q+=' ORDER BY id DESC';
        const r=await p.request().query(q);
        let rows=r.recordset;
        for(let c of rows){
          const em=await p.request().input('id', sql.Int, c.id).query('SELECT email FROM cliente_emails WHERE cliente_id=@id');
          c.emails=em.recordset.map(x=>x.email);
          try{ const fac=await p.request().input('id', sql.Int, c.id).query('SELECT check_id, fecha_vinculacion FROM factura_cliente WHERE usuario_id=@id ORDER BY fecha_vinculacion DESC'); c.facturas=fac.recordset; c.check_ids=fac.recordset.map(x=>x.check_id); if(fac.recordset[0]) c.check_id=fac.recordset[0].check_id; }catch(e){ c.facturas=[]; c.check_ids=[]; }
          c.numCliente=c.num_cliente; c.tipoCliente=c.tipo_id; c.fechaDesde=c.fecha_desde?new Date(c.fecha_desde).toISOString().slice(0,10):null; c.fechaNacimiento=c.fecha_nacimiento?new Date(c.fecha_nacimiento).toISOString().slice(0,10):null;
        }
        res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:true,data:rows}));
      }
      if(req.method==='POST' && (action==='vincular' || action==='factura')){
        const checkId=(input.check_id||input.checkId||'').toString().trim(); const usuarioId=input.usuario_id||input.usuarioId||input.cliente_id;
        if(!checkId||!usuarioId){ res.writeHead(400,{'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:false,error:'Falta check_id y usuario_id'})); }
        await p.request().input('check_id', sql.VarChar, checkId).input('usuario_id', sql.Int, usuarioId).query('INSERT INTO factura_cliente (check_id, usuario_id) VALUES (@check_id, @usuario_id)');
        res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:true}));
      }
      if(req.method==='GET' && action==='facturas'){
        const uid=parsed.query.usuario_id; const r=await p.request().input('id', sql.Int, uid).query('SELECT * FROM factura_cliente WHERE usuario_id=@id ORDER BY fecha_vinculacion DESC');
        res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:true,data:r.recordset}));
      }
      if(req.method==='POST'){
        const d=input; const errN=validarDocumento(d.tipoCliente||'CC', d.identificacion||''); if(errN){ res.writeHead(400,{'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:false,error:errN})); }
        const identNorm=(['PA','Otro'].includes(d.tipoCliente)?String(d.identificacion||'').replace(/[\s\.\-]/g,'').toUpperCase():d.identificacion);
        const checkId=(d.check_id||d.checkId||'').toString().trim()||null;
        const cnt=await p.request().query('SELECT COUNT(*) as c FROM clientes'); const num=d.numCliente||String(cnt.recordset[0].c+1).padStart(4,'0');
        const r=await p.request().input('num', sql.VarChar, num).input('tipo', sql.VarChar, d.tipoCliente).input('ident', sql.VarChar, identNorm).input('nom', sql.VarChar, d.nombre).input('ape', sql.VarChar, d.apellido).input('dir', sql.VarChar, d.direccion||null).input('tel', sql.VarChar, d.telefono||null).input('pais', sql.VarChar, d.pais||null).input('fd', sql.Date, d.fechaDesde||null).input('fn', sql.Date, d.fechaNacimiento||null).input('check', sql.VarChar, checkId).query('INSERT INTO clientes (num_cliente,tipo_id,identificacion,nombre,apellido,direccion,telefono,pais,fecha_desde,fecha_nacimiento,estado,check_id) OUTPUT INSERTED.id VALUES (@num,@tipo,@ident,@nom,@ape,@dir,@tel,@pais,@fd,@fn,\'activo\',@check)');
        const newId=r.recordset[0].id;
        for(let e of d.emails||[]) await p.request().input('id', sql.Int, newId).input('email', sql.VarChar, e).query('INSERT INTO cliente_emails (cliente_id,email) VALUES (@id,@email)');
        res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:true,id:newId,numCliente:num}));
      }
      if(req.method==='PUT'){
        const id=parsed.query.id||input.id; const d=input; const errN=validarDocumento(d.tipoCliente||'CC', d.identificacion||''); if(errN){ res.writeHead(400,{'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:false,error:errN})); }
        const identUpd=(['PA','Otro'].includes(d.tipoCliente)?String(d.identificacion||'').replace(/[\s\.\-]/g,'').toUpperCase():d.identificacion);
        const checkId=(d.check_id||d.checkId||'').toString().trim()||null;
        await p.request().input('num', sql.VarChar, d.numCliente).input('tipo', sql.VarChar, d.tipoCliente).input('ident', sql.VarChar, identUpd).input('nom', sql.VarChar, d.nombre).input('ape', sql.VarChar, d.apellido).input('dir', sql.VarChar, d.direccion).input('tel', sql.VarChar, d.telefono).input('pais', sql.VarChar, d.pais).input('fd', sql.Date, d.fechaDesde||null).input('fn', sql.Date, d.fechaNacimiento||null).input('estado', sql.VarChar, d.estado||'activo').input('check', sql.VarChar, checkId).input('id', sql.Int, id).query('UPDATE clientes SET num_cliente=@num,tipo_id=@tipo,identificacion=@ident,nombre=@nom,apellido=@ape,direccion=@dir,telefono=@tel,pais=@pais,fecha_desde=@fd,fecha_nacimiento=@fn,estado=@estado,check_id=@check WHERE id=@id');
        await p.request().input('id', sql.Int, id).query('DELETE FROM cliente_emails WHERE cliente_id=@id');
        for(let e of d.emails||[]) await p.request().input('id', sql.Int, id).input('email', sql.VarChar, e).query('INSERT INTO cliente_emails (cliente_id,email) VALUES (@id,@email)');
        res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:true}));
      }
      if(req.method==='DELETE'){
        const id=parsed.query.id; await p.request().input('id', sql.Int, id).query('DELETE FROM cliente_emails WHERE cliente_id=@id'); await p.request().input('id', sql.Int, id).query('DELETE FROM clientes WHERE id=@id');
        res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:true}));
      }
      if(req.method==='PATCH'){ const id=parsed.query.id; await p.request().input('id', sql.Int, id).query("UPDATE clientes SET estado='activo' WHERE id=@id"); res.writeHead(200,{'Content-Type':'application/json'}); return res.end(JSON.stringify({ok:true})); }
      res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'Acción no válida'}));
    }catch(e){ console.error(e); res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:e.message})); }
  });
}

const server=http.createServer((req,res)=>{
  const parsed=url.parse(req.url,true);
  const pathname=parsed.pathname;
  if(pathname.startsWith('/api') || pathname==='/api.php') return handleApi(req,res,parsed);
  if(pathname==='/api.php') return handleApi(req,res,parsed);
  let filePath=path.join(ROOT, pathname==='/'?'index.html':pathname);
  if(!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(filePath,(err,data)=>{ if(err){ res.writeHead(404); return res.end('Not found'); } const ext=path.extname(filePath); res.writeHead(200,{'Content-Type':mime[ext]||'text/plain'}); res.end(data); });
});
server.listen(PORT, ()=> console.log(`Servidor SQL Server listo -> http://localhost:${PORT} (SQL ${DB.server})`));
