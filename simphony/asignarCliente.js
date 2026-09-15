/**
 * GestionClientes — botón POS "Asignar cliente"
 *
 * EMC → Extension Application nombre: GestionClientes
 * Content tipo: JavaScript   Host-Type: OPS   (marcar Main)
 * Pegar ESTE archivo completo.
 *
 * Page Design (pantalla de cobro/cierre):
 *   Función:  SIM Inquire
 *   Argumento: GestionClientes:asignarCliente
 *   Opcional URL: GestionClientes:asignarCliente:http://192.168.10.111:8000
 *
 * El servidor de la app debe estar en marcha (ESTACION.bat) ANTES de pulsar el botón.
 */
var _api = SimphonyExtensibilityAPI;
var _ctx = _api.Environment.Context;

function valor(fn) {
  try {
    var v = fn();
    if (v === null || v === undefined) return '';
    return String(v).trim();
  } catch (e) {
    return '';
  }
}

function leerCheck() {
  var formatted = valor(function () { return _ctx.CheckNumberText; });
  var number = valor(function () { return _ctx.CheckNumber; });
  if (number === '0') number = '';
  var guid = valor(function () { return _ctx.Check && (_ctx.Check.Guid || _ctx.Check.CheckGuid); });
  if (!guid) guid = valor(function () { return _ctx.CheckGuid; });
  var principal = formatted || number || guid;
  return { principal: principal, formatted: formatted, number: number, guid: guid };
}

function leerEmpleado() {
  return valor(function () { return _ctx.TransEmployeeNumber; })
    || valor(function () { return _ctx.TransEmployeeID; })
    || valor(function () { return _ctx.EmployeeNumber; });
}

function urlBase(arg1) {
  if (arg1 && /^https?:\/\//i.test(String(arg1))) {
    return String(arg1).replace(/\/+$/, '');
  }
  var cfg = valor(function () {
    return _api.Common.ReadConfigurationValue('GestionClientesUrl', 'http://127.0.0.1:8000');
  });
  return (cfg || 'http://127.0.0.1:8000').replace(/\/+$/, '');
}

function urlApp(base, check) {
  var q = 'pos=1&check=' + encodeURIComponent(check.principal);
  if (check.number && check.number !== check.principal) q += '&check_num=' + encodeURIComponent(check.number);
  if (check.guid && check.guid !== check.principal) q += '&guid=' + encodeURIComponent(check.guid);
  var emp = leerEmpleado();
  if (emp) q += '&emp=' + encodeURIComponent(emp);
  return base + '/index.html?' + q;
}

function htmlEnvoltorio(url) {
  return ''
    + '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<meta http-equiv="X-UA-Compatible" content="IE=edge">'
    + '<style>html,body{margin:0;height:100%;background:#0f172a;overflow:hidden}'
    + 'iframe{border:0;width:100%;height:100%;display:block}</style></head><body>'
    + '<iframe id="app" src="' + url.replace(/"/g, '&quot;') + '"></iframe>'
    + '<script>'
    + 'window.addEventListener("message",function(ev){'
    + '  var d=ev.data||{};'
    + '  if(d.tipo==="pegarCliente"||d.tipo==="cerrarClientes"){'
    + '    try{ if(window.SimphonyPOSAPI) SimphonyPOSAPI.closeDialog(JSON.stringify(d)); }catch(e){}'
    + '  }'
    + '});'
    + '<\/script></body></html>';
}

function crearParmsHtml(html, checkId) {
  var parms = null;
  try {
    var posCore = _api.Common.LoadPosCore();
    parms = new posCore.Micros.PosCore.Extensibility.UserInterface.ExtensibilityInPlaceHtmlDialogParameters();
  } catch (e1) {
    try {
      parms = new Micros.PosCore.Extensibility.UserInterface.ExtensibilityInPlaceHtmlDialogParameters();
    } catch (e2) {
      parms = null;
    }
  }
  if (!parms) return null;
  parms.HTML = html;
  parms.Argument = checkId;
  parms.Sender = 'AsignarCliente';
  try { parms.ShowCloseButton = true; } catch (e) {}
  return parms;
}

function onDialogCerrado() {
  return _api.Eventing.Continue;
}

globalThis.asignarCliente = function (arg1) {
  var check = leerCheck();
  if (!check.principal) {
    _ctx.ShowMessage('Abra una cuenta (check) antes de asignar cliente.');
    return;
  }

  var url = urlApp(urlBase(arg1), check);
  var html = htmlEnvoltorio(url);
  var parms = crearParmsHtml(html, check.principal);
  if (!parms) {
    _ctx.ShowMessage('No se pudo abrir el dialogo HTML. Verifique Extensibility.\n' + url);
    return;
  }

  try {
    if (_ctx.ShowExtensibilityHtmlDialog) {
      _ctx.ShowExtensibilityHtmlDialog(parms);
      return;
    }
  } catch (eShow) {}

  try {
    _api.Eventing.WaitForHtmlDialog(parms, onDialogCerrado);
  } catch (eWait) {
    _ctx.ShowMessage('Error al abrir Asignar cliente: ' + eWait);
  }
};
