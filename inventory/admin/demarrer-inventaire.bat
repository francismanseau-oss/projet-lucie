@echo off
chcp 65001 >nul
cd /d "%~dp0..\.."

if not exist "inventory\admin\data\lucie-account.json" (
  echo.
  echo  Compte Lucie pas encore configure.
  echo  Francis doit d'abord lancer :
  echo.
  echo    node inventory\admin\scripts\configurer-mot-de-passe-temporaire.mjs
  echo.
  pause
  exit /b 1
)

set INVENTORY_ADMIN_DATA=provisional
set INVENTORY_ADMIN_HOST=127.0.0.1
set INVENTORY_ADMIN_PORT=8791

echo.
echo  Inventaire Lucie — local seulement
echo  Ouvrir : http://127.0.0.1:8791/
echo  Stripe : TEST uniquement — aucun paiement reel
echo  Quitter : Ctrl+C
echo.

node inventory\admin\server.mjs
if errorlevel 1 pause
