---
name: multi-site-sync
description: Designs reliable synchronization between local SQLite databases at pharmacy sites and the central PostgreSQL cloud database, including offline operation, transfers, retries, idempotency, and conflict handling.
---

# Multi-site synchronization

## Topology
Each sede has a desktop client with local SQLite.

Sedes
-> local SQLite
-> sync/API service
-> central PostgreSQL

The application must remain useful during cloud/network outages.

## Sync principles
1. Local operational writes are durable before they are considered complete.
2. Synchronization is separate from GitHub.
3. Sync retries must be safe.
4. A retry must not duplicate stock movements, dispensing, transfers, or audit events.
5. Preserve origin information: sede, device/client context when needed, operation ID, timestamps, and relevant entity IDs.
6. Never silently discard a conflict.

## Idempotency
Every synchronizable operation should have a stable operation/event identity or equivalent mechanism.

If the same operation is received twice, the server/client must recognize it and avoid applying the business effect twice.

## Ordering
For stock-changing operations, preserve or explicitly resolve causal ordering. Do not apply a dependent operation before its required prerequisite is known.

## Conflicts
A conflict must be:
- detected,
- represented,
- logged,
- resolved according to a deterministic domain rule or escalated for authorized resolution.

Do not use last-write-wins blindly for stock movements, audit records, or deletion approvals.

## Transfers between sedes
A transfer has:
- source sede
- destination sede
- medication/lot
- quantity
- request/authorization
- transfer identity
- status
- timestamps
- responsible users
- synchronized state

A transfer must not create destination stock without corresponding source-side traceability.

## Offline queue
If the client queues unsynchronized operations, the queue must survive application restart and network loss. Failed operations should retry without duplicating successful ones.
