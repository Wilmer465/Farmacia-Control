@echo off
setlocal
cd /d "C:\Users\USER-D\OneDrive\Desktop\farmacia-control-completo\farmacia-control"

set "PNPM=pnpm"
where pnpm >nul 2>nul
if errorlevel 1 (
    where corepack >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] No se encontro pnpm ni Corepack.
        echo Instale Node.js y active pnpm 11.25.0 con: corepack prepare pnpm@11.25.0 --activate
        pause
        exit /b 1
    )
    set "PNPM=corepack pnpm"
)

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
call %PNPM% run dev
if errorlevel 1 (
    echo.
    echo [ERROR] No se pudo iniciar o la aplicacion termino con un error.
    pause
    goto MENU
)
echo.
echo === La aplicacion se cerro. ===
echo.
pause
goto MENU

:BUILD
cls
echo.
echo === Farmacia Control - Generando instaladores ===
echo.
echo Recompilando modulo nativo (better-sqlite3) para Electron...
call %PNPM% run rebuild:electron
if errorlevel 1 (
    echo.
    echo [ERROR] No se pudo recompilar better-sqlite3 para Electron.
    pause
    goto MENU
)
echo.
echo Compilando frontend y empaquetando (Setup NSIS + Portable)...
set WIN_CODESIGN_DISABLE=true
call %PNPM% run build
if errorlevel 1 (
    echo.
    echo [ERROR] La compilacion fallo. Revise el mensaje anterior para ver la causa.
    pause
    goto MENU
)
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
