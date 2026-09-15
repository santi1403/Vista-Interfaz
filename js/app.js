// js/app.js - Punto de entrada principal (orquestador)
import { estado, docConfig, enEstacion, checkIdInicial, checkNumInicial, checkGuidInicial, empleadoPosInicial } from './config.js';
import { toast, showModal } from './utils.js';
import { validarIdentificacion, getDocCfg, sanitizarDocumento, actualizarAtributosDocumento, initValidation } from './validation.js';
import { initKeyboard } from './keyboard.js';
import { sincronizarDesdeAPI, apiCrear, apiActualizar, apiBorrar, apiReactivar, apiVincular } from './api.js';
import { recolectarDatos, validarFormulario, limpiarCampos, cargarEnFormulario, autocompletarPorIdentificacion } from './form.js';
import { showVista, renderBuscar, renderActualizar } from './views.js';

// Exponer globales para compatibilidad con onclick inline
window._estado = estado;
window.showVista = showVista;
window.renderBuscar = renderBuscar;
window.renderActualizar = renderActualizar;
window.apiBorrar = apiBorrar;
window.apiReactivar = apiReactivar;
window.cargarEnFormulario = (c)=> {
  // wrapper que inyecta dependencias
  const emailList = document.getElementById('emailList');
  const identificacion = document.getElementById('identificacion');
  import('./form.js').then(m=> m.cargarEnFormulario(c, {emailList, identificacion, showVista, toast}));
};
window.iniciarEdicion = (id)=>{
  const c = (window._estado?.clientes || []).find(x => String(x.id) === String(id));
  if(!c){ toast('No se encontró el cliente', 'error'); return; }
  window._estado.editandoId = c.id;
  window.cargarEnFormulario(c);
  const btnG=document.querySelector('[data-action="guardar"]');
  if(btnG){ btnG.innerHTML='<span class="icon">💾</span>Guardar Cambios'; btnG.classList.add('accent'); }
  toast('Editando a '+c.nombre+' '+c.apellido+' — modifica y pulsa Guardar Cambios','info');
};

function activarEstacion(){
  if(!enEstacion) return;
  document.body.classList.add('modo-estacion');
  document.getElementById('bannerEstacion')?.classList.remove('hidden');
  document.getElementById('checkBadge')?.classList.remove('hidden');
  document.getElementById('btnUsarEnCuenta')?.classList.remove('hidden');
  const sub = document.getElementById('headerSub');
  if(sub) sub.textContent = 'Estación Oracle Simphony Hospitality · vincular check al cliente';
  document.title = 'Estación Simphony · Clientes';
  const chk = document.getElementById('checkId');
  if(chk && checkIdInicial && !chk.value) chk.value = checkIdInicial;
  if(chk && checkIdInicial){
    chk.readOnly = true;
    chk.title = 'Check enviado por Simphony';
    chk.classList.add('check-readonly');
  }
  const banner = document.getElementById('bannerEstacion');
  if(banner && checkIdInicial){
    banner.innerHTML = 'Check <strong>' + checkIdInicial + '</strong> enviado por Simphony · busca o crea el cliente y pulsa <strong>Usar en cuenta</strong>.';
  }
}

function extraVinculo(){
  const aliases = [checkNumInicial, checkGuidInicial].filter(x => x && x !== checkIdInicial);
  const extra = {};
  if(aliases.length) extra.check_ids = aliases;
  if(empleadoPosInicial) extra.empleado_pos = empleadoPosInicial;
  return extra;
}

function cerrarDialogoPos(payload){
  const data = payload || {};
  try {
    if(window.SimphonyPOSAPI && typeof SimphonyPOSAPI.closeDialog === 'function'){
      SimphonyPOSAPI.closeDialog(JSON.stringify(data));
      return;
    }
  } catch {}
  if(window.parent !== window){
    try { window.parent.postMessage(data, '*'); } catch {}
  }
  window.close();
}

