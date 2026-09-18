---
name: database-sqlite-postgres
description: Guides schema, queries, transactions, migrations, and data synchronization for Farmacia-Control's local SQLite and central PostgreSQL databases. Use for database changes, Prisma work, data integrity, or persistence bugs.
---

# SQLite + PostgreSQL rules

## Two-database model
Farmacia-Control uses:
- SQLite locally at each desktop/sede for offline-first operation.
- PostgreSQL centrally in the cloud for shared multi-sede data.

GitHub is not a data synchronization mechanism.

## Schema principles
- Use stable primary identifiers.
- Define foreign keys and appropriate uniqueness constraints.
- Store timestamps consistently.
- Model sede ownership/association explicitly where required.
- Model medication, presentation, lot, expiration, order, dispensing, transfer, audit, and deletion-request concepts explicitly rather than encoding them in free-form text.
- Avoid duplicated sources of truth.

## Transactions
A domain operation that changes multiple related records must be atomic.

Example:
dispensing a medication should not commit the stock reduction while failing to create the corresponding traceability/audit record.

## SQLite
- Optimize for reliable local operation and safe recovery.
- Use transactions for stock movements.
- Prevent negative stock unless an explicit business rule permits it.
- Do not treat UI state as authoritative persistence.
- Do not commit *.db, *.sqlite, or *.sqlite3 operational files to Git.

## PostgreSQL
- Preserve constraints centrally.
- Design indexes around real query/report patterns.
- Use server-side authorization checks for cloud operations.
- Never assume a local record has already reached PostgreSQL.

## Prisma
When Prisma is used:
- keep schema/migrations consistent with both environments;
- regenerate the client after schema changes;
- use migrations rather than ad-hoc production schema edits;
- verify generated types after schema changes.

## Sync-related data
Operations that may be synchronized should have a stable way to identify the originating operation and avoid duplicate application. Prefer idempotent synchronization semantics.
