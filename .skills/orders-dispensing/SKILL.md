---
name: orders-dispensing
description: Implements medication orders and partial dispensing for Farmacia-Control, including pending quantities, documentation, signature, fingerprint, responsible user, and traceability. Use for order, dispatch, output, or fulfillment workflows.
---

# Orders and dispensing

## Core lifecycle
Order
-> requested medications
-> availability check
-> full or partial dispensing
-> required documentation/evidence
-> stock output
-> audit/traceability

## Partial fulfillment
For every order line, distinguish:
- requested quantity
- dispensed quantity
- pending quantity

Invariant:
pending = requested - dispensed
and values must remain non-negative.

Never mark an order line fully dispensed while a positive quantity remains pending.

## Output requirements
Before committing an output, validate all mandatory evidence:
- valid order association
- required documentation
- signature capture
- fingerprint evidence
- responsible dispatcher
- sede
- date/time
- medication/lot/quantity

If any required evidence is missing, do not present the output as complete/reconciled.

## Stock movement
A completed dispensing operation must produce the corresponding stock decrease atomically with its traceability records.

Never allow a UI-only action to claim that stock was dispensed without a persisted movement.

## Exceptions
An output without an order is an exception:
- record it explicitly;
- flag it as red;
- audit who/when/where/why;
- do not classify it as a normal dispensed-with-order operation.

## Idempotency
Repeated UI clicks, retries, or sync retries must not create duplicate dispensing movements. Use a stable operation identity or equivalent idempotency mechanism.
