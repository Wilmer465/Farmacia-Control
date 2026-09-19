@echo off
setlocal
cd /d "C:\Users\USER-D\OneDrive\Desktop\farmacia-control-completo\farmacia-control"

:MENU
cls
echo.
echo  ==========================================================
echo    FARMACIA CONTROL - Lanzador
echo  ==========================================================
echo.
echo    [1] Iniciar aplicacion (modo desarrollo: Vite + Electron)
echo    [2] Generar instaladores (Setup NSIS + Portable)
echo    [3] Abrir carpeta de instaladores (dist)
echo    [4] Salir
echo.
set "OPCION="
set /p "OPCION=Seleccione una opcion y presione Enter: "

if "%OPCION%"=="1" goto DEV
if "%OPCION%"=="2" goto BUILD
if "%OPCION%"=="3" goto DIST
if "%OPCION%"=="4" goto FIN
echo.
echo  Opcion no valida.
timeout /t 2 >nul
goto MENU

:DEV
cls
echo.
echo === Farmacia Control - Iniciando en modo desarrollo ===
echo.
echo Iniciando Vite + Electron...
echo Cierre la ventana de la aplicacion para detener todo.
echo.
call npm run dev
echo.
echo === La aplicacion se cerro. ===
echo.
echo Reconstruyendo modulo nativo para Node.js del sistema...
call npm run rebuild:node 2>nul
pause
goto MENU

:BUILD
cls
echo.
echo === Farmacia Control - Generando instaladores ===
echo.
echo Recompilando modulo nativo (better-sqlite3) para Electron...
call npm run rebuild:electron
if errorlevel 1 (
    echo.
    echo [ERROR] No se pudo recompilar better-sqlite3 para Electron.
    pause
    goto MENU
)
echo.
echo Compilando frontend y empaquetando (Setup NSIS + Portable)...
set WIN_CODESIGN_DISABLE=true
call npm run build
echo.
echo === Instaladores generados en la carpeta dist ===
pause
goto MENU

:DIST
cls
echo.
if exist "dist\Farmacia Control-1.0.0-setup.exe" (
    echo  Setup :        dist\Farmacia Control-1.0.0-setup.exe
)
if exist "dist\Farmacia Control-1.0.0-portable.exe" (
    echo  Portable:      dist\Farmacia Control-1.0.0-portable.exe
)
echo.
start "" "dist"
pause
goto MENU

:FIN
endlocal
exit /b 0