// js/form.js - Lógica del formulario
import { estado } from './config.js';
import { toast, esc } from './utils.js';

export function recolectarDatos(){
  const emailList = document.getElementById('emailList');
  const emails = [...emailList.querySelectorAll('.email-input')].map(i=>i.value.trim()).filter(Boolean);
  return {
    numCliente: document.getElementById('numCliente')?.value.trim() || '',
    tipoCliente: document.getElementById('tipoCliente')?.value || '',
    identificacion: document.getElementById('identificacion')?.value.trim() || '',
    nombre: document.getElementById('nombre')?.value.trim() || '',
    apellido: document.getElementById('apellido')?.value.trim() || '',
    direccion: document.getElementById('direccion')?.value.trim() || '',
    telefono: document.getElementById('telefono')?.value.trim() || '',
    pais: document.getElementById('pais')?.value || '',
    fechaDesde: document.getElementById('fechaDesde')?.value || '',
    fechaNacimiento: document.getElementById('fechaNacimiento')?.value || '',
    emails
  };
}

export function validarFormulario(validarIdentificacion){
  const d = recolectarDatos();
  if(!d.tipoCliente){ toast('Selecciona el Tipo de Identificación (CC, CE, Pasaporte...)','error'); return false; }
  if(!validarIdentificacion()){ toast('Corrige la Identificación','error'); document.getElementById('identificacion')?.focus(); return false; }
  if(!d.nombre || !d.apellido){ toast('Nombre y Apellido son obligatorios','error'); return false; }
  if(d.emails.length===0){ toast('Agrega al menos un correo válido','error'); return false; }
  const emailRegex=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for(let e of d.emails){ if(!emailRegex.test(e)){ toast(`Correo inválido: ${e}`,'error'); return false; } }
  return true;
}

export function limpiarCampos({clienteForm, emailList, identificacion, errorIdentificacion, hintIdentificacion, toast}){
  return function(silent=false){
    clienteForm.reset();
    emailList.innerHTML=`<div class="email-row"><input type="email" class="email-input" placeholder="correo@ejemplo.com" required><button type="button" class="btn-add-email" id="btnAddEmailNew">+ Agregar</button></div>`;
    const addBtn=document.getElementById('btnAddEmailNew');
    if(addBtn) addBtn.addEventListener('click', ()=>{
      const { addEmailField } = window._formHelpers || {};
      if(addEmailField) addEmailField();
    });
    const firstInput = document.querySelector('.email-input');
    if(firstInput) firstInput.addEventListener('focus', e=> estado.lastFocused=e.target);
    identificacion.classList.remove('error','success');
    errorIdentificacion.classList.remove('show');
    hintIdentificacion.textContent='Solo números · 10 caracteres exactos';
    hintIdentificacion.style.color='';
    hintIdentificacion.style.display='block';
    const nc=document.getElementById('numCliente'); if(nc) nc.value='';
    estado.editandoId=null;
    const btnG=document.querySelector('[data-action="guardar"]'); if(btnG){ btnG.innerHTML='<span class="icon">💾</span>Guardar'; btnG.classList.remove('accent'); }
    if(!silent) toast('Campos limpiados','info');
  };
}

export function cargarEnFormulario(c, {emailList, identificacion, showVista, toast}){
  document.getElementById('numCliente').value=c.numCliente||'';
  document.getElementById('tipoCliente').value=c.tipoCliente||'';
  identificacion.value=c.identificacion||'';
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
      if(i===0) row.innerHTML=`<input type="email" class="email-input" value="${esc(mail)}"><button type="button" class="btn-add-email" id="btnAddEmailNew">+ Agregar</button>`;
      else row.innerHTML=`<input type="email" class="email-input" value="${esc(mail)}"><button type="button" class="btn-remove-email">✕</button>`;
      emailList.appendChild(row);
    });
    emailList.querySelectorAll('.btn-remove-email').forEach(btn=> btn.addEventListener('click', (e)=>{ e.target.closest('.email-row').remove(); if(emailList.querySelectorAll('.email-input').length===0) addFieldEmpty(); }));
    const addBtn=document.getElementById('btnAddEmailNew');
    if(addBtn) addBtn.addEventListener('click', ()=>{
      const { addEmailField } = window._formHelpers || {};
      if(addEmailField) addEmailField();
    });
    emailList.querySelectorAll('.email-input').forEach(inp=> inp.addEventListener('focus', e=> estado.lastFocused=e.target));
  } else {
    addFieldEmpty();
  }
  if(showVista) showVista('form');
  if(toast) toast(`Cliente ${c.nombre} cargado en formulario`,'info');
}

