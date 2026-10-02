# frontend/src/three/animal.ts

The shared mechanism of the animals the user asked for on 2026-10-02 (dogs and squirrels that run around). Following the project's rule, each kind is its own class in its own file (`dog.ts`, `squirrel.ts`), and only the genuinely shared wandering is here.

An animal picks a target, turns towards it at its own turn rate, runs at a chosen speed (slowing while it turns sharply, so it curves rather than spinning on the spot), pauses on arrival, and picks again. Its height follows the ground. The gait phase advances with distance travelled, so legs move faster when the animal runs faster and stop when it stops.

Models face positive z, so the heading angle is the model's rotation about y, and forward is `(sin θ, 0, cos θ)`.

The landscape passes in a world description (ground height, arena centre and radius, tree positions) rather than itself, so animals depend only on what they use.