function notificarVinculo(checkId, clienteId, c){
  const payload = { tipo:'pegarCliente', check_id: checkId, cliente_id: clienteId, cliente: c || null, empleado_pos: empleadoPosInicial || null };
  const nombre = [c?.nombre, c?.apellido].filter(Boolean).join(' ') || 'Cliente';
  toast(`✓ ${nombre} vinculado al check ${checkId}`,'success');
  setTimeout(()=> cerrarDialogoPos(payload), 700);
}

async function vincularACheck(clienteIdPref){
  const checkEl = document.getElementById('checkId');
  const checkId = (checkEl?.value || '').trim();
  if(!checkId){
    toast('Escribe el número de check de Simphony','error');
    checkEl?.focus();
    return;
  }
  if(!estado.usandoAPI){
    toast('El servidor de la estación no está activo. Ejecuta ESTACION.bat','error');
    return;
  }
  let clienteId = clienteIdPref || estado.editandoId || estado.seleccionadoId;
  if(!clienteId){
    if(!validarFormulario(validarFn)) return;
    const datos = recolectarDatos();
    const exist = estado.clientes.find(c => c.identificacion === datos.identificacion);
    if(exist) clienteId = exist.id;
    else {
      const res = await apiCrear({...datos, check_id: checkId, ...extraVinculo()});
      if(!res.ok){ toast(res.error||'No se pudo crear el cliente','error'); return; }
      clienteId = res.id;
      await sincronizarDesdeAPI({renderBuscar, renderActualizar});
      const creado = estado.clientes.find(x => String(x.id)===String(clienteId)) || datos;
      notificarVinculo(checkId, clienteId, creado);
      return;
    }
  }
  const res = await apiVincular(checkId, clienteId, extraVinculo());
  if(!res.ok){ toast(res.error||'No se pudo vincular el check','error'); return; }
  const c = estado.clientes.find(x => String(x.id)===String(clienteId));
  notificarVinculo(checkId, clienteId, c);
}

window.usarClienteEnCuenta = async (id) => {
  const c = estado.clientes.find(x => String(x.id)===String(id));
  if(!c){ toast('No se encontró el cliente','error'); return; }
  estado.seleccionadoId = c.id;
  estado.editandoId = c.id;
  window.cargarEnFormulario(c);
  showVista('form');
  await vincularACheck(c.id);
};
activarEstacion();

// DOM refs
const identificacion = document.getElementById('identificacion');
const errorIdentificacion = document.getElementById('errorIdentificacion');
const hintIdentificacion = document.getElementById('hintIdentificacion');
const emailList = document.getElementById('emailList');
const clienteForm = document.getElementById('clienteForm');
const btnZoom = document.getElementById('btnZoom');
const appCard = document.getElementById('appCard');

// Helpers para form
let addEmailField;
function createAddEmailField(){
  addEmailField = (value='')=>{
    const row = document.createElement('div');
    row.className='email-row';
    row.innerHTML = `<input type="email" class="email-input" placeholder="correo@ejemplo.com" value="${value}"><button type="button" class="btn-remove-email" title="Eliminar">✕</button>`;
    const input = row.querySelector('input');
    const btnRemove = row.querySelector('button');
    input.addEventListener('focus', ()=> estado.lastFocused = input);
    btnRemove.addEventListener('click', ()=>{
      row.remove();
      toast('Correo eliminado','info');
      if(emailList.querySelectorAll('.email-input').length===0) addEmailField();
    });
    emailList.appendChild(row);
    input.focus();
    estado.lastFocused = input;
  };
  window._formHelpers = { addEmailField };
  document.getElementById('btnAddEmail')?.addEventListener('click', ()=>{
    addEmailField(); toast('Campo de correo agregado','info');
  });
  document.querySelector('.email-input')?.addEventListener('focus', (e)=> estado.lastFocused=e.target);
}
createAddEmailField();

