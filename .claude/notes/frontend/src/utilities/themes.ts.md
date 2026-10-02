# frontend/src/utilities/themes.ts

The user asked on 2026-10-02 for "about a dozen" themes commonly used in text editors, with a dark default. These twelve were chosen, with One Dark as the default: One Dark, Dracula, Monokai, Nord, Gruvbox Dark, Solarized Dark, Tokyo Night, Catppuccin Mocha, Night Owl, GitHub Dark, Solarized Light and GitHub Light.

Each theme has page colours and eight named hues taken from the editor theme's own palette. States are mapped to hues by meaning in `stateColours.ts` (filled is green, resting is blue, rejected is red, and so on), so every theme keeps the same meanings in its own colours.

The choice is saved in the browser's local storage, wrapped in try and catch because storage can be unavailable; the theme then simply resets on reload.
