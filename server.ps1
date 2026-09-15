# Estación Simphony — servidor HTTP sin Node.js (PowerShell / .NET)
# Lo arranca ESTACION.bat. Equivale a server.js: UI + API JSON + Harmony.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { $Host.UI.RawUI.WindowTitle = 'EstacionSimphony' } catch {}

Add-Type -AssemblyName System.Web.Extensions
Add-Type -ReferencedAssemblies @('System.Web.Extensions', 'System.Management.Automation') -TypeDefinition @'
using System;
using System.Collections;
using System.Collections.Generic;
using System.Management.Automation;
using System.Web.Script.Serialization;

public static class StationJson {
  static object Norm(object o, int depth) {
    if (o == null || depth > 30) return null;
    PSObject pso = o as PSObject;
    if (pso != null) o = pso.BaseObject;
    if (o == null) return null;
    if (o is string || o is bool || o is ValueType) return o;
    IDictionary dict = o as IDictionary;
    if (dict != null) {
      Dictionary<string, object> d = new Dictionary<string, object>();
      foreach (DictionaryEntry e in dict) {
        d[Convert.ToString(e.Key)] = Norm(e.Value, depth + 1);
      }
      return d;
    }
    IEnumerable en = o as IEnumerable;
    if (en != null) {
      ArrayList list = new ArrayList();
      foreach (object x in en) list.Add(Norm(x, depth + 1));
      return list;
    }
    return Convert.ToString(o);
  }
  public static string ToJson(object o) {
    JavaScriptSerializer ser = new JavaScriptSerializer();
    ser.MaxJsonLength = int.MaxValue;
    ser.RecursionLimit = 100;
    return ser.Serialize(Norm(o, 0));
  }
}
'@
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;

public class StationHttpMsg {
  public string Method;
  public string Path;
  public string Query;
  public string Body;
  public string ContentType;
  public string Accept;
}

public class StationHttp {
  TcpListener _listener;
  public StationHttp(int port) {
    _listener = new TcpListener(IPAddress.Any, port);
    _listener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
    _listener.Start();
  }
  public TcpClient Accept() { return _listener.AcceptTcpClient(); }
  public void Stop() { try { _listener.Stop(); } catch {} }

  static int IndexOf(byte[] hay, byte[] needle) {
    for (int i = 0; i <= hay.Length - needle.Length; i++) {
      bool ok = true;
      for (int j = 0; j < needle.Length; j++) {
        if (hay[i + j] != needle[j]) { ok = false; break; }
      }
      if (ok) return i;
    }
    return -1;
  }

  static string HeaderVal(Dictionary<string,string> headers, string key) {
    string v;
    if (headers.TryGetValue(key, out v)) return v;
    return "";
  }

  public static StationHttpMsg ReadRequest(TcpClient client) {
    client.ReceiveTimeout = 30000;
    NetworkStream stream = client.GetStream();
    MemoryStream ms = new MemoryStream();
    byte[] buf = new byte[8192];
    byte[] sep = new byte[] { 13, 10, 13, 10 };
    int headerEnd = -1;
    while (headerEnd < 0) {
      int n = stream.Read(buf, 0, buf.Length);
      if (n <= 0) break;
      ms.Write(buf, 0, n);
      headerEnd = IndexOf(ms.ToArray(), sep);
      if (ms.Length > 2 * 1024 * 1024) break;
    }
    byte[] all = ms.ToArray();
    StationHttpMsg msg = new StationHttpMsg();
    msg.Method = "GET";
    msg.Path = "/";
    msg.Query = "";
    msg.Body = "";
    msg.ContentType = "";
    msg.Accept = "";
    if (all.Length == 0) return msg;
    if (headerEnd < 0) headerEnd = all.Length;
    string headerText = Encoding.ASCII.GetString(all, 0, headerEnd);
    string[] lines = headerText.Split(new string[] { "\r\n" }, StringSplitOptions.None);
    if (lines.Length == 0 || string.IsNullOrEmpty(lines[0])) return msg;
    string[] first = lines[0].Split(' ');
    if (first.Length >= 1) msg.Method = first[0].ToUpperInvariant();
    string target = first.Length >= 2 ? first[1] : "/";
    int q = target.IndexOf('?');
    if (q >= 0) {
      msg.Path = Uri.UnescapeDataString(target.Substring(0, q));
      msg.Query = target.Substring(q + 1);
    } else {
      msg.Path = Uri.UnescapeDataString(target);
      msg.Query = "";
    }
    Dictionary<string,string> headers = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
    for (int i = 1; i < lines.Length; i++) {
      int c = lines[i].IndexOf(':');
      if (c <= 0) continue;
      headers[lines[i].Substring(0, c).Trim()] = lines[i].Substring(c + 1).Trim();
    }
    msg.ContentType = HeaderVal(headers, "Content-Type");
    msg.Accept = HeaderVal(headers, "Accept");
    int contentLen = 0;
    int.TryParse(HeaderVal(headers, "Content-Length"), out contentLen);
    int bodyStart = headerEnd + 4;
    if (bodyStart > all.Length) bodyStart = all.Length;
    MemoryStream bodyMs = new MemoryStream();
    if (bodyStart < all.Length) bodyMs.Write(all, bodyStart, all.Length - bodyStart);
    while (bodyMs.Length < contentLen) {
      int n = stream.Read(buf, 0, buf.Length);
      if (n <= 0) break;
      bodyMs.Write(buf, 0, n);
    }
    byte[] bodyBytes = bodyMs.ToArray();
    if (contentLen > 0 && bodyBytes.Length > contentLen) {
      byte[] cut = new byte[contentLen];
      Buffer.BlockCopy(bodyBytes, 0, cut, 0, contentLen);
      bodyBytes = cut;
    }
    msg.Body = Encoding.UTF8.GetString(bodyBytes);
    return msg;
  }

