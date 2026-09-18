---
name: audit-security
description: Protects authorization, audit trails, deletion workflows, sensitive stock actions, and Electron security boundaries in Farmacia-Control. Use for permissions, deletions, security reviews, or sensitive operations.
---

# Audit and security

## Audit minimum
For sensitive actions record, when applicable:
- actor/user
- action
- date/time
- sede
- target record
- reason
- previous state
- resulting state
- approval/rejection information

## Deletion workflow
Deletion requests must be recorded whether accepted or rejected.

A request must identify:
- requester
- time
- sede
- medication/record
- reason
- decision
- decision maker
- decision time

Approved deletion must itself create an auditable event.

Do not silently hard-delete important operational records when the domain requires traceability.

## Authorization
Enforce authorization in the trusted service/backend layer, not only by hiding buttons in React.

Role scope:
- SUPERADMIN: all sedes and privileged administration.
- ADMIN: assigned sede scope.
- INVENTARIO: operational inventory actions, restricted deletion.
- USUARIO: view-only.

Never trust a sede ID, role, or user ID supplied by an untrusted renderer.

## Electron security
- Keep contextIsolation enabled.
- Use a narrow contextBridge API.
- Validate IPC inputs.
- Do not expose arbitrary filesystem, shell, or database execution to the renderer.
- Do not place secrets in renderer code.
- Treat imported/scanned data as untrusted input.

## Security principle
Prefer deny-by-default authorization and explicit allowlists.
Any new privileged action must define who may perform it, what data it can access, and what audit event it creates.
