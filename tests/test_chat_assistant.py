import types

from order_visualizer.chat.chat_assistant import ChatAssistant
from order_visualizer.chat.chat_session import ChatSessions
from order_visualizer.chat.chat_toolbox import ChatToolbox
from order_visualizer.state.order_book import OrderBook
from tests.event_factory import PARENT_ID, EventFactory


class FakeMessages:
    """Plays back scripted model responses and records each request."""

    def __init__(self, responses: list[types.SimpleNamespace]):
        """Creates the fake.

        Args:
            responses (list[types.SimpleNamespace]): The responses to return, in order.
        """
        self.responses = list(responses)
        self.requests = []

    def create(self, **request) -> types.SimpleNamespace:
        """Returns the next scripted response.

        Args:
            **request: The request, recorded for checking.

        Returns:
            types.SimpleNamespace: The response.
        """
        self.requests.append(request)
        return self.responses.pop(0)


class FakeClient:
    """Stands in for anthropic.Anthropic with a scripted beta.messages."""

    def __init__(self, responses: list[types.SimpleNamespace]):
        """Creates the fake.

        Args:
            responses (list[types.SimpleNamespace]): The responses to return, in order.
        """
        self.beta = types.SimpleNamespace(messages=FakeMessages(responses))


class TestChatAssistant:
    """Tests for ChatAssistant and ChatToolbox."""

    def _assistant(self, responses: list[types.SimpleNamespace]) -> ChatAssistant:
        """Builds an assistant over a book holding the factory's plan order.

        Args:
            responses (list[types.SimpleNamespace]): The scripted model responses.

        Returns:
            ChatAssistant: The assistant.
        """
        book = OrderBook()
        book.apply(EventFactory().plan_rows())
        return ChatAssistant(FakeClient(responses), ChatToolbox(book, None), 'claude-opus-5-5')

    def _tool_call(self, identifier: str, name: str, arguments: dict) -> types.SimpleNamespace:
        """Makes a tool_use block.

        Args:
            identifier (str): The block id.
            name (str): The tool name.
            arguments (dict): The tool input.

        Returns:
            types.SimpleNamespace: The block.
        """
        return types.SimpleNamespace(type='tool_use', id=identifier, name=name, input=arguments)

    def _text(self, text: str) -> types.SimpleNamespace:
        """Makes a text block.

        Args:
            text (str): The text.

        Returns:
            types.SimpleNamespace: The block.
        """
        return types.SimpleNamespace(type='text', text=text)

    def test_ask_runs_tools_and_returns_view_commands(self):
        """The model opens the order and highlights a leg; both become commands, in order."""
        responses = [
            types.SimpleNamespace(
                stop_reason='tool_use',
                content=[
                    self._tool_call('call-1', 'show_order', {'parent_order_id': PARENT_ID}),
                    self._tool_call('call-2', 'highlight_in_order', {'part_paths': [], 'leg_ids': [f'{PARENT_ID}:2']}),
                ],
            ),
            types.SimpleNamespace(stop_reason='end_turn', content=[self._text('The stop leg was cancelled at 11:43.')]),
        ]
        assistant = self._assistant(responses)
        session = ChatSessions().get_or_create(None)
        answer = assistant.ask(session, 'Why was the stop cancelled?', 'One-order view with no order open.')
        assert answer['reply'] == 'The stop leg was cancelled at 11:43.'
        assert [command['type'] for command in answer['commands']] == [
            'show_order',
            'highlight',
        ]
        assert answer['refused'] is False
        tool_results = session.messages[2]['content']
        assert [result['tool_use_id'] for result in tool_results] == [
            'call-1',
            'call-2',
        ]
        first_request = assistant.client.beta.messages.requests[0]
        assert first_request['model'] == 'claude-opus-5-5'
        assert first_request['fallbacks'] == 'default'
        assert first_request['betas'] == [
            'server-side-fallback-2026-07-01',
        ]
        assert first_request['output_config'] == {
            'effort': 'medium',
        }

    def test_ask_reports_a_failing_tool_to_the_model(self):
        """An unknown order id comes back to the model as an error result, not an exception."""
        responses = [
            types.SimpleNamespace(stop_reason='tool_use', content=[self._tool_call('call-1', 'get_order', {'parent_order_id': 'missing'})]),
            types.SimpleNamespace(stop_reason='end_turn', content=[self._text('I could not find that order.')]),
        ]
        assistant = self._assistant(responses)
        session = ChatSessions().get_or_create(None)
        answer = assistant.ask(session, 'Show order missing', '')
        result = session.messages[2]['content'][0]
        assert result['is_error'] is True
        assert 'no order with id missing' in result['content']
        assert answer['commands'] == []

    def test_ask_says_when_the_model_declines(self):
        """A refusal is reported plainly."""
        responses = [
            types.SimpleNamespace(stop_reason='refusal', content=[]),
        ]
        answer = self._assistant(responses).ask(ChatSessions().get_or_create(None), 'Question', '')
        assert answer['refused'] is True

    def test_toolbox_day_summary_counts_the_day(self):
        """The day summary counts the plan order on its IST day."""
        book = OrderBook()
        book.apply(EventFactory().plan_rows())
        toolbox = ChatToolbox(book, None)
        content, commands = toolbox.run('day_summary', {'day': '1970-01-12'})
        assert '"orders":1' in content
        assert '"plan":1' in content
        assert commands == []

    def test_sessions_continue_a_known_conversation(self):
        """A known id returns the same conversation; an unknown one starts a new one."""
        sessions = ChatSessions()
        first = sessions.get_or_create(None)
        assert sessions.get_or_create(first.conversation_id) is first
        assert sessions.get_or_create('unknown') is not first
