---
name: testing-pharmacy
description: Defines domain-focused tests for Farmacia-Control, especially stock integrity, partial dispensing, orderless outputs, evidence requirements, permissions, offline behavior, synchronization, and auditability. Use when adding or changing business logic.
---

# Pharmacy-focused testing

## Test strategy
Prioritize domain invariants over superficial UI snapshots.

For every important workflow test:
- success path
- validation failure
- permission failure
- partial state
- retry/duplicate action
- offline condition where relevant
- audit side effects

## Required scenarios

### Partial order
Given requested=3 and dispensed=2:
- pending=1
- order is not fully dispensed
- only 2 units/lots are removed from stock.

### Orderless output
Attempt a stock output without an order:
- operation is rejected or explicitly recorded as an exception according to the domain workflow;
- it is flagged red;
- audit identifies actor/time/sede;
- reports do not classify it as normal reconciled dispensing.

### Missing evidence
Attempt dispensing with any required documentation, signature, or fingerprint missing:
- operation is not marked complete;
- documentation is incomplete/red;
- audit/validation explains the missing requirement.

### Deletion
- unauthorized user cannot delete;
- deletion request is logged;
- rejected request is logged;
- approved deletion is logged with approver and time.

### Roles
Verify each role cannot cross its allowed sede/privilege boundary.

### Expiration
- expired lot cannot be dispensed;
- lot within 90 days is classified as approaching expiration;
- different lots remain separately traceable.

### Offline
With cloud unavailable:
- valid local workflow persists in SQLite;
- application does not falsely report cloud synchronization as complete;
- queued sync survives restart.

### Sync retry
Submit the same sync operation twice:
- stock effect occurs once;
- audit effect occurs once where appropriate;
- operation is recognized as already applied.

### Transfer
Verify source and destination movements remain traceable and cannot duplicate after retry.

## Regression rule
When fixing a bug in a business invariant, add a regression test that would have failed before the fix.

## Test data
Use fictional/synthetic pharmacy data. Never use real patient data in automated tests.
