// js/views.js - Vistas y tablas (SIN MÓDULOS, FUNCIONA EN LOCALHOST)
const porPagina = 5;

function getFiltered(){
  const q = (document.getElementById('searchInput')?.value||'').toLowerCase().trim();
  const pais = document.getElementById('filterPais')?.value||'';
  const tipo = document.getElementById('filterTipo')?.value||'';
  const estadoFiltro = document.getElementById('filterEstado')?.value||'activo';
  return window._estado.clientes.filter(c=>{
    const matchesQ = !q || `${c.nombre} ${c.apellido} ${c.identificacion} ${c.emails?.join(' ')}`.toLowerCase().includes(q);
    const matchesPais = !pais || c.pais===pais;
    const matchesTipo = !tipo || c.tipoCliente===tipo;
    const matchesEstado = estadoFiltro==='todos' || (c.estado||'activo')===estadoFiltro;
    return matchesQ && matchesPais && matchesTipo && matchesEstado;
  });
}

function showVista(nombre){
  window._estado.vistaActual=nombre;
  const form = document.getElementById('cardBodyOriginal');
  if(form) form.style.display = (nombre==='form' ? 'grid' : 'none');
  document.getElementById('vistaBuscar')?.classList.toggle('hidden', nombre!=='buscar');
  document.getElementById('vistaActualizar')?.classList.toggle('hidden', nombre!=='actualizar');
  document.getElementById('vistaSeleccionar')?.classList.toggle('hidden', nombre!=='seleccionar');
  if(nombre==='buscar') renderBuscar();
  if(nombre==='actualizar') renderActualizar();
  if(nombre==='seleccionar' && window.renderSeleccionar) window.renderSeleccionar();
  window.scrollTo({top:0,behavior:'smooth'});
  const pageNumEl=document.getElementById('pageNum');
  if(pageNumEl) pageNumEl.textContent = nombre==='form' ? 1 : (nombre==='buscar'?1:1);
}

function renderBuscar(){
  const tbody=document.getElementById('tbodyBuscar');
  if(!tbody) return;
  const filtered=getFiltered();
  const totalPag=Math.max(1, Math.ceil(filtered.length/5));
  if(window._estado.paginaBuscar>totalPag) window._estado.paginaBuscar=totalPag;
  const start=(window._estado.paginaBuscar-1)*5;
  const slice=filtered.slice(start,start+5);
  const pageEl=document.getElementById('buscarPage');
  const infoEl=document.getElementById('buscarInfo');
  if(pageEl) pageEl.textContent=1;
  if(infoEl) infoEl.textContent=`${filtered.length} resultados · ${window._estado?.clientes?.length||0} totales`;
  if(slice.length===0){
    tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state"><div class="big">🔍</div><strong>Sin resultados</strong><br>Prueba con otro nombre o identificación</div></td></tr>`;
    return;
  }
  tbody.innerHTML=slice.map((c,i)=>`
    <tr class="${c.id===window._estado?.seleccionadoId?'selected':''}">
      <td><strong>#${String(c.numCliente||'0000').padStart(4,'0')}</strong></td>
      <td><strong>${c.nombre} ${c.apellido}</strong> <span class="badge ${c.estado==='suspendido'?'suspendido':'activo'}">${c.estado==='suspendido'?'⊘ Suspendido':'✓ Activo'}</span><br><span style="color:var(--muted);font-size:11px">${c.direccion||'—'}</span></td>
      <td><span class="badge">${c.identificacion}</span></td>
      <td><span class="badge ${c.tipoCliente==='NIT'?'juridica':c.tipoCliente==='CC'||c.tipoCliente==='CE'?'vip':''}">${c.tipoCliente||'—'}</span></td>
      <td>${c.telefono||'—'}</td>
      <td>${c.pais||'—'}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(c.emails||[]).join(', ')}">${(c.emails||[])[0]||'—'} ${(c.emails||[]).length>1?` <span style="color:var(--accent)">+${c.emails.length-1}</span>`:''}</td>
      <td><div class="actions-cell">
        <button class="btn-mini primary" onclick="window.cargarEnFormulario && window.cargarEnFormulario(window._estado.clientes.find(x=>x.id==${c.id}))">👁 Ver</button>
        ${window._estado?.enEstacion ? `<button class="btn-mini accent" onclick="window.usarClienteEnCuenta && window.usarClienteEnCuenta(${c.id})">🧾 Usar</button>` : ''}
      </div></td>
    </tr>
  `).join('');
}

