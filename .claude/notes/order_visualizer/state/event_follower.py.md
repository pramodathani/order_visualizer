# order_visualizer/state/event_follower.py

## Why the overlap

The engine stamps a row's `time` when it records the transition and commits straight away, but two engine tasks can commit out of order. A row stamped a moment earlier than one already read could commit after that read. Re-reading the last ten seconds on every poll picks such a row up. The order book drops the rows it has already seen, keyed by `(parent_order_id, sequence)`, which is the same key the engine's own recovery uses.

The cost is small: a normal poll re-reads at most ten seconds of rows through the time index.

## Full batches

When a query returns a full batch of 5,000 rows, the next query starts exactly at the newest row's time, with no overlap, so a burst larger than one batch cannot loop forever. A row sharing that exact microsecond timestamp with the batch's last row, but not in the batch, would be missed. That needs more than 5,000 rows inside one poll and a timestamp tie at the boundary, so it is accepted.

## Lookback

The first poll reads `lookback_hours` (168, or 7 days, by default) so that the order list has recent history on start. On 2026-10-02 the whole table held 10,473 rows from 1,710 orders over a week, so a full lookback is a few thousand rows.
