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

rem --- Premier lancement : installer les composants (dependances + navigateur) ---
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
  echo.
  echo Installation terminee.
  echo.
)

rem --- Mise a jour automatique depuis GitHub (avant de demarrer le serveur) ---
echo Verification des mises a jour...
node maj.js

rem --- Demarrage du serveur SANS fenetre visible ---
echo.
echo Lancement de l'application ^(le serveur tourne en arriere-plan, sans fenetre^).
echo Le navigateur va s'ouvrir sur http://localhost:3000
echo Pour arreter : bouton "Quitter" dans la page, ou double-clic sur Quitter.bat
start "" wscript.exe "%~dp0_serveur-cache.vbs"

rem Cette fenetre se ferme : l'application reste active en arriere-plan.
timeout /t 3 >nul
exit