  public static void WriteResponse(TcpClient client, int code, string contentType, byte[] body, string extraHeaders) {
    if (body == null) body = new byte[0];
    string reason = "OK";
    if (code == 204) reason = "No Content";
    else if (code == 400) reason = "Bad Request";
    else if (code == 403) reason = "Forbidden";
    else if (code == 404) reason = "Not Found";
    else if (code == 409) reason = "Conflict";
    else if (code == 500) reason = "Internal Server Error";
    StringBuilder sb = new StringBuilder();
    sb.Append("HTTP/1.1 ").Append(code).Append(' ').Append(reason).Append("\r\n");
    sb.Append("Content-Type: ").Append(contentType).Append("\r\n");
    sb.Append("Content-Length: ").Append(body.Length).Append("\r\n");
    sb.Append("Connection: close\r\n");
    if (!string.IsNullOrEmpty(extraHeaders)) sb.Append(extraHeaders);
    sb.Append("\r\n");
    byte[] headerBytes = Encoding.ASCII.GetBytes(sb.ToString());
    NetworkStream stream = client.GetStream();
    stream.Write(headerBytes, 0, headerBytes.Length);
    if (body.Length > 0) stream.Write(body, 0, body.Length);
    stream.Flush();
    try { client.Close(); } catch {}
  }
}
'@

$PORT = 8000
$ROOT = $PSScriptRoot
$DATA_DIR = Join-Path $ROOT 'data'
$STORE_FILE = Join-Path $DATA_DIR 'store.json'
$HARMONY_DIR = Join-Path $DATA_DIR 'harmony'
$LOG_FILE = Join-Path $DATA_DIR 'server.log'

$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$ser.MaxJsonLength = [int]::MaxValue
$ser.RecursionLimit = 100

function New-Dict {
  $d = New-Object 'System.Collections.Generic.Dictionary[string,object]'
  Write-Output -NoEnumerate $d
}

$CONSUMIDOR_FINAL = New-Dict
$CONSUMIDOR_FINAL['tipoCliente'] = 'NIT'
$CONSUMIDOR_FINAL['identificacion'] = '222222222222'
$CONSUMIDOR_FINAL['nombre'] = 'CONSUMIDOR'
$CONSUMIDOR_FINAL['apellido'] = 'FINAL'
$CONSUMIDOR_FINAL['direccion'] = ''
$CONSUMIDOR_FINAL['telefono'] = ''
$CONSUMIDOR_FINAL['emails'] = New-Object System.Collections.ArrayList

$docConfig = @{
  'CC'   = @{ label = 'Cédula de Ciudadanía'; tipo = 'numeric'; min = 6; max = 10 }
  'CE'   = @{ label = 'Cédula de Extranjería'; tipo = 'numeric'; min = 3; max = 7 }
  'TI'   = @{ label = 'Tarjeta de Identidad'; tipo = 'numeric'; min = 10; max = 11 }
  'PA'   = @{ label = 'Pasaporte'; tipo = 'alphanumeric'; min = 6; max = 16 }
  'NIT'  = @{ label = 'NIT'; tipo = 'numeric'; min = 9; max = 10 }
  'PEP'  = @{ label = 'PEP'; tipo = 'numeric'; min = 15; max = 15 }
  'PPT'  = @{ label = 'PPT'; tipo = 'numeric'; min = 6; max = 8 }
  'Otro' = @{ label = 'Otro'; tipo = 'alphanumeric'; min = 3; max = 20 }
}

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.txt'  = 'text/plain; charset=utf-8'
  '.xml'  = 'application/xml; charset=utf-8'
}

function Write-Log([string]$msg) {
  try {
    if (-not (Test-Path $DATA_DIR)) { New-Item -ItemType Directory -Path $DATA_DIR | Out-Null }
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $LOG_FILE -Value $line -Encoding UTF8
  } catch {}
}

