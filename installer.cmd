@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Installation Ynov RH
echo ============================================
echo   Installation du projet Ynov RH (une fois)
echo ============================================
echo Le journal complet est ecrit dans installation.log
(
echo === INSTALLATION %date% %time% ===

echo --- Java 21 (necessaire a l'emulateur Firestore)
call :trouver_java
if not defined JAVA21 (
  winget install --id Microsoft.OpenJDK.21 -e --silent --accept-source-agreements --accept-package-agreements
  call :trouver_java
)
if defined JAVA21 (echo JAVA21=%JAVA21%) else (echo ERREUR: Java 21 introuvable)

echo --- Firebase CLI
call npm install -g firebase-tools
call firebase --version

echo --- Dependances frontend
call npm install
echo --- Dependances API
call npm --prefix functions install
echo --- Compilation API
call npm --prefix functions run build

echo --- Fichiers de configuration
if not exist .env.development.local (
  >.env.development.local echo NEXT_PUBLIC_FIREBASE_API_KEY=demo-cle-locale
  >>.env.development.local echo NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-ynov-rh.firebaseapp.com
  >>.env.development.local echo NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-ynov-rh
  >>.env.development.local echo NEXT_PUBLIC_FIREBASE_APP_ID=demo-app
  >>.env.development.local echo NEXT_PUBLIC_API_URL=http://127.0.0.1:5001/demo-ynov-rh/europe-west1/api
  >>.env.development.local echo NEXT_PUBLIC_UTILISER_EMULATEURS=true
)
if not exist .env.production.local (
  >.env.production.local echo NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCcoDomnUQxHKyD4IbFZ8j8Uo4miBOttO8
  >>.env.production.local echo NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ynov-rh-app.firebaseapp.com
  >>.env.production.local echo NEXT_PUBLIC_FIREBASE_PROJECT_ID=ynov-rh-app
  >>.env.production.local echo NEXT_PUBLIC_FIREBASE_APP_ID=1:303019933316:web:76cf7ff3b6b0c72e890cd1
  >>.env.production.local echo NEXT_PUBLIC_API_URL=/api
  >>.env.production.local echo NEXT_PUBLIC_UTILISER_EMULATEURS=false
)
dir /b .env*
echo === INSTALLATION TERMINEE ===
) > installation.log 2>&1
type installation.log
echo.
echo Installation terminee. Vous pouvez fermer cette fenetre.
timeout /t 15
exit /b 0

:trouver_java
set "JAVA21="
for /d %%D in ("%ProgramFiles%\Microsoft\jdk-21*") do set "JAVA21=%%D"
if not defined JAVA21 for /d %%D in ("%ProgramFiles%\Eclipse Adoptium\jdk-21*") do set "JAVA21=%%D"
if not defined JAVA21 for /d %%D in ("%ProgramFiles%\Java\jdk-21*") do set "JAVA21=%%D"
exit /b 0
