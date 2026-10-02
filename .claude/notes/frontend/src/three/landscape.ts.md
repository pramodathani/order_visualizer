# frontend/src/three/landscape.ts

The user asked on 2026-10-02 for the ground to be land with grass, mud and trees, and mountains on the horizon. The landscape appears with the sky and goes with it.

## Ground

A 16,000-unit square of 220 × 220 segments, centred on the arena. Its height is flat at the arena and rises into gentle hills (up to about 70 units) from twice the arena's radius outwards, so the arena never sits on a slope. Its colours come from seeded noise: three greens of grass, mud patches where a second noise pattern is high, and worn mud in a ring round the arena, like a site. A small repeating canvas texture of grass blades, every 6 units, adds close-up detail over the colours.

## Trees

900 trees from the detailed shapes in `treeModels.ts`: about 45% pines, 40% broadleaf and 15% birches, drawn as one instanced mesh for wood and one for foliage per variant. They grow in clumps where a noise pattern is high, from a clearing of twice the arena's radius plus 40 units out to 1,100 units beyond it. An earlier clearing of 1.35 times the radius let trees stand beside the order book and hide it. Each tree's size, height, turn and shade vary. Trees do not cast shadows, because the shadow map only covers the arena.

## Mountains

Two rings, at 5,200 and 6,800 units, each a strip of ridges whose heights come from noise around the circle. Each ring has three rows of points: a foot, a shoulder at 70% of the peak's height in rock colour, and the peak, which turns to snow on the tallest. Without the shoulder row each face ran from foot to peak in one triangle, and a snowy peak's white blended all the way down, drawing pale vertical stripes. The mountains ignore fog (it would hide them completely) and instead take on the sky's haze through `setAtmosphere`, the farther ring more, and dim at night.

## Rebuilding

The landscape is rebuilt only when the arena's floor height, centre or size changes by about 10 units, so the live order view's redraw every second does not rebuild it.

All of it is generated from the seed 20261002, so the same land appears every time.

## Animals

Each build lets 4 dogs loose in the meadow round the arena and 12 squirrels at the feet of trees; see `animal.ts`, `dog.ts` and `squirrel.ts`. `update()` moves them every frame while the sky is on, with the step capped at 0.1 seconds so a slow frame does not send an animal flying.
