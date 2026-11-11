@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "ROOT=%CD%"
echo [INFO] Directorio de trabajo: %ROOT%

if not exist "build-logs" mkdir "build-logs"
set "LOG=%ROOT%\build-logs\build-%DATE:~-4%%DATE:~3,2%%DATE:~0,2%-%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%.log"
set "LOG=%LOG: =0%"

echo [INFO] Log guardado en: %LOG%
echo. > "%LOG%"

call :LOG "=== INICIO GENERACION SETUP FARMACIA CONTROL ==="
call :LOG "Fecha: %DATE% %TIME%"
call :LOG "Usuario: %USERNAME%"
call :LOG "Equipo: %COMPUTERNAME%"

REM Intentar usar corepack pnpm primero
set "PNPM_CMD=corepack pnpm"
call :LOG "[INFO] Intentando usar: corepack pnpm"
corepack pnpm --version >> "%LOG%" 2>&1
if %ERRORLEVEL% NEQ 0 (
  set "PNPM_CMD=pnpm"
  where pnpm >nul 2>&1
  if %ERRORLEVEL% NEQ 0 (
    call :ERR "[ERROR] No se encontro pnpm ni corepack pnpm."
    call :ERR "Verifique: corepack enable && corepack prepare pnpm@11.25.0 --activate"
    pause
    exit /b 1
  )
  call :LOG "[INFO] Usando: pnpm"
) else (
  call :LOG "[INFO] corepack pnpm disponible"
)

node --version >> "%LOG%" 2>&1
if %ERRORLEVEL% NEQ 0 (
  call :ERR "[ERROR] Node.js no encontrado"
  pause
  exit /b 1
)
call :LOG "[INFO] Node: OK"

call :LOG "[PASO 1/3] rebuild:electron"
call :RUN "%PNPM_CMD%" run rebuild:electron
if %ERRORLEVEL% NEQ 0 (
  call :ERR "[ERROR] rebuild:electron fallo. Codigo: %ERRORLEVEL%"
  pause
  exit /b %ERRORLEVEL%
)
call :LOG "[OK] rebuild:electron"

call :LOG "[PASO 2/3] build (vite + electron-builder)"
set "WIN_CODESIGN_DISABLE=true"
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
set "ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES=true"
call :RUN "%PNPM_CMD%" run build
if %ERRORLEVEL% NEQ 0 (
  call :ERR "[ERROR] build fallo. Codigo: %ERRORLEVEL%"
  call :ERR "Log: %LOG%"
  pause
  exit /b %ERRORLEVEL%
)
call :LOG "[OK] build"

call :LOG "[PASO 3/3] Verificando artefactos"
if exist "dist\Farmacia Control-1.0.0-setup.exe" (
  call :LOG "[OK] dist\Farmacia Control-1.0.0-setup.exe"
) else (
  call :ERR "[FALTA] dist\Farmacia Control-1.0.0-setup.exe"
)
if exist "dist\Farmacia Control-1.0.0-portable.exe" (
  call :LOG "[OK] dist\Farmacia Control-1.0.0-portable.exe"
) else (
  call :ERR "[FALTA] dist\Farmacia Control-1.0.0-portable.exe"
)

call :LOG "=== FIN ==="
echo [INFO] Log: %LOG%
pause
exit /b 0

:LOG
echo [%TIME%] %~1
echo [%TIME%] %~1 >> "%LOG%"
exit /b 0

:ERR
echo [%TIME%] [ERR] %~1
echo [%TIME%] [ERR] %~1 >> "%LOG%"
exit /b 0

:RUN
echo [%TIME%] EJECUTANDO: %*
echo [%TIME%] EJECUTANDO: %* >> "%LOG%"
%*
set "RC=%ERRORLEVEL%"
echo [%TIME%] CODIGO_SALIDA: %RC%
echo [%TIME%] CODIGO_SALIDA: %RC% >> "%LOG%"
exit /b %RC%
