# Plan: Mobile Auth via Central HTTP API

## Goal
Fix mobile app login by exposing a central HTTP `/api/v1/auth/*` API that the Expo/React Native app can call from Android, iOS, Expo Go, and Web. The Electron desktop app keeps its IPC-based auth unchanged.

## Decisions (Locked)
| Area | Decision |
|------|----------|
| Auth transport | Independent HTTP service (not Electron IPC) |
| API deployment | Standalone HTTP service (Express/Fastify) reachable by all platforms |
| Token format | Unified opaque token: backend `session_token` returned as `access_token` + `refresh_token` (same value), `expires_in: 43200` (12h) |
| Password hash | Mobile adopts bcryptjs (cost 12) via `expo-crypto` + `bcryptjs` |
| Mobile user seed | Idempotent seed in `SQLiteService.initialize()` inserting `admin` user with bcrypt hash |

---

## Root Causes (from audit)
1. **No HTTP endpoint exists** — backend only has IPC `auth:login`
2. **Hash mismatch** — mobile SHA-256 vs backend bcryptjs
3. **Token contract mismatch** — mobile expects `access_token`/`refresh_token`/`expires_in`, backend returns `session_token`
4. **Base URL hardcoded** — `10.0.2.2:3000` only works on Android emulator
5. **`crypto.subtle` missing on Hermes** — SHA-256 fallback crashes on device
6. **Local fallback `__DEV__`-only** — disabled in production builds
7. **Mobile SQLite has no users** — `loginLocal()` finds empty table

---

## Required Changes

### 1. Backend: Add HTTP Auth Endpoints (Express)
**Files:**
- `backend/server.js` (new) — Express server on port 3000, mounts `/api/v1/auth`
- `backend/routes/auth.js` (new) — `POST /login`, `POST /refresh`, `POST /logout`
- `backend/controllers/authController.js` — adapt return shape to `{ ok: true, data: { access_token, refresh_token, expires_in, usuario } }`
- `electron/main.js` — start HTTP server alongside IPC handlers

**Behavior:**
- `POST /api/v1/auth/login` → validates credentials via existing `authService.login()` → returns opaque `session_token` as both `access_token` and `refresh_token` with `expires_in: 43200`
- `POST /api/v1/auth/refresh` → validates `refresh_token` via `sessionService.resolverUsuarioDesdeSesion()` → returns new `session_token` (or same) with new `expires_in`
- `POST /api/v1/auth/logout` → calls `sessionService.invalidar(token)`
- CORS enabled for `http://localhost:*`, `http://10.0.2.2:*`, `exp://*`, `capacitor://*`

### 2. Mobile: Switch to bcrypt
**Files:**
- `mobile-app/package.json` — add `expo-crypto`, `bcryptjs`
- `mobile-app/src/services/auth/AuthService.ts` — replace SHA-256 `hashPassword`/`verifyPassword` with `bcryptjs` (async via `expo-crypto` polyfill)
- `mobile-app/src/utils/idempotency.ts` — keep `createHash` (used for idempotency, not passwords)

**Note:** `expo-crypto` provides `crypto.subtle` polyfill for Hermes. `bcryptjs` works in JS (slower but acceptable for login).

### 3. Mobile: Platform-Aware Base URL
**File:** `mobile-app/src/constants/config.ts`
```ts
import { Platform } from 'react-native';
export const API_CONFIG = {
  baseURL: __DEV__ 
    ? Platform.OS === 'android' 
      ? 'http://10.0.2.2:3000/api/v1' 
      : 'http://localhost:3000/api/v1'  // iOS sim, web, physical via `adb reverse` or LAN IP
    : 'https://api.farmacia-control.com/api/v1',  // TODO: real prod URL
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
} as const;
```
**Later:** Use `expo-constants` / `react-native-config` for build-time injection of prod URL.

### 4. Mobile: Seed Initial User in SQLite
**File:** `mobile-app/src/services/database/migrations/001_init.ts`
- Keep existing seed but **change hash to bcrypt** (cost 12) for password `admin123*`
- Generate hash at build time or use script; store as constant in migration
- Or: add a one-time seed function in `SQLiteService.initialize()` that runs after migrations

### 5. Mobile: Remove `__DEV__` Guard from Local Fallback (Optional)
**File:** `mobile-app/src/services/auth/AuthService.ts`
- If offline-first login is required: remove `if (__DEV__)` around `loginLocal()` call
- Ensure bcrypt works on mobile (step 2) and seed exists (step 4)

### 6. Mobile: Align Types with HTTP Response
**File:** `mobile-app/src/types/api.ts`
- `LoginResponse.data` already expects `access_token`, `refresh_token`, `expires_in` — matches new HTTP contract

### 7. Shared: Verify Token Validation Works for Both Clients
- Electron IPC: continues using `session_token` directly via `sessionService.resolverUsuarioDesdeSesion()`
- Mobile HTTP: sends `Authorization: Bearer <access_token>` → Express middleware validates via same `sessionService`

---

## Validation Steps

| Step | Command / Test | Expected |
|------|----------------|----------|
| 1. Start HTTP server | `npm run dev` (starts Electron + HTTP on :3000) | `curl -X POST http://localhost:3000/api/v1/auth/login -d '{"username":"admin","password":"admin123*"}' -H "Content-Type: application/json"` → `{ ok: true, data: { access_token: "...", refresh_token: "...", expires_in: 43200, usuario: {...} } }` |
| 2. Android Emulator | `cd mobile-app && npm run android` → login with `admin` / `admin123*` | Login succeeds, navigates to Dashboard |
| 3. Physical Device (USB) | `adb reverse tcp:3000 tcp:3000` → run on device | Login succeeds |
| 4. Expo Go | Scan QR → login | Login succeeds (dev mode) |
| 5. Web | `cd mobile-app && npm run web` → login | Login succeeds (CORS headers set) |
| 6. Production Build | `eas build --platform android --profile preview` → install APK → login | Login succeeds (no `__DEV__` fallback needed) |
| 7. Password Hash | Check `usuarios.password_hash` in SQLite starts with `$2a$` or `$2b$` | Mobile `bcrypt.compareSync` returns `true` for correct password |
| 8. Token Refresh | Wait >5min before expiry → make API call → `refreshAccessToken()` called | New `access_token` returned, stored, request retried |

---

## Rollout / Migration Path

1. **Phase 1** (this PR): Add HTTP server, unify token contract, mobile bcrypt, platform base URL, seed user
2. **Phase 2**: Deploy HTTP service independently (render.com, fly.io, etc.) — update prod `baseURL`
3. **Phase 3**: Add JWT if needed (separate decision); current opaque token works for 12h sessions
4. **Phase 4**: Remove local fallback if not needed; or keep for true offline-first with synced credentials

---

## Out of Scope
- JWT implementation
- Independent HTTP service deployment (infra decision)
- Production URL configuration (environment-specific)
- Biometric/PIN setup flow changes
- Sync engine auth integration (uses same token)

---

## Open Questions for Implementation Agent
1. HTTP server port: 3000 (default) or configurable via env?
2. Prod API URL: `https://api.farmacia-control.com/api/v1` — confirm or provide alternative
3. Seed password for mobile `admin` user: use `admin123*` (matches backend seed) or different?
4. Should `loginLocal()` remain as offline fallback after HTTP works? (Currently gated by `__DEV__`)