# frontend/src/components/ChatBox.tsx

Modelled on the input bar of chat apps, as the user asked: a rounded input fixed at the bottom centre, a send button, and the conversation in a panel above it that can be collapsed. Enter sends; Shift+Enter starts a new line.

Commands in an answer are applied in the order the model made the tool calls, so "open this order, then highlight its stop" works.

The conversation id is kept in component state only, so reloading the page starts a new conversation. The server keeps the 30 most recent conversations in memory.
