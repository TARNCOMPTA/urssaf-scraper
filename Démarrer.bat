@echo off
title URSSAF - Demarrage
cd /d "%~dp0"

rem --- Verifier que Node.js est installe ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js n'est pas installe ou pas dans le PATH.
  echo Telechargez-le sur https://nodejs.org ^(version 22 ou superieure^), installez-le,
  echo puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)

rem --- Verifier la version de Node (>= 22 requise pour node:sqlite) ---
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODE_MAJOR=%%v"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if %NODE_MAJOR% LSS 22 (
  echo [ERREUR] Node.js version %NODE_MAJOR% detectee, mais la version 22 ou superieure est requise.
  echo Mettez Node.js a jour depuis https://nodejs.org puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)

rem --- Premier lancement : installer les composants (visible, car long) ---
if not exist "node_modules" (
  echo Premiere utilisation detectee.
  echo Installation des composants en cours ^(cela peut prendre quelques minutes^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERREUR] L'installation a echoue. Verifiez votre connexion internet, puis relancez.
    echo.
    pause
    exit /b 1
  )
)

rem --- Mise a jour auto + serveur + navigateur, le tout SANS aucune fenetre ---
start "" wscript.exe "%~dp0_serveur-cache.vbs"

rem Cette fenetre se ferme aussitot. L'application tourne en arriere-plan.
exit
