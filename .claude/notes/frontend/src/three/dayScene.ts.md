# frontend/src/three/dayScene.ts

## Why a skyline

The first whole-day view drew each order as a bar along time. On 2026-09-27 that day ran 7 h 20 min while the average order lived 60 s, so most bars were specks, and a minimum bar length made bursts stack into towers. The user chose a skyline instead (option A of three offered on 2026-10-02): order type across, minutes into the screen, and one column per type and minute.

## What a column means

A column counts the orders of one type that **arrived** in that minute, not the orders alive in it, so each order is counted exactly once. It is split into stacked segments by the order's current state: completed, cancelled, rejected and failed first in that order, then any state of an order still working. One order is one unit tall unless the busiest column would pass 18 units, in which case every column is scaled down by the same factor. The scale note beside the lanes says how many orders 5 units stand for.

## Time

Time uses `TimeScale` with one-minute buckets, one unit of depth per minute, and gaps longer than two minutes squeezed to a 3-unit break labelled with the gap's length.

## Lanes

Only the types present that day get lanes. The busiest type sits in the middle and quieter types alternate outwards, so the tallest columns are near the centre of the view. Lane labels alternate between two rows at the front so neighbouring names do not overlap.

## Picking

Every segment is one instance of a single `InstancedMesh`, and `cellByInstance` maps an instance back to its cell. A click counts only when the pointer moved less than 5 pixels between press and release, so turning the camera never selects a column. The chosen column is outlined in the accent colour.
