# order_visualizer/state/market_service.py

Reads are cached per instrument and whole second of the moment asked about. The live book ("now") therefore costs at most one snapshot read and one speed read per instrument per second, however many browsers or chat questions ask. A past moment ("received" or "ended") has a fixed time, so it is read once and then answered from the cache until the cache passes 500 entries and is cleared.

A missing grant is reported as a readable reason in the panel rather than as an error, so the page explains how to fix it.
