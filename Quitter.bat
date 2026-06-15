@echo off
title URSSAF - Arret
cd /d "%~dp0"
echo Arret du serveur URSSAF...

rem Termine le processus Node qui ecoute sur le port 3000.
set "TROUVE="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  taskkill /F /PID %%a >nul 2>nul
  set "TROUVE=1"
)

if defined TROUVE (echo Serveur arrete.) else (echo Aucun serveur en cours sur le port 3000.)
timeout /t 2 >nul
