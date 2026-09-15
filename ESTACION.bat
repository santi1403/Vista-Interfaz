@echo off
setlocal
set ROOT=%~dp0
if "%ROOT:~-1%"=="\" set ROOT=%ROOT:~0,-1%
<<<<<<< HEAD
cd /d "%ROOT%"
set URL=http://127.0.0.1:8000/index.html?pos=1

powershell -NoProfile -Command "try{ $c=New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1',8000); $c.Close(); exit 0 }catch{ exit 1 }" >nul 2>nul
if %errorlevel%==0 (
  echo Servidor ya activo en el puerto 8000
) else (
  echo Iniciando estacion Simphony en esta PC...
  start "EstacionSimphony" /min cmd /c "cd /d "%ROOT%" && powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\server.ps1""
  timeout /t 2 >nul
)
=======
set URL=http://192.168.10.111:8000/index.html
REM Verifica por TCP puerto 8000 (no por ping que bloquea firewall)
powershell -NoProfile -Command "try{ $c=New-Object System.Net.Sockets.TcpClient; $c.Connect('192.168.10.111',8000); $c.Close(); exit 0 }catch{ exit 1 }" >nul 2>nul
if %errorlevel%==0 goto :start
echo Estacion central no responde en 192.168.10.111 - iniciando servidor SQL local en esta PC...
start "ServidorSQL" /min cmd /c "node \"%ROOT%\server-sql.js\""
timeout /t 3 >nul
set URL=http://localhost:8000/index.html
:start
>>>>>>> 29d9e492743a1b014ba48207dfe3aafbb0225d90

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="%URL%" --window-size=1366,800
  goto :end
)
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --app="%URL%" --window-size=1366,800
  goto :end
)
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app="%URL%" --window-size=1366,800
  goto :end
)
if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
  start "" "C:\Program Files\Microsoft\Edge\Application\msedge.exe" --app="%URL%" --window-size=1366,800
  goto :end
)
start "" "%URL%"
:end
<<<<<<< HEAD
echo Estacion abierta en %URL%
echo Harmony POST: http://127.0.0.1:8000/fiscal/harmony
=======
echo Estacion abierta en %URL% - crea/actualiza/elimina y queda guardado en SQL Server
>>>>>>> 29d9e492743a1b014ba48207dfe3aafbb0225d90