function Get-Val($obj, [string]$key, $default = $null) {
  if ($null -eq $obj) { return $default }
  if ($obj -is [System.Collections.IDictionary]) {
    if ($obj.ContainsKey($key)) { return $obj[$key] }
    return $default
  }
  $p = $obj.PSObject.Properties[$key]
  if ($p) { return $p.Value }
  return $default
}

function As-List($v) {
  $list = New-Object System.Collections.ArrayList
  if ($null -eq $v) { Write-Output -NoEnumerate $list; return }
  if ($v -is [string]) { [void]$list.Add($v); Write-Output -NoEnumerate $list; return }
  if ($v -is [System.Collections.IDictionary]) { [void]$list.Add($v); Write-Output -NoEnumerate $list; return }
  if ($v -is [System.Collections.IEnumerable]) {
    foreach ($x in $v) { [void]$list.Add($x) }
    Write-Output -NoEnumerate $list
    return
  }
  [void]$list.Add($v)
  Write-Output -NoEnumerate $list
}

function As-Str($v) {
  if ($null -eq $v) { return '' }
  return ([string]$v).Trim()
}

function Validar-Documento([string]$tipo, $num) {
  $cfg = $docConfig[$tipo]
  if (-not $cfg) { $cfg = $docConfig['CC'] }
  $clean = [string]$num -replace '[\s.\-]', ''
  if ($tipo -eq 'PA' -or $tipo -eq 'Otro') { $clean = $clean.ToUpper() }
  if ($clean.Length -lt $cfg.min -or $clean.Length -gt $cfg.max) {
    return ('{0} debe tener entre {1} y {2} caracteres (actual: {3})' -f $cfg.label, $cfg.min, $cfg.max, $clean.Length)
  }
  if ($cfg.tipo -eq 'numeric') {
    if ($clean -notmatch '^[0-9]+$') { return ('Solo números para {0}' -f $cfg.label) }
  } else {
    if ($clean -notmatch '^[a-zA-Z0-9]+$') { return ('Solo letras y números para {0}' -f $cfg.label) }
  }
  return $null
}

function Ensure-Data {
  if (-not (Test-Path $DATA_DIR)) { New-Item -ItemType Directory -Path $DATA_DIR | Out-Null }
  if (-not (Test-Path $HARMONY_DIR)) { New-Item -ItemType Directory -Path $HARMONY_DIR | Out-Null }
  if (-not (Test-Path $STORE_FILE)) {
    $empty = '{"clientes":[],"factura_cliente":[],"nextId":1}'
    [System.IO.File]::WriteAllText($STORE_FILE, $empty, [System.Text.UTF8Encoding]::new($false))
  }
}

function Load-Store {
  Ensure-Data
  try {
    $raw = [System.IO.File]::ReadAllText($STORE_FILE, [System.Text.Encoding]::UTF8)
    if ([string]::IsNullOrWhiteSpace($raw)) { throw 'empty' }
    $obj = $ser.DeserializeObject($raw)
    if ($null -eq $obj) { throw 'null' }
    if (-not $obj.ContainsKey('clientes') -or $null -eq $obj['clientes']) { $obj['clientes'] = New-Object System.Collections.ArrayList }
    else {
      $cl = New-Object System.Collections.ArrayList
      foreach ($x in (As-List $obj['clientes'])) { [void]$cl.Add($x) }
      $obj['clientes'] = $cl
    }
    if (-not $obj.ContainsKey('factura_cliente') -or $null -eq $obj['factura_cliente']) { $obj['factura_cliente'] = New-Object System.Collections.ArrayList }
    else {
      $fc = New-Object System.Collections.ArrayList
      foreach ($x in (As-List $obj['factura_cliente'])) { [void]$fc.Add($x) }
      $obj['factura_cliente'] = $fc
    }
    if (-not $obj.ContainsKey('nextId')) { $obj['nextId'] = 1 }
    Write-Output -NoEnumerate $obj
    return
  } catch {
    $obj = New-Dict
    $obj['clientes'] = New-Object System.Collections.ArrayList
    $obj['factura_cliente'] = New-Object System.Collections.ArrayList
    $obj['nextId'] = 1
    Write-Output -NoEnumerate $obj
    return
  }
}

function Save-Store($store) {
  Ensure-Data
  [System.IO.File]::WriteAllText($STORE_FILE, [StationJson]::ToJson($store), [System.Text.UTF8Encoding]::new($false))
}

function Map-Cliente($c) {
  $out = New-Dict
  foreach ($k in @($c.Keys)) { $out[$k] = $c[$k] }
  if (-not $out.ContainsKey('numCliente')) { $out['numCliente'] = Get-Val $c 'num_cliente' }
  if (-not $out.ContainsKey('tipoCliente')) { $out['tipoCliente'] = Get-Val $c 'tipo_id' }
  if (-not $out.ContainsKey('fechaDesde')) { $out['fechaDesde'] = (Get-Val $c 'fecha_desde' '') }
  if (-not $out.ContainsKey('fechaNacimiento')) { $out['fechaNacimiento'] = (Get-Val $c 'fecha_nacimiento' '') }
  if (-not $out.ContainsKey('emails') -or $null -eq $out['emails']) { $out['emails'] = New-Object System.Collections.ArrayList }
  if (-not $out.ContainsKey('estado') -or -not $out['estado']) { $out['estado'] = 'activo' }
  Write-Output -NoEnumerate $out
}

