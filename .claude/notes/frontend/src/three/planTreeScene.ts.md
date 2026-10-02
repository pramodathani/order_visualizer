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

## The order book ladder

The ladder is laid out like a trading screen: prices in a centre column, asks above with bars running right, bids below with bars running left. The user asked for this on 2026-10-02. The last traded price is an outline around its price with an "LTP" tag in the empty half of its row; an earlier full-width line looked as if it cut through the best-offer bar in perspective.

### Moving, turning and resizing it

The user can place the ladder with three.js's `TransformControls` handle, chosen from the toolbar in `PlanView3D`.

- The ladder lives in `ladderRoot`, a group that is never rebuilt. Only its contents (`ladderContent`) are cleared and redrawn, because a working order redraws every second and rebuilding the handled object would break a drag in progress.
- `ladderContent` is shifted by minus the ladder's default middle, so turning and resizing happen about the ladder's own middle.
- The placement is saved as an offset from the default place, plus a rotation and one scale (`utilities/ladderPlacement.ts`). It therefore carries over to every order while still following each order's tree width and moment.
- Resizing is kept even on all three axes, because the labels are sprites and an uneven scale would stretch their text. It is limited to 0.4 to 3 times.
- After every change the ladder is lifted if any part of it is below the floor.
- The dashed threads from legs to markers are kept outside the ladder in `threadGroup` and redrawn from the markers' world positions on every change, so they keep meeting their markers.
- OrbitControls are switched off while the handle is dragged, so the camera does not move with it.

### The panel behind the ladder

The panel is built last and sized to everything drawn on the ladder, measured from each bar's geometry and each label's sprite size, with a 0.9-unit margin. An earlier fixed-width panel let long quantities spill over its edge. Leg readings carry `userData.outsidePanel` and are left out, because they sit by their threads to the left.

The panel is a rounded rectangle `Shape` extruded 0.12 units, with a faint outline. A `RoundedBoxGeometry` cannot round corners by more than half its thinnest side, so on a 0.2-unit-thick panel the 0.5 radius asked for was cut to 0.1 and the corners looked square.

## Minor ticks on the time axis

Between labelled ticks the axis has short, fainter, unlabelled ticks, which the user asked for on 2026-10-02. Each labelled step is split into 5 when it divides by 5, otherwise 4 or 2, so a minor tick always falls on a round time. `dayScene.ts` does the same inside each busy stretch, leaving the squeezed quiet breaks clean.
