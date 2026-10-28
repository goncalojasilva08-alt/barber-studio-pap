@echo off
title Barber Studio - Servidor Local
echo ===================================================
echo   Barber Studio - A Iniciar Servidor Local
echo ===================================================
echo.
echo O teu site esta a abrir em: http://localhost:3000
echo Para desligar o servidor, fecha esta janela ou pressiona Ctrl + C.
echo.
set "SITE_ROOT=%~dp0.."
cd /d "%SITE_ROOT%"
start http://localhost:3000
python -m http.server 3000
pause