function Xml-Esc([string]$s) {
  return ([string]$s).Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')
}

function Extraer-CheckId([string]$raw) {
  if ([string]::IsNullOrEmpty($raw)) { return '' }
  try {
    $j = $ser.DeserializeObject($raw)
    foreach ($k in @('checkNumber','check_id','checkId','CheckNumber','CheckID')) {
      $v = Get-Val $j $k
      if ($v) { return (As-Str $v) }
    }
    $gc = Get-Val $j 'GuestCheck'
    if ($gc) {
      $v = Get-Val $gc 'CheckNumber'
      if ($v) { return (As-Str $v) }
    }
    $gc2 = Get-Val $j 'guestCheck'
    if ($gc2) {
      $v = Get-Val $gc2 'checkNumber'
      if ($v) { return (As-Str $v) }
    }
  } catch {}
  $m = [regex]::Match($raw, '<(?:CheckNumber|CheckID|CheckId|checkRef|CheckNum|Check_ID|GuestCheckId|CheckSeq)[^>]*>([^<]+)', 'IgnoreCase')
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  $m2 = [regex]::Match($raw, '"(?:checkNumber|check_id|checkId|checkRef|CheckNumber|CheckID|guestCheckId)"\s*:\s*"?([^",}\s]+)', 'IgnoreCase')
  if ($m2.Success) { return $m2.Groups[1].Value.Trim() }
  return ''
}

function Result-Check([bool]$consumidorFinal, $cliente) {
  $r = New-Dict
  $r['consumidorFinal'] = $consumidorFinal
  $r['cliente'] = $cliente
  Write-Output -NoEnumerate $r
}

function Cliente-PorCheck($store, [string]$checkId) {
  $vinculo = $null
  foreach ($x in (As-List $store['factura_cliente'])) {
    if ((As-Str (Get-Val $x 'check_id')) -eq [string]$checkId) { $vinculo = $x; break }
  }
  if (-not $vinculo) {
    Result-Check $true $CONSUMIDOR_FINAL
    return
  }
  $uid = As-Str (Get-Val $vinculo 'usuario_id')
  $c = $null
  foreach ($x in (As-List $store['clientes'])) {
    if ((As-Str (Get-Val $x 'id')) -eq $uid) { $c = $x; break }
  }
  if (-not $c -or (As-Str (Get-Val $c 'estado')) -eq 'suspendido') {
    Result-Check $true $CONSUMIDOR_FINAL
    return
  }
  Result-Check $false (Map-Cliente $c)
}

function Upsert-Vinculo($store, $checkId, $usuarioId, $extra) {
  $id = As-Str $checkId
  if (-not $id) { return }
  if ($null -eq $store['factura_cliente']) {
    $store['factura_cliente'] = New-Object System.Collections.ArrayList
  }
  $row = New-Dict
  $row['check_id'] = $id
  $row['usuario_id'] = [int]$usuarioId
  $row['fecha_vinculacion'] = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  if ($extra -and (Get-Val $extra 'empleado_pos')) {
    $row['empleado_pos'] = As-Str (Get-Val $extra 'empleado_pos')
  }
  $list = $store['factura_cliente']
  $idx = -1
  for ($i = 0; $i -lt $list.Count; $i++) {
    if ((As-Str (Get-Val $list[$i] 'check_id')) -eq $id) { $idx = $i; break }
  }
  if ($idx -ge 0) {
    $prev = $list[$idx]
    foreach ($k in @($prev.Keys)) {
      if (-not $row.ContainsKey($k)) { $row[$k] = $prev[$k] }
    }
    $list[$idx] = $row
  } else {
    [void]$list.Add($row)
  }
}

function Add-IdUnico($ids, $v) {
  $s = As-Str $v
  if ($s -and -not $ids.Contains($s)) { [void]$ids.Add($s) }
}

function Ids-AVincular($inputObj) {
  $ids = New-Object System.Collections.ArrayList
  Add-IdUnico $ids (Get-Val $inputObj 'check_id')
  Add-IdUnico $ids (Get-Val $inputObj 'checkId')
  Add-IdUnico $ids (Get-Val $inputObj 'check_num')
  Add-IdUnico $ids (Get-Val $inputObj 'checkNum')
  Add-IdUnico $ids (Get-Val $inputObj 'guid')
  foreach ($x in (As-List (Get-Val $inputObj 'check_ids'))) { Add-IdUnico $ids $x }
  foreach ($x in (As-List (Get-Val $inputObj 'checkIds'))) { Add-IdUnico $ids $x }
  Write-Output -NoEnumerate $ids
}

