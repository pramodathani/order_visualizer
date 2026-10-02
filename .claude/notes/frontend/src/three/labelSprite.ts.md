# frontend/src/three/labelSprite.ts

Labels are drawn into a canvas at 64 px in JetBrains Mono and shown as sprites, so they always face the camera. The first line can be bold and later lines are drawn at 78% opacity, giving a title and subtitle in one label.

The optional pill background keeps a label readable when it sits over tubes or the grid. `pill()` reads the theme colour through `getHexString()`, because three.js stores colours in linear space and reading `.r`, `.g` and `.b` directly gave pills that were too dark.

Labels ignore fog and tone mapping, so they keep the theme's exact text colour.

The canvas is painted once, so the font must be loaded first; `useFontsReady` waits for both weights before any scene draws.
