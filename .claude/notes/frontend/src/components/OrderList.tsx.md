# frontend/src/components/OrderList.tsx

When the chosen order changes, for example after "Open" in the day view or a chat answer, the list scrolls the chosen row into view with `block: 'nearest'`, so a row already visible does not jump. An order hidden by the "Plans only" or "Working only" filters cannot be scrolled to.
