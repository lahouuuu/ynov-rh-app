@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Ynov RH - demarrage
rem --- Java 21 pour l'emulateur Firestore
set "JAVA21="
for /d %%D in ("%ProgramFiles%\Microsoft\jdk-21*") do set "JAVA21=%%D"
if not defined JAVA21 for /d %%D in ("%ProgramFiles%\Eclipse Adoptium\jdk-21*") do set "JAVA21=%%D"
if not defined JAVA21 for /d %%D in ("%ProgramFiles%\Java\jdk-21*") do set "JAVA21=%%D"
if defined JAVA21 (set "JAVA_HOME=%JAVA21%" & set "PATH=%JAVA21%\bin;%PATH%") else (echo ATTENTION: Java 21 introuvable, lancez installer.cmd)
set "PATH=%APPDATA%\npm;%PATH%"

echo [0/4] Mise a jour des dependances...
call npm install --no-audit --no-fund >nul 2>&1
call npm --prefix functions install --no-audit --no-fund >nul 2>&1
echo [1/4] Demarrage des emulateurs Firebase (nouvelle fenetre)...
start "Ynov RH - Emulateurs" cmd /k "npm run emulateurs"

echo [2/4] Attente des emulateurs (Firestore + Functions)...
:attente
timeout /t 3 >nul
curl -s -o nul http://127.0.0.1:8080 || goto attente
curl -s -o nul http://127.0.0.1:5001/demo-ynov-rh/europe-west1/api/sante || goto attente
echo Emulateurs prets.

echo [3/4] Donnees fictives...
call npm --prefix functions run seed > seed.log 2>&1
type seed.log

echo [4/4] Frontend (nouvelle fenetre)...
start "Ynov RH - Frontend" cmd /k "npm run dev"
timeout /t 12 >nul
set "OPERA=%LOCALAPPDATA%\Programs\Opera GX\opera.exe"
if exist "%OPERA%" (start "" "%OPERA%" http://localhost:3000) else (start http://localhost:3000)
echo.
echo Application : http://localhost:3000   (mot de passe des comptes : Demo-Ynov-2026!)
echo Console des emulateurs : http://127.0.0.1:4000
echo Pour tout arreter : fermer les fenetres "Emulateurs" et "Frontend".
timeout /t 20
