// js/api.js - Comunicación con SQL Server (server-sql.js / api PHP legacy)
import { API_URL, estado } from './config.js';
import { toast } from './utils.js';

export async function apiList(estadoFiltro='todos'){
  try {
    const r = await fetch(`${API_URL}?action=list&estado=${estadoFiltro}`);
    if (!r.ok) throw new Error('no api');
    const j = await r.json();
    if (j.ok) return j.data;
  } catch(e) {}
  return null;
}
export async function apiCrear(datos){
  const r = await fetch(API_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(datos)});
  return r.json();
}
export async function apiActualizar(id, datos){
  const r = await fetch(`${API_URL}?id=${id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(datos)});
  return r.json();
}
export async function apiBorrar(id){
  const r = await fetch(`${API_URL}?id=${id}`, {method:'DELETE'});
  return r.json();
}
export async function apiReactivar(id){
  const r = await fetch(`${API_URL}?id=${id}`, {method:'PATCH'});
  return r.json();
}

export async function sincronizarDesdeAPI(renderers){
  const data = await apiList('todos');
  if (data) {
    estado.usandoAPI = true;
    estado.clientes = data;
    localStorage.setItem('clientes_proto', JSON.stringify(estado.clientes));
    document.getElementById('clientCount').textContent = estado.clientes.length;
    if(renderers){
      renderers.renderBuscar(); renderers.renderActualizar();
      // renderSeleccionar ya no existe, pero por compatibilidad
      if(renderers.renderSeleccionar) renderers.renderSeleccionar();
    }
    toast('Conectado a SQL Server — datos reales cargados','success');
  } else {
    toast('Modo local (sin servidor) — inicia node server-sql.js para guardar en SQL Server','info');
  }
}
