---
name: inventory-lots-expiration
description: Implements medication inventory by product, presentation, lot, quantity, unit/box conversion, expiration, stock movements, and expiry reporting. Use whenever changing inventory calculations or medication stock behavior.
---

# Inventory, lots, and expiration

## Stock model
Inventory is not merely a product total. When applicable, preserve:
- medication/product
- presentation
- lot
- expiration date
- quantity in boxes
- quantity in individual units/tablets
- sede
- movement type
- source/order/transfer
- responsible user
- date/time

## Box and unit quantities
A box may contain a defined number of individual units. Do not assume every product has the same conversion.

Example:
- 1 box = 20 tablets
- 40 boxes = 800 tablets

Store and calculate conversions using the product/presentation definition, not hard-coded universal values.

## Lot integrity
Do not merge lots merely because the medication name is identical. Different lots and expiration dates remain traceable.

## Expiration
Classify:
- expired
- approaching expiration
- normal

The application's current warning rule is: approaching expiration means within 90 days.

Do not alter this threshold silently.

## Stock movements
Every increase/decrease must have a reason and traceability.
Do not directly overwrite a stock total when a movement record is required.

For a decrease, validate available quantity using the same unit of measure used by the operation.

## FEFO
Where the workflow requires choosing which lot to dispense, prefer the earliest-expiring eligible lot (FEFO) unless a documented business rule says otherwise.

Never dispense an expired lot.

## Transfers
A transfer between sedes is a traceable movement from source to destination. Do not simply add stock at the destination without recording the source-side movement and transfer identity.
