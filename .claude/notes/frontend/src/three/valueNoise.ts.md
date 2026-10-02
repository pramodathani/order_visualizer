# frontend/src/three/valueNoise.ts

Value noise: a repeatable random value at each grid point, blended with a quintic ease so neighbouring cells join without creases, and summed over several scales for natural detail. It was chosen over Perlin or simplex noise because it is short and easy to read, and the landscape needs nothing finer. `sequence()` is a linear congruential generator for placing trees repeatably.
