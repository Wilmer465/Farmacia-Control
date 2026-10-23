# Plan: login en navegador (Vite) para farmacia-control

## Objetivo
Permitir iniciar sesión abriendo la app en el navegador mediante el servidor de desarrollo de Vite (`npm run dev:react`, `http://localhost:5173`), sin romper la app de Electron de producción.

## Problema (diagnóstico)
`src/hooks/useAuth.js:11` llama `window.api.auth.login(...)`. `window.api` es inyectado por el preload de Electron (`electron/preload.js:5` mediante `contextBridge.exposeInMainWorld('api', ...)`), que **solo existe en el renderer de Electron**. En el navegador (Vite dev server) `window.api` es `undefined`, por lo que `window.api.auth` lanza:

```
TypeError: Cannot read properties of undefined (reading 'auth')
```

La app es Electron de escritorio; el navegador no es un objetivo nativo porque todos los servicios atraviesan `window.api` → IPC → backend SQLite.

## Solución (dev-only, sin afectar producción)
Agregar un **shim/mock de `window.api` que solo se active en desarrollo** cuando `window.api` no exista:

1. **Nuevo archivo `src/shimWindowApi.js`**
   - Se importa en `src/main.jsx` antes de renderizar `<App />`.
   - Solo instala `window.api` si `typeof window.api === 'undefined'` **y** `import.meta.env.DEV` es `true`.
   - `window.api.auth.login({ username, password })` devuelve promesa con `{ ok: true, data: { id, username, rol_nombre, session_token } }` para credenciales de demo válidas, o `{ ok: false, error: 'Usuario o contraseña incorrectos' }` para inválidas.
   - `window.api.auth.logout(usuario)` es un noop resuelto.
   - Los demás namespaces (`medicamentos`, `ordenes`, `lotes`, `despachos`, `entregas`, `receptores`, `solicitudesEliminacion`, `solicitudesIntercambio`, `auditoria`, `reportes`, `backups`, `cloudSync`, `usuarios`, `catalogoCum`, `recepcion`, `firmaPad`) devuelven `{ ok: false }` o listas vacías para fallar con gracia fuera de Electron.
   - Todas las funciones son async (devuelven promesas), cumpliendo la regla de AGENTS.md de que servicios async esperan `await` en el llamador.

2. **`src/main.jsx`**: importar el shim al inicio del punto de entrada.

## ¿Por qué es seguro para producción?
- En el build de Vite, `import.meta.env.DEV` se reemplaza por `false`, así que el shim **no se instala** en producción.
- En Electron de producción, el preload ya expone el `window.api` real, por lo que la condición `typeof window.api === 'undefined'` es falsa y el shim no actúa.
- No hay cambios de esquema, migraciones ni escrituras en `data/farmacia.db`.

## Validación
1. Ejecutar `npm run dev:react`, abrir `http://localhost:5173`.
2. Iniciar sesión con credenciales de demo → debe renderizar `AppShell` (usuario autenticado).
3. Credenciales erróneas → debe mostrarse el mensaje de error.
4. `npm run lint` → 0 errores (salvo warnings preexistentes).
5. Confirmar que `npm run build:react` no deja el shim activo (`import.meta.env.DEV` = false).

## Pendiente de confirmar con el usuario
- ¿Acepta el enfoque de shim de desarrollo (recomendado) o prefiere solo usar Electron (`npm run dev`)?
- Credenciales de demo que debe aceptar `auth.login` (p. ej. `wilmer` / `Wilmer465*` como en `tests/unit/auth.test.js`, o `admin` / `admin`).
