# frontend/src/three/planTreeScene.ts

## Axes

- Across (x): tree columns, from `PlanLayout`.
- Down (y): tree depth, root at the top.
- Into the screen (−z): time, from when the order was received.

The whole life of the order is stretched to a fixed depth of 48 units, so an order that lasted two seconds and one that lasted two hours both fill the view. The time axis labels give the real clock times. For a working order the span grows every second, and the scene is redrawn every second to match.

## Shapes

- A sphere per node, coloured by the part's current state (the root by the parent's state).
- A thin translucent rail behind each part, coloured by each state the part was in over time.
- A thick bar per leg, one segment per leg state. A final state (filled, cancelled or rejected) gets a short cap rather than running on to the end of the order, so it is clear the leg stopped there.
- A ring where the engine asked for a leg to be cancelled.
- A faint orange plane at "now" for a working order.

The camera is fitted only when a different order is chosen, so the redraw every second does not undo the user's orbiting.
