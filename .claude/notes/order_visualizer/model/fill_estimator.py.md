# order_visualizer/model/fill_estimator.py

The user asked to "visually indicate what the order book would do to the order and the likelihood of fills, cancels and rejections". A single probability would need a fitted model and more history than the viewer holds, so the panel shows two honest things instead:

1. Where each open leg stands now, from the book: distance to the other side, quantity queued at the same or better prices, and how long that queue would take to clear at recent speed.
2. How finished orders of the same type actually ended (`OrderBook.outcome_counts`), overall and on the same instrument.

## Assumptions behind the time to the front

- Prices hold still.
- About half the traded volume trades on the leg's side of the book (`SIDE_SHARE_OF_VOLUME`).
- Every order queued at the leg's own price arrived before it, which makes the estimate conservative.
- A limit beyond the five visible levels is behind at least everything visible; the true queue is unknown.

Stop legs are measured by the move the last price needs to reach the trigger.
