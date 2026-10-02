# order_visualizer/state/order_book.py

The book keeps every row key it has folded in, so a row the follower reads twice is ignored. New rows are sorted by `(parent_order_id, sequence)` before folding, because `ParentOrder.apply` expects each parent's rows in sequence order.

The book keeps every order it has seen for as long as the process runs. At the volumes seen on 2026-10-02 (about 1,700 orders and 10,000 rows a week) that stays well under the unit's 1 GB memory limit, so there is no eviction yet.
