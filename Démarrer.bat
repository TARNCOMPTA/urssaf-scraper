@echo off
title URSSAF - Appels de cotisations
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

echo Demarrage du serveur URSSAF...
echo Laissez cette fenetre ouverte. Pour arreter : fermez-la.
echo Adresse : http://localhost:3000
echo.

rem Ouvre le navigateur apres quelques secondes
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"

node --disable-warning=ExperimentalWarning server.js
pause
