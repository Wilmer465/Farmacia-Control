---
name: farmacia-architecture
description: Defines and protects the Farmacia-Control architecture: Electron desktop application, React/Vite renderer, secure preload/IPC, local SQLite, central PostgreSQL, and local-first synchronization. Use for architecture changes, new modules, integrations, or refactors.
---

# Farmacia-Control architecture

## Target architecture
Farmacia-Control is a desktop-first Electron application.

Conceptual flow:

PC at each sede
-> Electron application
-> secure preload/contextBridge
-> IPC/service layer
-> local SQLite
-> synchronization/API layer
-> central PostgreSQL in the cloud

GitHub stores source code, not operational pharmacy data.

## Architectural boundaries
- Renderer: React/Vite UI only.
- Preload: expose a narrow, typed API through contextBridge.
- Main/Electron services: trusted filesystem, database, IPC orchestration, and privileged operations.
- SQLite: local operational database and offline source for the desktop workflow.
- PostgreSQL: central cloud data store.
- Sync/API: explicit boundary between local operations and cloud state.

Do not expose Node.js, filesystem, SQL drivers, secrets, or arbitrary IPC directly to the renderer.

## Local-first requirement
Normal medication/inventory workflows must continue when Internet or cloud services are unavailable.
Write locally first where the operation belongs to the local desktop workflow. Synchronization must happen separately and safely when connectivity returns.

Never make ordinary stock operations depend on a live cloud round-trip unless the specific domain operation explicitly requires server authority.

## Data safety
- Use transactions for multi-step domain operations.
- Preserve audit information for sensitive actions.
- Never store the SQLite database inside a packaged read-only application archive.
- Do not commit local database files or secrets to Git.
- Keep environment-specific configuration outside source-controlled secrets.

## Change discipline
Before changing architecture:
1. Inspect the existing repository structure and conventions.
2. Reuse existing services/types instead of creating parallel implementations.
3. Preserve public interfaces unless a migration is planned.
4. Update tests and documentation for architectural changes.
5. Keep the change focused.

Do not introduce Express, a second database layer, RxDB, or unrelated infrastructure unless the project requirements explicitly change.
