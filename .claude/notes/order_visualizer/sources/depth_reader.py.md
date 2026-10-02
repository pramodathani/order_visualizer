# order_visualizer/sources/depth_reader.py

## The rule this file exists to keep

On 2026-10-02 an exploratory count over six days of `unified.ticks` ran for over two and a half minutes on UBI's database before finishing on its own. Every query here therefore names one instrument and a window of at most a few minutes, so it is answered from `ticks_instrument_time_idx (instrument_id, time DESC)`. Never add a query without both.

## Other choices

- The statement timeout is 2 seconds, tighter than the event reader's 5, because a depth read should take milliseconds.
- The connection is shared between request threads behind a lock, because psycopg2 connections must not run two queries at once. Together with the event reader, the viewer holds at most 2 connections; the role's limit is 3, which a second copy of the viewer started for testing will exceed.
- The trading speed comes from the change in the cumulative `volume` column between the newest tick and the oldest tick in the last five minutes. Under 30 seconds of ticks, or a falling volume (a new trading day), gives no speed rather than a misleading one.
- How quickly ticks reach this table during market hours depends on UBI's `store_quotes_to_db` batching. It was not measured, because 2026-10-02 was a market holiday.
