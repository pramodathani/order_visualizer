# frontend/src/three/timeScale.ts

A broken time axis. Busy stretches keep their true length at a fixed number of seconds per unit of depth, and each quiet gap longer than the limit becomes a short fixed-depth break. On 2026-09-27, gaps over 60 s made up 58% of the day; on 2026-09-29 they made up about 21%.

A moment inside a gap is placed proportionally inside that gap's break, so nothing drawn there jumps to the next stretch.