$script:CorsHeaders = "Access-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET,POST,PUT,DELETE,PATCH,OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type`r`n"

function Send-Bytes($ctx, [int]$code, [string]$contentType, [byte[]]$bytes) {
  if ($ctx.Sent) { return }
  if ($null -eq $bytes) { $bytes = [byte[]]@() }
  try {
    [StationHttp]::WriteResponse($ctx.Client, $code, $contentType, $bytes, $script:CorsHeaders)
  } catch {}
  $ctx.Sent = $true
}

function Send-Text($ctx, [int]$code, [string]$contentType, [string]$text) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($(if ($null -eq $text) { '' } else { $text }))
  Send-Bytes $ctx $code $contentType $bytes
}

function Send-Json($ctx, [int]$code, $obj) {
  Send-Text $ctx $code 'application/json; charset=utf-8' ([StationJson]::ToJson($obj))
}

function Parse-Query([string]$query) {
  $nvc = New-Object System.Collections.Specialized.NameValueCollection
  if ([string]::IsNullOrEmpty($query)) { Write-Output -NoEnumerate $nvc; return }
  foreach ($pair in $query.Split('&')) {
    if ([string]::IsNullOrEmpty($pair)) { continue }
    $eq = $pair.IndexOf('=')
    if ($eq -lt 0) {
      $nvc.Add([uri]::UnescapeDataString($pair.Replace('+',' ')), '')
    } else {
      $k = [uri]::UnescapeDataString($pair.Substring(0, $eq).Replace('+',' '))
      $v = [uri]::UnescapeDataString($pair.Substring($eq + 1).Replace('+',' '))
      $nvc.Add($k, $v)
    }
  }
  Write-Output -NoEnumerate $nvc
}

function Parse-JsonBody([string]$body) {
  if ([string]::IsNullOrWhiteSpace($body)) { Write-Output -NoEnumerate (New-Dict); return }
  try {
    $obj = $ser.DeserializeObject($body)
    if ($null -eq $obj) { Write-Output -NoEnumerate (New-Dict); return }
    Write-Output -NoEnumerate $obj
  } catch {
    Write-Output -NoEnumerate (New-Dict)
  }
}

