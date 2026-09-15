$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$refs = Join-Path $here 'refs'

$candidatos = @(
  'C:\Micros\Simphony2\WebServer\wwwroot\EGateway\Handlers',
  'C:\MICROS\Simphony2\WebServer\wwwroot\EGateway\Handlers',
  'C:\Micros\Simphony\WebServer\wwwroot\EGateway\Handlers',
  'C:\MICROS\Simphony\WebServer\wwwroot\EGateway\Handlers'
)

$handlers = $null
foreach ($p in $candidatos) {
  if (Test-Path (Join-Path $p 'PosCore.dll')) { $handlers = $p; break }
}

if ($handlers) {
  Write-Host "Copiando referencias desde $handlers"
  New-Item -ItemType Directory -Force -Path $refs | Out-Null
  Copy-Item (Join-Path $handlers 'Ops.dll') $refs -Force
  Copy-Item (Join-Path $handlers 'PosCore.dll') $refs -Force
  Copy-Item (Join-Path $handlers 'PosCommonClasses.dll') $refs -Force
}

foreach ($n in @('Ops.dll','PosCore.dll','PosCommonClasses.dll')) {
  if (-not (Test-Path (Join-Path $refs $n))) {
    Write-Host "Falta $refs\$n"
    Write-Host "Copia esas 3 DLL de la estacion (Handlers) a simphony\dll\refs y vuelve a ejecutar."
    exit 1
  }
}

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) {
  Write-Host "No se encontro dotnet SDK. Instala Visual Studio o el SDK de .NET y vuelve a intentar."
  exit 1
}

Set-Location $here
dotnet restore
dotnet build -c Release
$dll = Join-Path $here 'bin\Release\GestionClientes.dll'
if (Test-Path $dll) {
  Copy-Item (Join-Path $here 'url.txt') (Join-Path $here 'bin\Release\url.txt') -Force
  Write-Host "OK: $dll"
  Write-Host "Importa GestionClientes.dll en EMC (Extension Application, content DLL, Host Type OPS)."
}
