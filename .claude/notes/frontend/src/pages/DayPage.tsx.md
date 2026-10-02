# frontend/src/pages/DayPage.tsx

Days are the browser's local calendar days, which on this machine are IST, the market's own days.

The chosen column is remembered as its type and minute rather than as the cell object, so its order list stays current as the overview stream updates.

When testing with a second copy of the server on another port of `localhost`, the two copies overwrite each other's session cookie, because browsers share cookies across ports of one host. Use one copy at a time, or a different host name, when checking in a browser.