function Handle-Api($ctx, $qs, [string]$body) {
  $method = [string]$ctx.Request.HttpMethod
  if (-not $method) { $method = 'GET' }
  $method = $method.ToUpperInvariant()
  if ($null -eq $qs) { $qs = New-Object System.Collections.Specialized.NameValueCollection }
  $action = As-Str $qs['action']
  $inputObj = Parse-JsonBody $body

  if ($method -eq 'OPTIONS') {
    Send-Bytes $ctx 204 'text/plain' ([byte[]]@())
    return
  }

  $store = Load-Store

  if ($method -eq 'GET' -and $action -eq 'porCheck') {
    $checkId = As-Str $(if ($qs['check_id']) { $qs['check_id'] } else { $qs['checkId'] })
    if (-not $checkId) { Send-Json $ctx 400 @{ ok = $false; error = 'Falta check_id' }; return }
    $r = Cliente-PorCheck $store $checkId
    $out = New-Dict
    $out['ok'] = $true
    $out['check_id'] = $checkId
    $out['consumidorFinal'] = [bool](Get-Val $r 'consumidorFinal')
    $out['cliente'] = Get-Val $r 'cliente'
    Send-Json $ctx 200 $out
    return
  }

  if ($method -eq 'GET' -and $action -eq 'facturas') {
    $uid = As-Str $qs['usuario_id']
    $rows = New-Object System.Collections.ArrayList
    foreach ($x in (As-List $store['factura_cliente'])) {
      if ((As-Str (Get-Val $x 'usuario_id')) -eq $uid) { [void]$rows.Add($x) }
    }
    Send-Json $ctx 200 @{ ok = $true; data = $rows }
    return
  }

  if ($method -eq 'GET' -and ($action -eq 'list' -or $action -eq '')) {
    $estadoFiltro = As-Str $qs['estado']
    if (-not $estadoFiltro) { $estadoFiltro = 'todos' }
    $rows = New-Object System.Collections.ArrayList
    foreach ($c in (As-List $store['clientes'])) {
      $m = Map-Cliente $c
      $est = As-Str (Get-Val $m 'estado')
      if ($estadoFiltro -eq 'activo' -or $estadoFiltro -eq 'suspendido') {
        if ($est -ne $estadoFiltro) { continue }
      }
      [void]$rows.Add($m)
    }
    $arr = @($rows)
    for ($i = 0; $i -lt $arr.Count; $i++) {
      for ($j = $i + 1; $j -lt $arr.Count; $j++) {
        $ai = 0; $aj = 0
        [void][int]::TryParse((As-Str (Get-Val $arr[$i] 'id')), [ref]$ai)
        [void][int]::TryParse((As-Str (Get-Val $arr[$j] 'id')), [ref]$aj)
        if ($aj -gt $ai) {
          $tmp = $arr[$i]; $arr[$i] = $arr[$j]; $arr[$j] = $tmp
        }
      }
    }
    $rows = New-Object System.Collections.ArrayList
    foreach ($c in $arr) { [void]$rows.Add($c) }
    foreach ($c in $rows) {
      $fac = New-Object System.Collections.ArrayList
      $checkIds = New-Object System.Collections.ArrayList
      foreach ($x in (As-List $store['factura_cliente'])) {
        if ((As-Str (Get-Val $x 'usuario_id')) -eq (As-Str (Get-Val $c 'id'))) {
          [void]$fac.Add($x)
          [void]$checkIds.Add((Get-Val $x 'check_id'))
        }
      }
      $c['facturas'] = $fac
      $c['check_ids'] = $checkIds
      if ($fac.Count -gt 0) { $c['check_id'] = Get-Val $fac[0] 'check_id' }
    }
    Send-Json $ctx 200 @{ ok = $true; data = $rows }
    return
  }

  if ($method -eq 'POST' -and ($action -eq 'vincular' -or $action -eq 'factura')) {
    $usuarioId = Get-Val $inputObj 'usuario_id'
    if (-not $usuarioId) { $usuarioId = Get-Val $inputObj 'usuarioId' }
    if (-not $usuarioId) { $usuarioId = Get-Val $inputObj 'cliente_id' }
    $ids = Ids-AVincular $inputObj
    if ($ids.Count -eq 0 -or -not $usuarioId) {
      Send-Json $ctx 400 @{ ok = $false; error = 'Falta check_id y usuario_id' }
      return
    }
    $extra = New-Dict
    $emp = Get-Val $inputObj 'empleado_pos'
    if (-not $emp) { $emp = Get-Val $inputObj 'empleadoPos' }
    $extra['empleado_pos'] = As-Str $emp
    foreach ($id in $ids) { Upsert-Vinculo $store $id $usuarioId $extra }
    Save-Store $store
    Send-Json $ctx 200 @{ ok = $true; msg = 'Check vinculado al cliente'; check_ids = $ids }
    return
  }

  if ($method -eq 'POST') {
    $d = $inputObj
    $errN = Validar-Documento (As-Str (Get-Val $d 'tipoCliente' 'CC')) (Get-Val $d 'identificacion' '')
    if ($errN) { Send-Json $ctx 400 @{ ok = $false; error = $errN }; return }
    $emails = As-List (Get-Val $d 'emails')
    if (-not (Get-Val $d 'tipoCliente') -or -not (Get-Val $d 'nombre') -or -not (Get-Val $d 'apellido') -or $emails.Count -eq 0) {
      Send-Json $ctx 400 @{ ok = $false; error = 'Faltan campos obligatorios' }
      return
    }
    $tipo = As-Str (Get-Val $d 'tipoCliente')
    $identNorm = As-Str (Get-Val $d 'identificacion')
    $identNorm = $identNorm -replace '[\s.\-]', ''
    if ($tipo -eq 'PA' -or $tipo -eq 'Otro') { $identNorm = $identNorm.ToUpper() }
    foreach ($c in (As-List $store['clientes'])) {
      if ((As-Str (Get-Val $c 'identificacion')) -eq $identNorm) {
        Send-Json $ctx 409 @{ ok = $false; error = 'Ya existe esa identificación' }
        return
      }
    }
    $maxId = 0
    foreach ($c in (As-List $store['clientes'])) {
      $n = 0
      [void][int]::TryParse((As-Str (Get-Val $c 'id')), [ref]$n)
      if ($n -gt $maxId) { $maxId = $n }
    }
    $id = $store['nextId']
    if (-not $id) { $id = $maxId + 1 }
    $id = [int]$id
    $num = As-Str (Get-Val $d 'numCliente')
    if (-not $num) { $num = ((As-List $store['clientes']).Count + 1).ToString('0000') }
    $emailList = New-Object System.Collections.ArrayList
    foreach ($e in $emails) { [void]$emailList.Add([string]$e) }
    $nuevo = New-Dict
    $nuevo['id'] = $id
    $nuevo['numCliente'] = $num
    $nuevo['tipoCliente'] = $tipo
    $nuevo['identificacion'] = $identNorm
    $nuevo['nombre'] = As-Str (Get-Val $d 'nombre')
    $nuevo['apellido'] = As-Str (Get-Val $d 'apellido')
    $nuevo['direccion'] = As-Str (Get-Val $d 'direccion')
    $nuevo['telefono'] = As-Str (Get-Val $d 'telefono')
    $nuevo['pais'] = As-Str (Get-Val $d 'pais')
    $nuevo['fechaDesde'] = As-Str (Get-Val $d 'fechaDesde')
    $nuevo['fechaNacimiento'] = As-Str (Get-Val $d 'fechaNacimiento')
    $nuevo['emails'] = $emailList
    $nuevo['estado'] = 'activo'
    if ($null -eq $store['clientes']) { $store['clientes'] = New-Object System.Collections.ArrayList }
    [void]$store['clientes'].Add($nuevo)
    $store['nextId'] = $id + 1
    $checkIds = Ids-AVincular $d
    $extra = New-Dict
    $emp = Get-Val $d 'empleado_pos'
    if (-not $emp) { $emp = Get-Val $d 'empleadoPos' }
    $extra['empleado_pos'] = As-Str $emp
    foreach ($cid in $checkIds) { Upsert-Vinculo $store $cid $id $extra }
    Save-Store $store
    Send-Json $ctx 200 @{ ok = $true; id = $id; numCliente = $num }
    return
  }

  if ($method -eq 'PUT') {
    $id = As-Str $qs['id']
    if (-not $id) { $id = As-Str (Get-Val $inputObj 'id') }
    $d = $inputObj
    $idx = -1
    $list = $store['clientes']
    for ($i = 0; $i -lt $list.Count; $i++) {
      if ((As-Str (Get-Val $list[$i] 'id')) -eq $id) { $idx = $i; break }
    }
    if ($idx -lt 0) { Send-Json $ctx 404 @{ ok = $false; error = 'Cliente no encontrado' }; return }
    $tipo = As-Str (Get-Val $d 'tipoCliente')
    $identUpd = As-Str (Get-Val $d 'identificacion')
    $identUpd = $identUpd -replace '[\s.\-]', ''
    if ($tipo -eq 'PA' -or $tipo -eq 'Otro') { $identUpd = $identUpd.ToUpper() }
    $prev = $list[$idx]
    $emailList = New-Object System.Collections.ArrayList
    foreach ($e in (As-List (Get-Val $d 'emails'))) { [void]$emailList.Add([string]$e) }
    $upd = New-Dict
    foreach ($k in @($prev.Keys)) { $upd[$k] = $prev[$k] }
    $numKeep = Get-Val $d 'numCliente'
    if (-not $numKeep) { $numKeep = Get-Val $prev 'numCliente' }
    $upd['numCliente'] = As-Str $numKeep
    $upd['tipoCliente'] = $tipo
    $upd['identificacion'] = $identUpd
    $upd['nombre'] = As-Str (Get-Val $d 'nombre')
    $upd['apellido'] = As-Str (Get-Val $d 'apellido')
    $upd['direccion'] = As-Str (Get-Val $d 'direccion')
    $upd['telefono'] = As-Str (Get-Val $d 'telefono')
    $upd['pais'] = As-Str (Get-Val $d 'pais')
    $upd['fechaDesde'] = As-Str (Get-Val $d 'fechaDesde')
    $upd['fechaNacimiento'] = As-Str (Get-Val $d 'fechaNacimiento')
    $upd['emails'] = $emailList
    $est = As-Str (Get-Val $d 'estado')
    if (-not $est) { $est = 'activo' }
    $upd['estado'] = $est
    $list[$idx] = $upd
    Save-Store $store
    Send-Json $ctx 200 @{ ok = $true }
    return
  }

  if ($method -eq 'DELETE') {
    $id = As-Str $qs['id']
    $nuevos = New-Object System.Collections.ArrayList
    foreach ($c in (As-List $store['clientes'])) {
      if ((As-Str (Get-Val $c 'id')) -ne $id) { [void]$nuevos.Add($c) }
    }
    $store['clientes'] = $nuevos
    $vinc = New-Object System.Collections.ArrayList
    foreach ($x in (As-List $store['factura_cliente'])) {
      if ((As-Str (Get-Val $x 'usuario_id')) -ne $id) { [void]$vinc.Add($x) }
    }
    $store['factura_cliente'] = $vinc
    $i = 1
    foreach ($c in $store['clientes']) {
      $c['numCliente'] = $i.ToString('0000')
      $i++
    }
    Save-Store $store
    Send-Json $ctx 200 @{ ok = $true }
    return
  }

  if ($method -eq 'PATCH') {
    $id = As-Str $qs['id']
    foreach ($c in (As-List $store['clientes'])) {
      if ((As-Str (Get-Val $c 'id')) -eq $id) { $c['estado'] = 'activo'; break }
    }
    Save-Store $store
    Send-Json $ctx 200 @{ ok = $true }
    return
  }

  Send-Json $ctx 400 @{ ok = $false; error = 'Acción no válida' }
}

