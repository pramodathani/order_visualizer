"""Answers a question about the orders with a Claude model, letting it read the orders and change the view.

Typical usage example:

  assistant = ChatAssistant(anthropic.Anthropic(api_key=key), toolbox, 'claude-opus-5-5')
  answer = assistant.ask(session, 'Why was this plan cancelled?', view_text)
"""

import json
import logging
from typing import Any

import anthropic

from order_visualizer.chat.chat_session import ChatSession
from order_visualizer.chat.chat_toolbox import ChatToolbox

_LOGGER = logging.getLogger(__name__)
_MAXIMUM_ROUNDS = 8
_FALLBACK_BETA = 'server-side-fallback-2026-07-01'

SYSTEM_PROMPT = """You are the assistant inside a read-only 3D viewer of a trading system's order engine. The person asking runs the system and knows trading well.

What the viewer shows:
- A parent order is what a caller asked for: a plain order, a bracket, an OCO, a chaser, or a composable plan. A leg is one order the engine actually sent to a broker for it. Leg states are sending, acknowledged (resting at the broker), filled, cancelled and rejected.
- A plan is a tree of parts with dotted paths such as root.first or root.each_fill.children.0. A leg's role is its part's path. Part states are pending, waiting, working and done (with a reason such as filled or cancelled).
- The one-order view draws the plan tree across and down, with time running away from the viewer. Each leg is a tube that changes colour with its state. An order book ladder stands beside the tree at a chosen moment, with a marker at each open leg's price.
- The whole-day view is a skyline: order types across, IST minutes going back, and one column per type and minute whose height is the number of orders that arrived, coloured by how they ended.
- Order book readings (distance, queue ahead, minutes to the front) are estimates from five levels of depth and recent trading speed. Outcome counts come from the viewer's last 7 days. Say so when you use them, and never present them as predictions.

How to answer:
- Look things up with the reading tools before answering. Do not guess ids, prices or times.
- When the answer concerns something that can be seen, change the view to show it: open the order, highlight the parts or legs you are talking about, set the order book's moment, or fly to a day column. Then explain what is now on screen.
- Keep answers short: two to five plain sentences, with exact numbers and IST times. Use a short list only for several parallel items.
- You cannot place, change or cancel orders, and nothing you do changes the trading system. If asked to, say so.
- Each user message starts with a <view> block describing what the page shows right now."""


class ChatAssistant:
    """Runs the question-and-tool loop with the model.

    Attributes:
        client: The Anthropic client.
        toolbox: The tools the model may call.
        model: The model id.
    """

    def __init__(self, client: anthropic.Anthropic, toolbox: ChatToolbox, model: str):
        """Creates the assistant.

        Args:
            client (anthropic.Anthropic): The Anthropic client.
            toolbox (ChatToolbox): The tools.
            model (str): The model id, such as "claude-opus-5-5".
        """
        self.client = client
        self.toolbox = toolbox
        self.model = model
        self._tools = toolbox.definitions()

    def ask(self, session: ChatSession, question: str, view_text: str) -> dict[str, Any]:
        """Answers one question, letting the model call tools until it is done.

        Args:
            session (ChatSession): The conversation, which this appends to.
            question (str): What the person asked.
            view_text (str): A description of what the page shows now.

        Returns:
            dict[str, Any]: The conversation id, the answer text, the view commands for the browser in the order the model gave them, and whether the model declined.

        Raises:
            anthropic.APIError: The API could not be reached or refused the request.
        """
        commands = []
        with session.lock:
            session.messages.append(
                {
                    'role': 'user',
                    'content': [
                        {
                            'type': 'text',
                            'text': f'<view>\n{view_text}\n</view>',
                        },
                        {
                            'type': 'text',
                            'text': question,
                        },
                    ],
                },
            )
            for _round in range(_MAXIMUM_ROUNDS):
                response = self._request(session.messages)
                session.messages.append(
                    {
                        'role': 'assistant',
                        'content': response.content,
                    },
                )
                if response.stop_reason == 'refusal':
                    return self._answer(session, 'The model declined to answer that question.', commands, True)
                if response.stop_reason != 'tool_use':
                    text = self._text_of(response.content)
                    if response.stop_reason == 'max_tokens':
                        text += ' (The answer was cut off at its length limit.)'
                    return self._answer(session, text, commands, False)
                results = []
                for block in response.content:
                    if block.type != 'tool_use':
                        continue
                    results.append(self._run_tool(block, commands))
                session.messages.append(
                    {
                        'role': 'user',
                        'content': results,
                    },
                )
            return self._answer(session, 'I stopped after several rounds of looking things up without reaching an answer. Try a narrower question.', commands, False)

    def _request(self, messages: list[dict[str, Any]]) -> Any:
        """Sends the conversation to the model.

        Args:
            messages (list[dict[str, Any]]): The whole conversation so far.

        Returns:
            Any: The model's response message.

        Raises:
            anthropic.APIError: The API could not be reached or refused the request.
        """
        return self.client.beta.messages.create(
            model=self.model,
            max_tokens=16000,
            system=[
                {
                    'type': 'text',
                    'text': SYSTEM_PROMPT,
                    'cache_control': {
                        'type': 'ephemeral',
                    },
                },
            ],
            tools=self._tools,
            messages=messages,
            output_config={
                'effort': 'medium',
            },
            betas=[
                _FALLBACK_BETA,
            ],
            fallbacks='default',
        )

    def _run_tool(self, block: Any, commands: list[dict[str, Any]]) -> dict[str, Any]:
        """Runs one tool call and records any view commands it makes.

        Args:
            block (Any): The tool_use block.
            commands (list[dict[str, Any]]): The commands so far, which this appends to.

        Returns:
            dict[str, Any]: The tool_result block, marked as an error when the tool failed.
        """
        arguments = block.input
        if isinstance(arguments, str):
            arguments = json.loads(arguments)
        try:
            content, new_commands = self.toolbox.run(block.name, arguments)
        except (ValueError, KeyError) as error:
            _LOGGER.info('Chat tool %s failed: %s', block.name, error)
            return {
                'type': 'tool_result',
                'tool_use_id': block.id,
                'content': str(error),
                'is_error': True,
            }
        commands.extend(new_commands)
        return {
            'type': 'tool_result',
            'tool_use_id': block.id,
            'content': content,
        }

    def _text_of(self, content: list[Any]) -> str:
        """Joins the text blocks of a response.

        Args:
            content (list[Any]): The response's content blocks.

        Returns:
            str: The text, or a short note when there is none.
        """
        parts = []
        for block in content:
            if block.type == 'text':
                parts.append(block.text)
        text = '\n\n'.join(parts).strip()
        if not text:
            return 'Done.'
        return text

    def _answer(self, session: ChatSession, text: str, commands: list[dict[str, Any]], refused: bool) -> dict[str, Any]:
        """Builds the answer document for the browser.

        Args:
            session (ChatSession): The conversation.
            text (str): The answer text.
            commands (list[dict[str, Any]]): The view commands.
            refused (bool): Whether the model declined.

        Returns:
            dict[str, Any]: The answer.
        """
        return {
            'conversation_id': session.conversation_id,
            'reply': text,
            'commands': commands,
            'refused': refused,
        }
