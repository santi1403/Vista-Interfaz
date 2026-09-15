// js/config.js - Configuración central y constantes
export const docConfig = {
  'CC':  { label:'Cédula de Ciudadanía', tipo:'numeric', min:6, max:10 },
  'CE':  { label:'Cédula de Extranjería', tipo:'numeric', min:3, max:7 },
  'TI':  { label:'Tarjeta de Identidad', tipo:'numeric', min:10, max:11 },
  'PA':  { label:'Pasaporte', tipo:'alphanumeric', min:6, max:16 },
  'NIT': { label:'NIT', tipo:'numeric', min:9, max:10 },
  'PEP': { label:'PEP', tipo:'numeric', min:15, max:15 },
  'PPT': { label:'PPT', tipo:'numeric', min:6, max:8 },
  'Otro':{ label:'Otro', tipo:'alphanumeric', min:3, max:20 }
};

export const API_URL = (() => {
<<<<<<< HEAD
  if (location.protocol === 'file:') return 'http://127.0.0.1:8000/api/api.php';
=======
  // Si se abre como file:// (Visual Studio preview) usar la IP del servidor para que comparta la misma BD MySQL que las paginas http
  if (location.protocol === 'file:') return 'http://192.168.10.111:8000/api/api.php';
>>>>>>> 29d9e492743a1b014ba48207dfe3aafbb0225d90
  return 'api/api.php';
})();
export const porPagina = 5;

const qs = new URLSearchParams(location.search);
export const enEstacion = qs.get('pos') !== '0';
export const checkIdInicial = (qs.get('check') || qs.get('check_id') || '').trim();
export const checkNumInicial = (qs.get('check_num') || '').trim();
export const checkGuidInicial = (qs.get('guid') || '').trim();
export const empleadoPosInicial = (qs.get('emp') || '').trim();

// Estado global (compartido)
export let estado = {
  usandoAPI: false,
  enEstacion,
  currentPage: 1,
  paginaBuscar: 1,
  paginaActualizar: 1,
  vistaActual: 'form',
  editandoId: null,
  seleccionadoId: JSON.parse(localStorage.getItem('seleccionado_proto') || 'null'),
  detalleId: null,
  lastFocused: null,
  clientes: JSON.parse(localStorage.getItem('clientes_proto') || '[]')
};

// Demo si vacío (mismo que antes)
if (estado.clientes.length===0) {
  estado.clientes = [
    {id:1,numCliente:'0001',tipoCliente:'CC',identificacion:'0102030405',nombre:'María',apellido:'González',direccion:'Av. Amazonas 123',telefono:'0991234567',pais:'Ecuador',fechaDesde:'2024-01-15',fechaNacimiento:'1990-05-20',emails:['maria.gonzalez@mail.com'], estado:'activo'},
    {id:2,numCliente:'0002',tipoCliente:'CE',identificacion:'1723456789',nombre:'Carlos',apellido:'Ruiz',direccion:'Calle 10 # 20-30',telefono:'0987654321',pais:'Colombia',fechaDesde:'2023-11-02',fechaNacimiento:'1985-09-10',emails:['carlos.ruiz@mail.com','c.ruiz@empresa.com'], estado:'activo'},
    {id:3,numCliente:'0003',tipoCliente:'NIT',identificacion:'0933445566',nombre:'Empresa',apellido:'Soluciones SA',direccion:'Parque Empresarial',telefono:'022345678',pais:'Perú',fechaDesde:'2022-06-01',fechaNacimiento:'2000-01-01',emails:['contacto@soluciones.pe'], estado:'activo'},
  ];
  localStorage.setItem('clientes_proto', JSON.stringify(estado.clientes));
}
// Migración tipos antiguos
const mapaTipos = {vip:'CC', natural:'CC', juridica:'NIT', corporativo:'NIT'};
let migrado=false;
estado.clientes.forEach(c=>{ 
  if(mapaTipos[c.tipoCliente]){ c.tipoCliente=mapaTipos[c.tipoCliente]; migrado=true; } 
  if(!c.estado){ c.estado='activo'; migrado=true; }
});
if(migrado) localStorage.setItem('clientes_proto', JSON.stringify(estado.clientes));
