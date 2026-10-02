# order_visualizer/chat/chat_toolbox.py

Every tool is `strict`, with every parameter required and `additionalProperties: false`, so the model's arguments always match the schema. Optional filters are nullable instead of omitted, because strict schemas need every property listed as required.

Tools are dispatched with a plain `if` chain, not a name lookup, following the project's rule against dynamic dispatch.

Times in tool results are rewritten as IST text by `TimeText`, because the model reads "2026-10-01 11:40:50 IST" more reliably than epoch seconds, and the user thinks in IST.

The reading tools answer only from the viewer's memory and the market service's cache, so a chat question adds no new kind of load on UBI.
