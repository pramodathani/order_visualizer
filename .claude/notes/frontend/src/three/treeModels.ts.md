# frontend/src/three/treeModels.ts

The user asked on 2026-10-02 for more detailed trees. Each tree used to be one cone or one ball.

| Kind | Built from | Colouring |
|---|---|---|
| Pine | A tapering trunk and 4 or 5 stacked open cones (the tiers), each turned and roughened by noise so the branches look jagged | Dark at the bottom and inside, lighter at the top and tips |
| Broadleaf | A trunk with limbs reaching into 5 to 7 lumpy icosahedron clusters of leaves | Dark green to light green by height and outwardness, with speckles |
| Birch | A slender, slightly leaning white trunk and 6 to 8 small, tall clusters | Lighter, yellower greens |

Every piece is turned into separate faceted triangles (`toNonIndexed`) with colours in its vertices, and the pieces of one tree are merged with `mergeGeometries` into one wood and one foliage geometry. `mergeGeometries` needs every piece to carry the same attributes, so texture coordinates are removed and every piece gets position, normal and colour.

The landscape builds 8 variants (3 pines, 3 broadleaf, 2 birches) once and shares them between rebuilds; each variant is one instanced mesh for wood and one for foliage, so 900 trees cost 16 draw calls.
