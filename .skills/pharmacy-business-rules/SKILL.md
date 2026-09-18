---
name: pharmacy-business-rules
description: Enforces the core business rules of Farmacia-Control for medication orders, dispensing, stock movements, documentation, auditability, and reconciliation. Use whenever implementing, modifying, validating, or reviewing pharmacy workflows or business logic.
---

# Pharmacy business rules

## Purpose
Treat Farmacia-Control as a medication-order and inventory-control system, not a conventional point-of-sale system. Stock leaves only through a valid, traceable order workflow.

## Mandatory rules
1. Every medication output/dispatch must be associated with an order.
2. Every output must have the required documentation, a signature capture, and fingerprint evidence. Missing any required element makes the output/documentation incomplete and a red flag.
3. A stock output without an order is an exception and must be recorded and audited. Reports must never show the operation as reconciled while any unauthorized/orderless output remains.
4. Orders may be partially fulfilled. Example: requested 3 medications, 2 dispensed, 1 remains pending.
5. Pending quantities remain pending; never silently convert pending quantities into dispensed quantities.
6. Record the responsible person, date/time, sede, order, medication, quantity, and relevant lot/expiration data for stock movements.
7. Medication exchanges/transfers between sedes must be explicit, traceable, and authorized according to role.
8. Deletion is controlled. Inventory users register operations but do not freely delete records. Deletion requests and their approval/rejection must be audited.
9. Never silently bypass a business rule to make a UI or test pass.
10. Prefer explicit validation and domain errors over implicit or destructive behavior.

## Roles
- SUPERADMIN: full system and all-sede access.
- ADMIN: access restricted to assigned sede; cannot freely delete records.
- INVENTARIO: registers inventory operations; deletion requires the defined approval flow.
- USUARIO: view-only access to permitted information.

## Reporting invariants
Reports must distinguish at minimum:
- entradas
- despachados con orden
- salidas sin orden
- documentación incompleta
- solicitudes de eliminación
- próximos a vencer
- vencidos
- auditoría
All relevant records must identify the sede.

## Implementation guidance
Put business invariants in domain/service validation rather than relying only on React form validation. Re-check authorization and invariants in the trusted Electron/backend/API layer before committing a transaction.
