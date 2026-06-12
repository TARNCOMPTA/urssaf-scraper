@echo off
title URSSAF - Appels de cotisations
cd /d "%~dp0"

set "NODE=C:\Users\Dell\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"

echo Demarrage du serveur URSSAF...
echo Laissez cette fenetre ouverte. Pour arreter : fermez-la.
echo Adresse : http://localhost:3000
echo.

rem Ouvre le navigateur apres quelques secondes
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"

"%NODE%" --disable-warning=ExperimentalWarning server.js
pause