function renderActualizar(){
  const tbody=document.getElementById('tbodyActualizar');
  if(!tbody) return;
  const clientes=window._estado?.clientes||[];
  const pageEl=document.getElementById('actualizarPage');
  const infoEl=document.getElementById('actualizarInfo');
  if(pageEl) pageEl.textContent=1;
  if(infoEl) infoEl.textContent=`${clientes.length} clientes`;
  if(clientes.length===0){
    tbody.innerHTML=`<tr><td colspan="6"><div class="empty-state"><div class="big">📋</div>No hay clientes aún. Crea uno con el formulario.</div></td></tr>`;
    return;
  }
  tbody.innerHTML=clientes.map(c=>`
    <tr class="${c.id===window._estado?.editandoId?'selected':''}" data-id="${c.id}">
      <td><strong>${c.numCliente||'—'}</strong></td>
      <td><strong>${c.nombre} ${c.apellido}</strong> <span class="badge ${c.estado==='suspendido'?'suspendido':'activo'}">${c.estado==='suspendido'?'Suspendido':'Activo'}</span><br><span style="font-size:11px;color:var(--muted)">${c.identificacion}</span></td>
      <td><span class="badge">${c.identificacion}</span></td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.direccion||'—'}</td>
      <td>${c.pais||'—'}</td>
      <td><div class="actions-cell">
        <button class="btn-mini primary btn-edit" data-id="${c.id}">✎ Editar</button>
        <button class="btn-mini danger btn-delete" data-id="${c.id}">🗑 Eliminar</button>
      </div></td>
    </tr>
  `).join('');

  // Event delegation - un solo listener para todos los botones
  tbody.onclick = (e) => {
    const btn = e.target.closest('button');
    if(!btn) return;
    const id = Number(btn.dataset.id);
    if(btn.classList.contains('btn-edit')){
      editarCliente(id);
    } else if(btn.classList.contains('btn-delete')){
      eliminarCliente(id);
    }
  };
}

function editarCliente(id){
  const c = (window._estado?.clientes || []).find(x => String(x.id) === String(id));
  if(!c){ window.toast?.('No se encontró el cliente', 'error'); return; }
  window._estado.editandoId = c.id;
  if(window.cargarEnFormulario) window.cargarEnFormulario(c);
  if(window.showVista) window.showVista('form');
  const btnG = document.querySelector('[data-action="guardar"]');
  if(btnG){ btnG.innerHTML='<span class="icon">💾</span>Guardar Cambios'; btnG.classList.add('accent'); }
  if(window.toast) window.toast('Editando a '+c.nombre+' '+c.apellido+' — modifica y pulsa Guardar Cambios','info');
}

function eliminarCliente(id){
  const c = (window._estado?.clientes || []).find(x => String(x.id) === String(id));
  if(!c){ window.toast?.('No se encontró el cliente', 'error'); return; }
  if(!confirm(`¿Eliminar a ${c.nombre} ${c.apellido} (${c.identificacion})?`)) return;
  fetch(`/api/api.php?id=${id}`, {method:'DELETE'})
    .then(r=>r.json())
    .then(r=>{
      if(r.ok){ window.toast?.('Eliminado','success'); location.reload(); }
      else alert(r.error || 'Error al eliminar');
    })
    .catch(()=>alert('Error de conexión'));
}

// Exponer a window para acceso global y debug
window.editarCliente = editarCliente;
window.eliminarCliente = eliminarCliente;

export { showVista, renderBuscar, renderActualizar };
