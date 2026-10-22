
@echo off
title VITASCAN Health Kiosk

cd /d "D:\SHS Projects\VITASCAN\Health Kiosk\Code\Kiosk_System"

echo Building VITASCAN Health Kiosk...
call npm run build

if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)

echo Starting server...
start "VITASCAN Server" /min cmd /c "cd /d ""D:\SHS Projects\VITASCAN\Health Kiosk\Code\Kiosk_System"" && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort"

echo Waiting for server...

:WAIT_SERVER
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:4173' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"

if errorlevel 1 goto WAIT_SERVER

echo Opening browser automatically...
start "" "http://127.0.0.1:4173"

exit