// Validación
const validarFn = ()=> validarIdentificacion(identificacion, errorIdentificacion, hintIdentificacion);
initValidation({identificacion, errorEl:errorIdentificacion, hintEl:hintIdentificacion, validarFn, estado});
identificacion.addEventListener('focus', ()=> estado.lastFocused = identificacion);

// Autocompletado
identificacion.addEventListener('input', ()=>{
  const cfg = docConfig[document.getElementById('tipoCliente').value] || docConfig['CC'];
  const l=identificacion.value.trim().length;
  if(l>=cfg.min && l<=cfg.max){
    // inline para evitar import circular
    const tipo=document.getElementById('tipoCliente').value;
    let c=null;
    if(tipo) c=estado.clientes.find(x=> x.identificacion===identificacion.value.trim() && x.tipoCliente===tipo);
    if(!c) c=estado.clientes.find(x=> x.identificacion===identificacion.value.trim());
    if(c){
      document.getElementById('tipoCliente').value=c.tipoCliente||tipo;
      document.getElementById('nombre').value=c.nombre||'';
      document.getElementById('apellido').value=c.apellido||'';
      document.getElementById('direccion').value=c.direccion||'';
      document.getElementById('telefono').value=c.telefono||'';
      document.getElementById('pais').value=c.pais||'';
      const fd=document.getElementById('fechaDesde'); if(fd) fd.value=c.fechaDesde||'';
      const fn=document.getElementById('fechaNacimiento'); if(fn) fn.value=c.fechaNacimiento||'';
      emailList.innerHTML='';
      if(c.emails && c.emails.length){
        c.emails.forEach((mail,i)=>{
          const row=document.createElement('div'); row.className='email-row';
          if(i===0) row.innerHTML=`<input type="email" class="email-input" value="${mail}"><button type="button" class="btn-add-email" id="btnAddEmailNew">+ Agregar</button>`;
          else row.innerHTML=`<input type="email" class="email-input" value="${mail}"><button type="button" class="btn-remove-email">✕</button>`;
          emailList.appendChild(row);
        });
        emailList.querySelectorAll('.btn-remove-email').forEach(btn=> btn.addEventListener('click', (e)=>{ e.target.closest('.email-row').remove(); }));
        const addBtn=document.getElementById('btnAddEmailNew');
        if(addBtn) addBtn.addEventListener('click', ()=> addEmailField());
        emailList.querySelectorAll('.email-input').forEach(inp=> inp.addEventListener('focus', e=> estado.lastFocused=e.target));
      }
      estado.seleccionadoId=c.id;
      estado.editandoId=c.id;
      const btnG=document.querySelector('[data-action="guardar"]');
      if(btnG){ btnG.innerHTML='<span class="icon">💾</span>Guardar Cambios'; btnG.classList.add('accent'); }
      validarFn();
      toast(`✓ Cliente ${c.nombre} ${c.apellido} autocompletado`, 'success');
    }
  }
});

// Teclado
initKeyboard({estado, toast});

// Contadores
function actualizarContadores(){
  const elCC=document.getElementById('clientCount'); if(elCC) elCC.textContent = estado.clientes.length;
}
document.addEventListener('DOMContentLoaded', ()=>{
  actualizarContadores();
  if(estado.seleccionadoId){
    const banner=document.getElementById('bannerSeleccion');
    if(banner) banner.style.display='flex';
  }
});
window.addEventListener('load', ()=>{
  if(!estado.lastFocused) estado.lastFocused = document.getElementById('nombre');
  actualizarContadores();
  sincronizarDesdeAPI({renderBuscar, renderActualizar});
});

// Focus tracking
document.addEventListener('focusin', (e)=>{
  if(e.target.matches('input, select, textarea')) estado.lastFocused = e.target;
});

