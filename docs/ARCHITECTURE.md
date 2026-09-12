# Architecture notes

Short notes on the decisions that are easy to get wrong later.

## Order status is derived, never typed in

`recomputeOrderStatus` (`src/lib/services/garments.ts`) runs inside the same
transaction as every shop-floor event. It reads the order's garments, finds the first
still-open `ProcessingTask` for each, and takes the least-advanced station across
them. That station is the order's status.

Two consequences worth knowing:

- A garment that has *finished* washing is reported at its **next** station, not the
  one it just cleared. "Where is my order" should answer with where the work is
  queued, not where it has been.
- `CANCELLED`, `REFUNDED` and `ON_HOLD` are terminal or manual and are never
  overwritten by shop-floor activity.

## Money is recomputed, not incremented

`recalcOrderPayments` re-derives `paidAmount`, `refundedAmount`, `outstandingAmount`
and `paymentStatus` from captured payments and processed refunds, then pushes the same
figures onto the invoice and the corporate account's outstanding balance. Nothing
maintains a running total by hand, so a failed mutation cannot leave the ledger drifting.

`computeTotals` in `src/lib/money.ts` is the single source of truth for arithmetic:
discount applies to the subtotal, GST applies to the discounted (taxable) value.

Prisma returns `Decimal`, which React Server Components cannot pass to Client
Components. `num()` converts at the boundary; `plain()` in `src/lib/serialize.ts` deep
-converts a whole query result when needed.

## Document numbers are allocated atomically

`nextSequence` uses a single `INSERT … ON CONFLICT DO UPDATE … RETURNING` against the
`sequences` table, so concurrent counters can never receive the same number.
`nextGarmentCodeBlock` reserves a contiguous block in one round trip, which is what
makes booking a 40-piece order a single fast transaction.

## Pricing precedence

`resolvePrice` resolves in this order and stops at the first hit:

1. an active **B2B rate card** on the customer's contract (a garment-specific card
   beats a service-wide one)
2. the **service × garment-type** rate
3. the service's **base price**

The order form calls the same server function for its live quote that the server uses
when persisting, so the counter never sees a number the server disagrees with.

## Stations only show actionable work

A `ProcessingTask` can be `PENDING` at washing while the same garment is still
unsorted. Listing it would give operators a queue they cannot act on, so the
workstation filters to tasks whose earlier stages are all closed and reports the rest
as "still finishing an earlier station". `advanceGarment` enforces the same rule
server-side — the filter is a courtesy, not the control.

## Authorisation

- `authorize(permission)` — server actions and route handlers; throws.
- `requirePermission(permission)` — pages; redirects to `/forbidden`.
- `assertBranchAccess(user, branchId)` — reject cross-branch reads and writes.
- `requireWriteBranch(user, requested)` — decide which branch a new record belongs to.

The middleware checks only for the presence of a session. It runs on the edge and
cannot see the database, so it is a convenience redirect and never the boundary.

## Charts

Chart colours come from a categorical palette validated for colour-vision deficiency
separation and contrast (see `--chart-1 … --chart-6` in `globals.css`). The rules the
charts follow:

- Slots are assigned in fixed order and never cycled or re-ordered on filter.
- Never two y-scales on one plot — revenue and order volume are two charts.
- Nominal categories get one colour; bar length already encodes magnitude.
- Two or more series always carry a legend; every chart offers a table view.
- Dark mode uses its own steps chosen for the dark surface, not an automatic flip.