function Handle-Harmony($ctx, [string]$body) {
  Ensure-Data
  $stamp = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH-mm-ss-fffZ')
  $dump = Join-Path $HARMONY_DIR ($stamp + '.txt')
  [System.IO.File]::WriteAllText($dump, $(if ($null -eq $body) { '' } else { $body }), [System.Text.UTF8Encoding]::new($false))
  $checkId = Extraer-CheckId $body
  $store = Load-Store
  $r = if ($checkId) { Cliente-PorCheck $store $checkId } else { Result-Check $true $CONSUMIDOR_FINAL }
  $cli = Get-Val $r 'cliente'
  $esFinal = [bool](Get-Val $r 'consumidorFinal')
  $nombre = (As-Str (Get-Val $cli 'nombre')) + ' ' + (As-Str (Get-Val $cli 'apellido'))
  $msg = if ($esFinal) { 'Consumidor final' } else { 'Cliente vinculado' }
  $cf = if ($esFinal) { 'true' } else { 'false' }
  $xml = @"
<?xml version="1.0" encoding="utf-8"?>
<FiscalResponse>
  <Status>Approved</Status>
  <Message>$msg</Message>
  <CheckId>$(Xml-Esc $checkId)</CheckId>
  <ConsumerFinal>$cf</ConsumerFinal>
  <TipoId>$(Xml-Esc (As-Str (Get-Val $cli 'tipoCliente')))</TipoId>
  <Identificacion>$(Xml-Esc (As-Str (Get-Val $cli 'identificacion')))</Identificacion>
  <Nombre>$(Xml-Esc $nombre)</Nombre>
  <CUFE></CUFE>
</FiscalResponse>
"@
  $ct = As-Str $ctx.ContentType
  $acc = As-Str $ctx.Accept
  $wantsJson = ($ct -match 'json') -or (($acc -match 'json') -and ($acc -notmatch 'xml') -and ($ct -notmatch 'xml'))
  if (-not $wantsJson) {
    Send-Text $ctx 200 'application/xml; charset=utf-8' $xml.Trim()
    return
  }
  Send-Json $ctx 200 @{
    ok               = $true
    status           = 'Approved'
    check_id         = $checkId
    consumidorFinal  = $esFinal
    cliente          = $cli
    cufe             = $null
  }
}

