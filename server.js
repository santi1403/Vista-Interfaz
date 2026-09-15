// Estación Simphony: sirve la UI y guarda clientes + vínculo check↔cliente.
// Harmony POST /fiscal/harmony → resuelve adquirente o consumidor final.
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const HARMONY_DIR = path.join(DATA_DIR, 'harmony');
const mime = {'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json'};

const CONSUMIDOR_FINAL = {
  tipoCliente: 'NIT',
  identificacion: '222222222222',
  nombre: 'CONSUMIDOR',
  apellido: 'FINAL',
  direccion: '',
  telefono: '',
  emails: []
};

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
  let clean = String(num||'').replace(/[\s.\-]/g,'');
  if(['PA','Otro'].includes(tipo)) clean = clean.toUpperCase();
  if(clean.length < cfg.min || clean.length > cfg.max) return `${cfg.label} debe tener entre ${cfg.min} y ${cfg.max} caracteres (actual: ${clean.length})`;
  const ok = cfg.tipo==='numeric' ? /^[0-9]+$/.test(clean) : /^[a-zA-Z0-9]+$/.test(clean);
  if(!ok) return cfg.tipo==='numeric' ? `Solo números para ${cfg.label}` : `Solo letras y números para ${cfg.label}`;
  return null;
}

function ensureData(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive:true});
  if(!fs.existsSync(HARMONY_DIR)) fs.mkdirSync(HARMONY_DIR, {recursive:true});
  if(!fs.existsSync(STORE_FILE)){
    fs.writeFileSync(STORE_FILE, JSON.stringify({clientes:[], factura_cliente:[], nextId:1}, null, 2));
  }
}
function loadStore(){
  ensureData();
  try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); }
  catch(e){ return {clientes:[], factura_cliente:[], nextId:1}; }
}
function saveStore(store){
  ensureData();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function mapCliente(c){
  return {
    ...c,
    numCliente: c.numCliente || c.num_cliente,
    tipoCliente: c.tipoCliente || c.tipo_id,
    fechaDesde: c.fechaDesde || c.fecha_desde || '',
    fechaNacimiento: c.fechaNacimiento || c.fecha_nacimiento || '',
    emails: c.emails || [],
    estado: c.estado || 'activo'
  };
}

function xmlEsc(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function extraerCheckId(raw){
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw || {});
  try {
    const j = JSON.parse(s);
    const v = j.checkNumber || j.check_id || j.checkId || j.CheckNumber || j.CheckID
      || j.GuestCheck?.CheckNumber || j.guestCheck?.checkNumber;
    if(v) return String(v).trim();
  } catch {}
  const pats = [
    /<(?:CheckNumber|CheckID|CheckId|checkRef|CheckNum|Check_ID|GuestCheckId|CheckSeq)[^>]*>([^<]+)/i,
    /"(?:checkNumber|check_id|checkId|checkRef|CheckNumber|CheckID|guestCheckId)"\s*:\s*"?([^",}\s]+)/i
  ];
  for(const p of pats){
    const m = s.match(p);
    if(m && m[1]) return String(m[1]).trim();
  }
  return '';
}

function clientePorCheck(store, checkId){
  const vinculo = (store.factura_cliente||[]).find(x => String(x.check_id) === String(checkId));
  if(!vinculo) return {consumidorFinal:true, cliente: CONSUMIDOR_FINAL};
  const c = (store.clientes||[]).find(x => String(x.id) === String(vinculo.usuario_id));
  if(!c || c.estado === 'suspendido') return {consumidorFinal:true, cliente: CONSUMIDOR_FINAL};
  return {consumidorFinal:false, cliente: mapCliente(c)};
}

function upsertVinculo(store, checkId, usuarioId, extra){
  const id = String(checkId||'').trim();
  if(!id) return;
  store.factura_cliente = store.factura_cliente || [];
  const row = {
    check_id: id,
    usuario_id: Number(usuarioId),
    fecha_vinculacion: new Date().toISOString()
  };
  if(extra && extra.empleado_pos) row.empleado_pos = String(extra.empleado_pos);
  const idx = store.factura_cliente.findIndex(x => String(x.check_id)===id);
  if(idx >= 0) store.factura_cliente[idx] = { ...store.factura_cliente[idx], ...row };
  else store.factura_cliente.push(row);
}

