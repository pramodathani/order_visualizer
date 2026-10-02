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
