# frontend/src/three/skyDome.ts

The user asked on 2026-10-02 for a sun, sky and clouds, with the sun placed correctly for the time shown in the scene.

## The sky

three.js's `Sky` object (Preetham atmospheric scattering) draws the blue sky, the bright sun disc and, in this version, its own drifting clouds through the `cloud*` and `time` uniforms. It is a box 15,000 units across that follows the camera, so it always surrounds it; the camera's far plane is 40,000 so no corner is clipped.

## Directions

The scene's north is away from the viewer (negative z) and east is to the right (positive x). An azimuth measured clockwise from north therefore becomes `(sin A cos E, sin E, −cos A cos E)`.

## The ground

A dark disc 9,000 units across, in the theme's surface colour, sits just under the scene's floor and follows the camera. Without it the camera, which looks down at the arena, saw mostly the sky shader's pale haze below the horizon, and the scene looked bleached and floating.

## Light from the sun

| Sun height | Key light | Fill | Fog | Exposure |
|---|---|---|---|---|
| Below −6° (night) | 0.7, cool blue | 0.8 | night blue | 1.0 |
| −6° to 10° (twilight) | rising, warm orange | rising | blends through dusk orange | falling |
| Above 25° (day) | 1.8, white | 0.9 | pale sky blue | 0.5 |

Exposure is halved in daylight because the sky is drawn in high dynamic range, as in three.js's own sky example; at full exposure, and with bloom, the frame washed out white. It opens up at night, like eyes adjusting, so the scene stays readable under a dark sky. Bloom is switched off while the sky shows.
