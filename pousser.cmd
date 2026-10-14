@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Envoi du commit et du tag v1.0.0 vers GitHub (origin)...
call git push origin main
call git push origin v1.0.0
echo.
echo Termine.
pause
