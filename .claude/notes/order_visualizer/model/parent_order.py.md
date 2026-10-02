# order_visualizer/model/parent_order.py

## Where each field comes from

- The request fields (instrument, side, order type, quantity, price) come from `detail.body` on the `parent_received` row.
- A plan's parts come from `detail.parameters.parts` on every row that carries parameters, which in practice is `parent_received` and `parameters_changed`. Each such row holds the whole map, so a part's record is taken whole and a state change is recorded when its state or reason differs.
- A leg's role is its part's path for a plan, such as `root.each_fill.children.0`. For other types the role is a plain word such as `entry`, `stop`, `target`, `slice` or `rung`.

## Finished states

The final parent states seen in the table on 2026-10-02 were `cancelled`, `completed`, `failed` and `rejected`. The working states were `received`, `working`, `protecting` and `cancelling`.

## Leg states

A leg's state in the `leg_cancelled` row is still `acknowledged`; the leg only becomes `cancelled` on the broker's later `leg_update`. The viewer keeps the state exactly as recorded and marks the cancel request separately with `cancel_requested_at`.