function idsAVincular(input){
  const ids = [];
  const add = (v) => {
    const s = String(v||'').trim();
    if(s && !ids.includes(s)) ids.push(s);
  };
  add(input.check_id || input.checkId);
  add(input.check_num || input.checkNum);
  add(input.guid);
  (input.check_ids || input.checkIds || []).forEach(add);
  return ids;
}

function json(res, code, obj){
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'});
  res.end(JSON.stringify(obj));
}

function handleApi(req, res, parsed, body){
  const action = parsed.query.action || '';
  let input = {};
  try { input = JSON.parse(body || '{}'); } catch {}
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method === 'OPTIONS'){ res.writeHead(204); return res.end(); }

  const store = loadStore();

  if(req.method==='GET' && action==='porCheck'){
    const checkId = String(parsed.query.check_id || parsed.query.checkId || '').trim();
    if(!checkId) return json(res, 400, {ok:false, error:'Falta check_id'});
    const r = clientePorCheck(store, checkId);
    return json(res, 200, {ok:true, check_id: checkId, ...r});
  }

  if(req.method==='GET' && action==='facturas'){
    const uid = parsed.query.usuario_id;
    const rows = (store.factura_cliente||[]).filter(x => String(x.usuario_id)===String(uid));
    return json(res, 200, {ok:true, data: rows});
  }

  if(req.method==='GET' && (action==='list' || action==='')){
    const estadoFiltro = parsed.query.estado || 'todos';
    let rows = (store.clientes||[]).map(mapCliente);
    if(estadoFiltro==='activo' || estadoFiltro==='suspendido'){
      rows = rows.filter(c => (c.estado||'activo')===estadoFiltro);
    }
    rows.sort((a,b)=> Number(b.id)-Number(a.id));
    for(const c of rows){
      const fac = (store.factura_cliente||[]).filter(x => String(x.usuario_id)===String(c.id));
      c.facturas = fac;
      c.check_ids = fac.map(x=>x.check_id);
      if(fac[0]) c.check_id = fac[0].check_id;
    }
    return json(res, 200, {ok:true, data: rows});
  }

  if(req.method==='POST' && (action==='vincular' || action==='factura')){
    const usuarioId = input.usuario_id || input.usuarioId || input.cliente_id;
    const ids = idsAVincular(input);
    if(!ids.length || !usuarioId) return json(res, 400, {ok:false, error:'Falta check_id y usuario_id'});
    const extra = { empleado_pos: input.empleado_pos || input.empleadoPos || '' };
    ids.forEach(id => upsertVinculo(store, id, usuarioId, extra));
    saveStore(store);
    return json(res, 200, {ok:true, msg:'Check vinculado al cliente', check_ids: ids});
  }

  if(req.method==='POST'){
    const d = input;
    const errN = validarDocumento(d.tipoCliente||'CC', d.identificacion||'');
    if(errN) return json(res, 400, {ok:false, error:errN});
    if(!d.tipoCliente || !d.nombre || !d.apellido || !(d.emails||[]).length){
      return json(res, 400, {ok:false, error:'Faltan campos obligatorios'});
    }
    const identNorm = (['PA','Otro'].includes(d.tipoCliente) ? String(d.identificacion||'').replace(/[\s.\-]/g,'').toUpperCase() : d.identificacion);
    if((store.clientes||[]).some(c => c.identificacion===identNorm)){
      return json(res, 409, {ok:false, error:'Ya existe esa identificación'});
    }
    const id = store.nextId || ((store.clientes||[]).reduce((m,c)=>Math.max(m, Number(c.id)||0), 0)+1);
    const num = d.numCliente || String((store.clientes||[]).length+1).padStart(4,'0');
    const nuevo = {
      id, numCliente: num, tipoCliente: d.tipoCliente, identificacion: identNorm,
      nombre: d.nombre, apellido: d.apellido, direccion: d.direccion||'',
      telefono: d.telefono||'', pais: d.pais||'', fechaDesde: d.fechaDesde||'',
      fechaNacimiento: d.fechaNacimiento||'', emails: d.emails||[], estado:'activo'
    };
    store.clientes = store.clientes || [];
    store.clientes.push(nuevo);
    store.nextId = id + 1;
    const checkIds = idsAVincular(d);
    const extra = { empleado_pos: d.empleado_pos || d.empleadoPos || '' };
    checkIds.forEach(cid => upsertVinculo(store, cid, id, extra));
    saveStore(store);
    return json(res, 200, {ok:true, id, numCliente: num});
  }

  if(req.method==='PUT'){
    const id = parsed.query.id || input.id;
    const d = input;
    const idx = (store.clientes||[]).findIndex(x => String(x.id)===String(id));
    if(idx < 0) return json(res, 404, {ok:false, error:'Cliente no encontrado'});
    const identUpd = (['PA','Otro'].includes(d.tipoCliente) ? String(d.identificacion||'').replace(/[\s.\-]/g,'').toUpperCase() : d.identificacion);
    store.clientes[idx] = {
      ...store.clientes[idx],
      numCliente: d.numCliente || store.clientes[idx].numCliente,
      tipoCliente: d.tipoCliente, identificacion: identUpd,
      nombre: d.nombre, apellido: d.apellido, direccion: d.direccion||'',
      telefono: d.telefono||'', pais: d.pais||'', fechaDesde: d.fechaDesde||'',
      fechaNacimiento: d.fechaNacimiento||'', emails: d.emails||[],
      estado: d.estado || 'activo'
    };
    saveStore(store);
    return json(res, 200, {ok:true});
  }

  if(req.method==='DELETE'){
    const id = parsed.query.id;
    store.clientes = (store.clientes||[]).filter(x => String(x.id)!==String(id));
    store.factura_cliente = (store.factura_cliente||[]).filter(x => String(x.usuario_id)!==String(id));
    store.clientes.forEach((c,i)=> { c.numCliente = String(i+1).padStart(4,'0'); });
    saveStore(store);
    return json(res, 200, {ok:true});
  }

  if(req.method==='PATCH'){
    const id = parsed.query.id;
    const c = (store.clientes||[]).find(x => String(x.id)===String(id));
    if(c) c.estado = 'activo';
    saveStore(store);
    return json(res, 200, {ok:true});
  }

  return json(res, 400, {ok:false, error:'Acción no válida'});
}

