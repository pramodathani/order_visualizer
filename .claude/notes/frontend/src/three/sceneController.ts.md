# frontend/src/three/sceneController.ts

Started as a copy of `instruments_explorer`'s scene controller and was rebuilt on 2026-10-02, when the user asked for graphics that look professional rather than basic.

## What the base gives every scene

| Piece | Why |
|---|---|
| ACES filmic tone mapping on dark themes, neutral on light themes | ACES gives rich highlights on dark backgrounds but turns white into grey, which washed out the light themes. |
| A room environment map (`RoomEnvironment` through `PMREMGenerator`) | Glossy materials need something to reflect; without it they look flat. |
| A hemisphere light plus one shadow-casting key light | Soft fill from above and below, with one clear light direction for shadows. |
| `EffectComposer` with a 4-sample render target, `UnrealBloomPass` and `OutputPass` | Bloom makes glowing things (resting legs, particles, selection outlines) bleed light. The composer replaces the renderer's own anti-aliasing, so its target carries the samples. |
| Bloom switched off on light themes | On a white background the whole frame is above the bloom threshold, so everything glowed and the scene looked washed out. |
| `framing()` fits the projected corners | The camera is placed so the scene's eight bounding-box corners, projected onto the screen, span about 90% of the view and sit centred. Fitting a bounding sphere instead left wide empty bands, because a long, flat scene seen at an angle fills its sphere poorly. Five rounds settle the perspective. |
| Fog set by `framing()` | Far parts of the floor fade into the background. It starts at 1.5 times the camera distance on dark themes and 2.2 times on light ones; closer fog bleached light themes. |
| `flyTo()` with ease-in-out | Choosing another order or column glides the camera instead of jumping. Grabbing the camera cancels a glide. |

## The constructor trap

The constructor calls the private `styleForTheme`, never the public `applyTheme`. Subclasses override `applyTheme` to redraw their contents, and a subclass's own fields (such as `orderGroup`) do not exist yet while the base constructor runs. Calling the overridable method there crashed with "Cannot read properties of undefined (reading 'traverse')".

## Size before the first draw

`PlanView3D` and `DayView3D` call `resize()` with the canvas's size as soon as the scene is created. Without that, the first fit ran while the camera still had its default square shape, so a wide scene was fitted to a square and then shown small in the middle of a wide canvas.

All clean-up code checks for `THREE.Line`, which covers line segments and line loops as well as plain lines, so minor ticks and the ladder's rounded border are freed too.

## Moving around the arena

The user asked on 2026-10-02 to be able to drag, rotate and zoom into specific areas.

| Control | How |
|---|---|
| Scroll zooms towards the cursor | `controls.zoomToCursor = true` |
| Panning slides along the ground, not the screen | `controls.screenSpacePanning = false` |
| A plain left-drag rotates or pans | `setDragMode()` swaps the mouse buttons (and one-finger touch); Shift-drag and right-drag always do the other |
| Turn, zoom and fit buttons | `turnView()`, `zoomView()` and `fitView()` glide with `flyTo()`; Fit returns to the view saved by `setHome()` when the scene last fitted itself |
| Double-click zooms into a spot | Raycasts into `focusRoots()`, skipping labels, and glides to 45% of the current distance around the point hit; empty floor counts as a spot |

`minDistance` is 3 units, so zooming in never passes through what is being looked at.

The double-click handler refreshes the camera's and scene's world matrices before aiming. They are normally refreshed by drawing, but a hidden browser tab draws no frames, and testing in a hidden automation tab showed the ray then starting from a stale camera matrix. A hidden tab also pauses every glide, because `requestAnimationFrame` does not fire there.

## The sky follows the time on screen

When the sky is on, a few times a second the base asks the scene for `focusTime()`, the time at the point the camera looks at (`controls.target`), read back from its depth along the time axis. The user asked for the sun to follow "the time on the screen in the scene", not the wall clock. When that time has moved more than 20 seconds, the sun, the lighting, the fog and the readout are updated. Reflections are regenerated from a separate small sky without its sun disc, only when the sun has moved more than 2°, because regenerating them costs a few milliseconds.

The shadow-casting light shines from the sun while it is more than 3° up, so shadows fall away from the sun; at night it returns to a fixed overhead direction.

`maxPolarAngle` keeps the camera just above the horizon. Without it the camera could be dragged under the ground and look up through it.
