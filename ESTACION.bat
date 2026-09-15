@echo off
setlocal
set ROOT=%~dp0
if "%ROOT:~-1%"=="\" set ROOT=%ROOT:~0,-1%
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
echo Estacion abierta en %URL%
echo Harmony POST: http://127.0.0.1:8000/fiscal/harmony
