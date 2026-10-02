# order_visualizer/chat/chat_assistant.py

## Model and request settings

| Setting | Value | Why |
|---|---|---|
| Model | `claude-opus-5-5` | The default in the Claude API reference loaded on 2026-10-02; changeable through `ORDER_VISUALIZER_CHAT_MODEL`. |
| Effort | `medium`, set explicitly | Opus 5.5 defaults to medium; it is written out so a later default change does not alter cost silently. Thinking is always on for this model and is not configured. |
| `fallbacks: "default"` with beta `server-side-fallback-2026-07-01` | On | The reference recommends it for this model: if the safety classifiers decline a question, the API reruns it on a suitable model within the same call. |
| System prompt | One cached block | The prompt and tool list never change, so they are served from the prompt cache after the first question. The view description goes in each user message, after the cached prefix. |

## Why a manual loop

The SDK's tool runner is the reference's first suggestion, but it is a beta helper built around decorated functions. The view tools must also collect commands for the browser, and the project's rules prefer plain classes and loops, so the loop is written out. It stops after 8 rounds.

## Append-only history

Opus 5.5 checks that earlier turns, thinking blocks included, are sent back unchanged. The session history is therefore only appended to, and `response.content` is appended whole, never reduced to its text.

## Privacy

Every question sends the page description, the question, and any orders, market views and day summaries the model looks up to Anthropic's API. The user agreed to this on 2026-10-02.