// Botones
function initBotonesPrincipales(){
  const grid=document.getElementById('btnGrid');
  if(!grid) return;
  // Quitar listeners viejos clonando
  const clone=grid.cloneNode(true);
  grid.parentNode.replaceChild(clone, grid);
  clone.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.btn-action');
  if(!btn) return;
  const action = btn.dataset.action;
  switch(action){
    case 'buscar': showVista('buscar'); break;
    case 'actualizar':
      if(estado.clientes.length===0){ toast('No hay clientes para actualizar — crea uno primero','info'); showVista('form'); break; }
      showVista('actualizar'); break;
    case 'limpiar': {
      const limpiar = limpiarCampos({clienteForm, emailList, identificacion, errorIdentificacion, hintIdentificacion, toast});
      limpiar(); showVista('form'); break;
    }
    case 'crear': {
      if(estado.editandoId){ // si está editando, actualiza
        const datos= recolectarDatos();
        if(!validarFormulario(validarFn)) break;
        const res = estado.usandoAPI ? await apiActualizar(estado.editandoId, {...datos, estado:'activo'}) : null;
        if(estado.usandoAPI){
          if(!res.ok){ toast(res.error||'Error al actualizar','error'); break; }
          await sincronizarDesdeAPI({renderBuscar, renderActualizar});
        } else {
          const idx=estado.clientes.findIndex(x=>x.id===estado.editandoId);
          if(idx!==-1){ estado.clientes[idx]={...estado.clientes[idx], ...datos}; localStorage.setItem('clientes_proto', JSON.stringify(estado.clientes)); }
          renderBuscar(); renderActualizar();
        }
        estado.editandoId=null;
        const bG=document.querySelector('[data-action="guardar"]'); if(bG){ bG.innerHTML='<span class="icon">💾</span>Guardar'; bG.classList.remove('accent'); }
        toast('Cliente actualizado correctamente','success');
        showVista('actualizar');
        break;
      }
      if(!validarFormulario(validarFn)) break;
      const datosCrear=recolectarDatos();
      if(estado.usandoAPI){
        const res = await apiCrear(datosCrear);
        if(res.ok){ toast(`✓ Cliente ${datosCrear.nombre} ${datosCrear.apellido} guardado (#${res.numCliente})`,'success'); await sincronizarDesdeAPI({renderBuscar, renderActualizar}); }
        else toast(res.error||'Error al crear el cliente','error');
      } else {
        if(estado.clientes.some(c=>c.identificacion===datosCrear.identificacion)){ toast('Ya existe un cliente con esa identificación — usa otra','error'); break; }
        const nuevo={...datosCrear, id: Date.now(), numCliente: datosCrear.numCliente || String(estado.clientes.length+1).padStart(4,'0'), estado:'activo'};
        estado.clientes.push(nuevo); localStorage.setItem('clientes_proto', JSON.stringify(estado.clientes));
        renderBuscar(); renderActualizar();
        toast(`✓ Cliente ${nuevo.nombre} ${nuevo.apellido} creado correctamente (#${nuevo.numCliente})`,'success');
      }
      break;
    }
    case 'borrar': {
      const ident = identificacion.value.trim();
      const tipo = document.getElementById('tipoCliente').value;
      let target = null;
      if(ident){
        target = estado.clientes.find(c=> c.identificacion===ident && (!tipo || c.tipoCliente===tipo));
        if(!target) target = estado.clientes.find(c=> c.identificacion===ident);
      }
      if(!target && estado.seleccionadoId) target = estado.clientes.find(c=>c.id===estado.seleccionadoId);
      if(!target){ toast('Escribe una identificación existente o selecciona un cliente para eliminar','error'); break; }
      confirmarBorrar(target.id);
      break;
    }
    case 'guardar': {
      if(estado.editandoId){
        if(!validarFormulario(validarFn)) break;
        const datos= recolectarDatos();
        if(estado.usandoAPI){
          const res=await apiActualizar(estado.editandoId, {...datos, estado:'activo'});
          if(!res.ok){ toast(res.error||'Error','error'); break; }
          await sincronizarDesdeAPI({renderBuscar, renderActualizar});
        } else {
          const idx=estado.clientes.findIndex(x=>x.id===estado.editandoId);
          if(idx!==-1){ estado.clientes[idx]={...estado.clientes[idx], ...datos}; localStorage.setItem('clientes_proto', JSON.stringify(estado.clientes)); renderBuscar(); renderActualizar(); }
        }
        estado.editandoId=null;
        const bG=document.querySelector('[data-action="guardar"]'); if(bG){ bG.innerHTML='<span class="icon">💾</span>Guardar'; bG.classList.remove('accent'); }
        toast('Cliente actualizado correctamente','success');
        showVista('actualizar');
        break;
      }
      if(!validarFormulario(validarFn)) break;
      const datosG=recolectarDatos();
      if(estado.usandoAPI){
        const res = await apiCrear(datosG);
        if(res.ok){ toast(`✓ Cliente ${datosG.nombre} ${datosG.apellido} guardado (#${res.numCliente})`,'success'); await sincronizarDesdeAPI({renderBuscar, renderActualizar}); }
        else toast(res.error||'Error','error');
      } else {
        if(estado.clientes.some(c=>c.identificacion===datosG.identificacion)){ toast('Ya existe un cliente con esa identificación','error'); break; }
        const nuevoG={...datosG, id: Date.now(), numCliente: datosG.numCliente || String(estado.clientes.length+1).padStart(4,'0'), estado:'activo'};
        estado.clientes.push(nuevoG); localStorage.setItem('clientes_proto', JSON.stringify(estado.clientes));
        renderBuscar(); renderActualizar();
        toast(`✓ Cliente ${nuevoG.nombre} ${nuevoG.apellido} guardado (#${nuevoG.numCliente})`,'success');
      }
      break;
    }
  
  activarEstacion();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initBotonesPrincipales);
else initBotonesPrincipales();

// Paginación y otros
document.getElementById('prevBtn')?.addEventListener('click', ()=>{
  if(estado.vistaActual==='buscar'){ if(estado.paginaBuscar>1){ estado.paginaBuscar--; renderBuscar(); } }
  else if(estado.vistaActual==='actualizar'){ if(estado.paginaActualizar>1){ estado.paginaActualizar--; renderActualizar(); } }
  else { if(estado.currentPage>1){ estado.currentPage--; const elPN=document.getElementById('pageNum'); if(elPN) elPN.textContent=estado.currentPage; }}
});
document.getElementById('nextBtn')?.addEventListener('click', ()=>{
  if(estado.vistaActual==='buscar'){
    const total=Math.ceil(estado.clientes.filter(c=>{
      const q=(document.getElementById('searchInput')?.value||'').toLowerCase().trim();
      return !q || `${c.nombre} ${c.apellido} ${c.identificacion}`.toLowerCase().includes(q);
    }).length/porPagina);
    if(estado.paginaBuscar<total){ estado.paginaBuscar++; renderBuscar(); }
  } else if(estado.vistaActual==='actualizar'){
    const total=Math.ceil(estado.clientes.length/porPagina);
    if(estado.paginaActualizar<total){ estado.paginaActualizar++; renderActualizar(); }
  } else { estado.currentPage++; const elPN2=document.getElementById('pageNum'); if(elPN2) elPN2.textContent=estado.currentPage; toast(`Página ${estado.currentPage}`,'info'); }
});
document.getElementById('selectAll')?.addEventListener('change', (e)=>{
  const checked=e.target.checked;
  if(estado.vistaActual==='buscar'){
    if(checked && estado.clientes.length>0){ estado.seleccionadoId=estado.clientes[0].id; localStorage.setItem('seleccionado_proto', JSON.stringify(estado.seleccionadoId)); renderBuscar(); toast('Primer cliente seleccionado','info'); }
    else { estado.seleccionadoId=null; localStorage.setItem('seleccionado_proto', JSON.stringify(null)); renderBuscar(); toast('Selección limpiada','info'); }
  } else toast(checked ? 'Todos seleccionados' : 'Selección limpiada','info');
});
btnZoom?.addEventListener('click', ()=>{
  if(!document.fullscreenElement){
    appCard.requestFullscreen?.().catch(()=>{});
    btnZoom.classList.add('active');
    btnZoom.textContent='⤢ Salir Zoom';
    toast('Modo zoom activado','info');
  } else {
    document.exitFullscreen?.();
    btnZoom.classList.remove('active');
    btnZoom.textContent='⤢ Zoom Pantalla';
  }
});
document.addEventListener('fullscreenchange', ()=>{
  if(!document.fullscreenElement){
    btnZoom.classList.remove('active');
    btnZoom.textContent='⤢ Zoom Pantalla';
  }
});
document.getElementById('numCliente')?.addEventListener('input', (e)=>{
  const val = e.target.value.trim().padStart(4,'0');
  if(val.length>=4){
    const c = estado.clientes.find(x=> (x.numCliente||'').padStart(4,'0')===val);
    if(c){
      // Si escribe # Cliente, autocompleta como si buscara
      const emailList=document.getElementById('emailList');
      const identificacion=document.getElementById('identificacion');
      // Usar cargarEnFormulario si existe
      if(window.cargarEnFormulario){ window.cargarEnFormulario(c); showVista('form'); }
      else {
        document.getElementById('tipoCliente').value=c.tipoCliente||'';
        document.getElementById('identificacion').value=c.identificacion||'';
        document.getElementById('nombre').value=c.nombre||'';
        document.getElementById('apellido').value=c.apellido||'';
      }
    }
  }
});
['telefono','numCliente'].forEach(id=>{
  const el=document.getElementById(id);
  if(!el) return;
  el.addEventListener('input', e=> e.target.value=e.target.value.replace(/\D/g,''));
  el.addEventListener('focus', ()=> estado.lastFocused=el);
});
['nombre','apellido','direccion','tipoCliente','pais'].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.addEventListener('focus', ()=> estado.lastFocused=el);
});
document.getElementById('searchInput')?.addEventListener('input', ()=>{ estado.paginaBuscar=1; renderBuscar(); });
document.getElementById('filterPais')?.addEventListener('change', ()=>{ estado.paginaBuscar=1; renderBuscar(); });
document.getElementById('filterTipo')?.addEventListener('change', ()=>{ estado.paginaBuscar=1; renderBuscar(); });
document.getElementById('filterEstado')?.addEventListener('change', ()=>{ estado.paginaBuscar=1; renderBuscar(); });
document.getElementById('btnBuscarAhora')?.addEventListener('click', ()=>{ estado.paginaBuscar=1; renderBuscar(); toast('Búsqueda actualizada','info'); });
document.getElementById('buscarPrev')?.addEventListener('click', ()=>{ if(estado.paginaBuscar>1){ estado.paginaBuscar--; renderBuscar(); }});
document.getElementById('buscarNext')?.addEventListener('click', ()=>{
  const total=Math.ceil((()=>{
    const q=(document.getElementById('searchInput')?.value||'').toLowerCase().trim();
    return estado.clientes.filter(c=> !q || `${c.nombre} ${c.apellido} ${c.identificacion}`.toLowerCase().includes(q)).length;
  })()/porPagina);
  if(estado.paginaBuscar<total){ estado.paginaBuscar++; renderBuscar(); }
});
document.getElementById('actualizarPrev')?.addEventListener('click', ()=>{ if(estado.paginaActualizar>1){ estado.paginaActualizar--; renderActualizar(); }});
document.getElementById('actualizarNext')?.addEventListener('click', ()=>{
  const total=Math.ceil(estado.clientes.length/porPagina);
  if(estado.paginaActualizar<total){ estado.paginaActualizar++; renderActualizar(); }
});
