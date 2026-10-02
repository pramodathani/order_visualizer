# frontend/src/utilities/viewBridge.ts

A small store that lets the chat steer the pages without lifting every page's state into `App`.

Commands from the chat that must act on a page that may not be mounted yet (a highlight after `show_order`, a column focus after `show_day`) are stored as state, not sent as events, so a page that mounts afterwards still sees them. Requests that can repeat with the same value (asking for the same moment or the same column twice) carry a counter, so the page's effect fires again.

Pages report what they show through `report()`; the chat box sends that with each question, so the model knows what is on screen.