function Handle-Static($ctx, [string]$pathname) {
  $rel = $pathname
  if ($rel -eq '/' -or $rel -eq '') { $rel = 'index.html' }
  $rel = $rel.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
  $filePath = [IO.Path]::GetFullPath((Join-Path $ROOT $rel))
  $rootAbs = [IO.Path]::GetFullPath($ROOT)
  if ($filePath -ne $rootAbs -and -not $filePath.StartsWith($rootAbs + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    Send-Text $ctx 403 'text/plain' 'Forbidden'
    return
  }
  if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
    Send-Text $ctx 404 'text/plain' 'Not found'
    return
  }
  $ext = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
  $ct = $mime[$ext]
  if (-not $ct) { $ct = 'application/octet-stream' }
  $bytes = [IO.File]::ReadAllBytes($filePath)
  Send-Bytes $ctx 200 $ct $bytes
}

Ensure-Data
try {
  $listener = New-Object StationHttp $PORT
} catch {
  Write-Host ('No se pudo iniciar el servidor en el puerto 8000: ' + $_.Exception.Message)
  Write-Host 'Cierra el otro programa que use ese puerto.'
  Write-Log ('start fail ' + $_.Exception.Message)
  pause
  exit 1
}

Write-Host "Estación Simphony lista → http://127.0.0.1:${PORT}/index.html?pos=1"
Write-Host "Harmony POST → http://127.0.0.1:${PORT}/fiscal/harmony"
Write-Host 'No hace falta Node.js. Cierra esta ventana para detener el servidor.'
Write-Log 'started'

while ($true) {
  $ctx = $null
  $client = $null
  try {
    $client = $listener.Accept()
    $msg = [StationHttp]::ReadRequest($client)
    $method = $msg.Method
    $ctx = @{
      Client      = $client
      Request     = @{ HttpMethod = $method }
      Method      = $method
      ContentType = $msg.ContentType
      Accept      = $msg.Accept
      Sent        = $false
    }
    $pathname = $msg.Path
    $body = $msg.Body
    $qs = Parse-Query $msg.Query
    if ($pathname -and $pathname.Contains('?')) {
      $qi = $pathname.IndexOf('?')
      if ([string]::IsNullOrEmpty($msg.Query)) { $qs = Parse-Query $pathname.Substring($qi + 1) }
      $pathname = $pathname.Substring(0, $qi)
    }

    if ($method -eq 'OPTIONS') {
      Send-Bytes $ctx 204 'text/plain' ([byte[]]@())
      continue
    }

    if ($pathname -eq '/fiscal/harmony' -or $pathname -eq '/fiscal/harmony/') {
      Handle-Harmony $ctx $body
      continue
    }

    if ($pathname.StartsWith('/api') -or $pathname -eq '/api.php') {
      Handle-Api $ctx $qs $body
      continue
    }

    Handle-Static $ctx $pathname
  } catch {
    Write-Log ('req error ' + $_.Exception.Message + ' @ ' + $_.InvocationInfo.PositionMessage)
    if ($ctx) {
      try { Send-Text $ctx 500 'text/plain' 'Error interno' } catch {}
    } elseif ($client) {
      try { $client.Close() } catch {}
    }
  }
}