function handleHarmony(req, res, body){
  ensureData();
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  fs.writeFileSync(path.join(HARMONY_DIR, stamp + '.txt'), body || '');
  const checkId = extraerCheckId(body);
  const store = loadStore();
  const r = checkId ? clientePorCheck(store, checkId) : {consumidorFinal:true, cliente: CONSUMIDOR_FINAL};
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<FiscalResponse>
  <Status>Approved</Status>
  <Message>${r.consumidorFinal ? 'Consumidor final' : 'Cliente vinculado'}</Message>
  <CheckId>${xmlEsc(checkId)}</CheckId>
  <ConsumerFinal>${r.consumidorFinal ? 'true' : 'false'}</ConsumerFinal>
  <TipoId>${xmlEsc(r.cliente.tipoCliente)}</TipoId>
  <Identificacion>${xmlEsc(r.cliente.identificacion)}</Identificacion>
  <Nombre>${xmlEsc((r.cliente.nombre||'') + ' ' + (r.cliente.apellido||''))}</Nombre>
  <CUFE></CUFE>
</FiscalResponse>`;
  const ct = req.headers['content-type'] || '';
  const acc = req.headers['accept'] || '';
  const wantsJson = /json/i.test(ct) || (/json/i.test(acc) && !/xml/i.test(acc) && !/xml/i.test(ct));
  if(!wantsJson){
    res.writeHead(200, {'Content-Type':'application/xml; charset=utf-8'});
    return res.end(xml);
  }
  json(res, 200, {
    ok: true,
    status: 'Approved',
    check_id: checkId,
    consumidorFinal: r.consumidorFinal,
    cliente: r.cliente,
    cufe: null
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';
  if(req.method==='OPTIONS'){
    res.writeHead(204, {
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,PATCH,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type'
    });
    return res.end();
  }
  if(pathname === '/fiscal/harmony' || pathname === '/fiscal/harmony/'){
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => handleHarmony(req, res, body));
    return;
  }
  if(pathname.startsWith('/api') || pathname === '/api.php'){
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => handleApi(req, res, parsed, body));
    return;
  }
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '').replace(/\//g, path.sep);
  let filePath = path.resolve(ROOT, rel);
  const rootAbs = path.resolve(ROOT);
  if(filePath !== rootAbs && !filePath.startsWith(rootAbs + path.sep)){ res.writeHead(403); return res.end(); }
  fs.readFile(filePath, (err, data) => {
    if(err){ res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.writeHead(200, {'Content-Type': mime[ext] || 'text/plain'});
    res.end(data);
  });
});

ensureData();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Estación Simphony lista → http://127.0.0.1:${PORT}/index.html?pos=1`);
  console.log(`Harmony POST → http://127.0.0.1:${PORT}/fiscal/harmony`);
});