function addFieldEmpty(){
  const emailList = document.getElementById('emailList');
  const row=document.createElement('div'); row.className='email-row';
  row.innerHTML=`<input type="email" class="email-input" placeholder="correo@ejemplo.com"><button type="button" class="btn-add-email" id="btnAddEmailNew">+ Agregar</button>`;
  row.querySelector('.email-input').addEventListener('focus', e=> estado.lastFocused=e.target);
  const addBtn=row.querySelector('#btnAddEmailNew');
  addBtn.addEventListener('click', ()=>{
    const { addEmailField } = window._formHelpers || {};
    if(addEmailField) addEmailField();
  });
  emailList.appendChild(row);
}

export function autocompletarPorIdentificacion({identificacion, emailList, toast, validarIdentificacion}){
  const ident = identificacion.value.trim();
  const tipo = document.getElementById('tipoCliente').value;
  // Usar config para validar longitud
  const cfgMap = { 'CC':{min:6,max:10}, 'CE':{min:3,max:7}, 'TI':{min:10,max:11}, 'PA':{min:6,max:16}, 'NIT':{min:9,max:10}, 'PEP':{min:15,max:15}, 'PPT':{min:6,max:8}, 'Otro':{min:3,max:20} };
  const cfg = cfgMap[tipo] || cfgMap['CC'];
  if(ident.length < cfg.min || ident.length > cfg.max) return;
  let c = null;
  if(tipo) c = estado.clientes.find(x=> x.identificacion===ident && x.tipoCliente===tipo);
  if(!c) c = estado.clientes.find(x=> x.identificacion===ident);
  if(c){
    // Reusar cargar pero sin showVista para no saltar
    document.getElementById('tipoCliente').value = c.tipoCliente||tipo;
    document.getElementById('nombre').value = c.nombre||'';
    document.getElementById('apellido').value = c.apellido||'';
    document.getElementById('direccion').value = c.direccion||'';
    document.getElementById('telefono').value = c.telefono||'';
    document.getElementById('pais').value = c.pais||'';
    const fd=document.getElementById('fechaDesde'); if(fd) fd.value=c.fechaDesde||'';
    const fn=document.getElementById('fechaNacimiento'); if(fn) fn.value=c.fechaNacimiento||'';
    emailList.innerHTML='';
    if(c.emails && c.emails.length){
      c.emails.forEach((mail,i)=>{
        const row=document.createElement('div'); row.className='email-row';
        if(i===0) row.innerHTML=`<input type="email" class="email-input" value="${esc(mail)}"><button type="button" class="btn-add-email" id="btnAddEmailNew">+ Agregar</button>`;
        else row.innerHTML=`<input type="email" class="email-input" value="${esc(mail)}"><button type="button" class="btn-remove-email">✕</button>`;
        emailList.appendChild(row);
      });
      emailList.querySelectorAll('.btn-remove-email').forEach(btn=> btn.addEventListener('click', (e)=>{ e.target.closest('.email-row').remove(); if(emailList.querySelectorAll('.email-input').length===0) addFieldEmpty(); }));
      const addBtn=document.getElementById('btnAddEmailNew');
      if(addBtn) addBtn.addEventListener('click', ()=>{ const { addEmailField } = window._formHelpers || {}; if(addEmailField) addEmailField(); });
      emailList.querySelectorAll('.email-input').forEach(inp=> inp.addEventListener('focus', e=> estado.lastFocused=e.target));
    } else {
      addFieldEmpty();
    }
    estado.seleccionadoId = c.id;
    estado.editandoId = c.id;
    const btnG=document.querySelector('[data-action="guardar"]');
    if(btnG){ btnG.innerHTML='<span class="icon">💾</span>Guardar Cambios'; btnG.classList.add('accent'); }
    validarIdentificacion();
    toast(`✓ Cliente ${c.nombre} ${c.apellido} autocompletado`, 'success');
  }
}
