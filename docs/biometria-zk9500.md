# Biometría ZK9500 — Constancia de captura

Lector ZKTeco ZK9500 por SDK directo (`libzkfp` x64). Alcance: constancia de
captura (dedo presente + plantilla válida en memoria). No se guardan ni
registran imágenes ni plantillas (Ley 1581 de 2012, dato sensible).

## 1. Piezas utilizadas

| Elemento | Detalle |
|---|---|
| DLL | `C:\Windows\System32\libzkfp.dll` (277.504 B, x64, instalada con el driver) |
| Versión x86 | `C:\Windows\SysWOW64\libzkfp.dll` (no usada: Electron es x64) |
| Mecanismo de carga | P/Invoke directo (`DllImport`, Winapi) con ruta absoluta instalada |
| Firmas | Extraídas del wrapper oficial `libzkfpcsharp.dll` (sin referenciarlo ni copiarlo) |
| Helper | `native/zk-bridge/zk-bridge.cs` → `native/zk-bridge/bin/zk-bridge.exe` (x64) |
| Compilador | `csc.exe` de .NET Framework 64 bits (`npm run compilar:zk-bridge`, también en `prebuild`). Sin descargas ni NuGet |
| Prohibido y no usado | `zkfinger10-32.dll`, `biokey.ocx`, ActiveX, bridge x86, DLL de terceros, copias de DLL |

## 2. Arquitectura (igual que STU-540, sin duplicar)

```
Renderer --IPC(entregas:capturarHuella)--> Main
  --> backend/services/biometricService.capturarHuella()
  --> signatureService.ejecutarHelper (spawn + timeout + JSON reutilizado)
  --> native/zk-bridge/bin/zk-bridge.exe --USB--> ZK9500
```

Sin canales IPC nuevos, sin cambios de preload, UI ni esquema (la huella
sigue siendo flag `huella_registrada` + auditoría `REGISTRAR_HUELLA`).
`biometricService` mantiene la forma `{ capturada, dispositivo:'ZK9500', ... }`
que ya entiende `DocumentacionReceptor`.

## 3. Protocolo del helper (una línea JSON por stdout)

- `detectar` → `{ ok, lectores, tamImagen, resolucion }`. Init, cuenta,
  abre el 0, lee parámetro 106 (buffer de imagen) y captura ancho/alto/dpi,
  cierra todo.
- `capturar [--timeout S]` (defecto 30) → `{ ok, dispositivo, tamanoPlantilla,
  duracionSeg }`. Reintenta ante `-8` (sin dedo) con pausas de 150 ms hasta el
  plazo; nunca bucle infinito. La imagen se descarta tras extraer la plantilla;
  la plantilla nunca sale del proceso.
- `diagnostico [--timeout S]` → dos capturas + `ZKFPM_MatchFinger` 1:1;
  reporta `tamanoPlantilla1/2`, `score` y `parametrosDb` crudos (códigos 1–5).
  Sin contenido de plantillas.

## 4. Umbral (sin inventar)

No hay umbral fijo en el código (el 504 observado fue un score, no una regla).
Estrategia: el helper expone `score` y los parámetros DB crudos del SDK; la
app (alcance constancia) **no decide match**. Si a futuro se requiere
verificación 1:1 con decisión, el umbral saldrá de `DBGetParameter`/`DBSetParameter`
documentado contra el SDK, no de este documento.

## 5. Errores

| Código | Causa | Acción |
|---|---|---|
| `SIN_LECTOR` | Sin lectores USB | Conectar el ZK9500 |
| `APERTURA_FALLIDA` | Ocupado por otra app | Cerrar la otra app |
| `TIMEOUT_DEDO` | Sin dedo en el plazo | Reintentar (30 s) |
| `LECTOR_OCUPADO` | Captura concurrente | Esperar |
| `HELPER_NO_ENCONTRADO` | Sin compilar | `npm run compilar:zk-bridge` |
| `TIMEOUT_LOCAL` / `RESPUESTA_INVALIDA` | Puente colgado/respuesta rota | Reintentar, revisar stderr |

## 6. Instalación / desinstalación / empaquetado

- Requisito: driver ZK9500 + `libzkfp.dll` x64 en `System32` (ya instalados).
- Compilar: `npm run compilar:zk-bridge` (salida ignorada por git).
- Empaquetado: `extraResources` lleva `native/zk-bridge/bin`; el servicio
  resuelve `resourcesPath` cuando `app.isPackaged`.
- Desinstalar: borrar `native/zk-bridge/`, revertir `extraResources`/`prebuild`
  y `biometricService` al stub. El driver no se toca.

## 7. Pruebas

- `tests/hardware/zk_bridge.test.js` (6/6, helpers `.cmd` simulados).
- Manual: `node scripts/diagnosticar-zk9500.js [--timeout 30]` (mismo dedo
  dos veces). Demuestra SDK, detección, apertura, captura, tamaños, score y
  cierre. Pruebas reales registradas abajo en §8.

## 8. Pruebas reales (ZK9500 físico)

- `detectar`: `{"lectores":1,"tamImagen":112500,"resolucion":"300x375"}`.
- `diagnostico --timeout 8` sin dedo: `TIMEOUT_DEDO` (prueba reintentos
  ante `-8`, plazo acotado y cierre limpio).
- Cadena exacta de la app (`entregaController.capturarHuella` bajo Electron,
  sin dedo, 30 s): handler recibido → helper con 8 líneas stdout → **JSON
  detectado: sí** (parser robusto verificado con chatter real) →
  `TIMEOUT_DEDO` → cierre correcto en 30.2 s.
- (Anotar aquí resultado de `diagnostico` con dedo: tamaños, score,
  parámetros DB.)
