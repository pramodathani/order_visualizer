# frontend/src/three/planLayout.ts

A join's list of parts appears in paths as `<join>.children.<n>`, such as `root.each_fill.children.0`. The layout treats `<join>` as the parent of each child and skips the `children` step, so the tree reads join → child rather than join → "children" → child.

Leg roles that are not dotted paths (`entry`, `stop`, `target` and so on, used by non-plan types) hang directly off the root, so a bracket draws as the order with its legs beneath it.

A leaf with several legs takes extra width, half a column per extra leg, so legs of neighbouring parts do not overlap.
