"""The chat box's route: one question in, an answer and view commands out.

This is the viewer's only route that takes a POST. It changes nothing in UBI; it only sends the question, and the orders the model looks up, to Anthropic's API.

Typical usage example:

  application.include_router(ChatRoutes(assistant, sessions, guard).router)
"""

from typing import Any

import anthropic
import fastapi
import pydantic

from order_visualizer.chat.chat_assistant import ChatAssistant
from order_visualizer.chat.chat_session import ChatSessions
from order_visualizer.chat.time_text import TimeText
from order_visualizer.security.session_guard import SessionGuard

_SWITCHED_OFF = 'The chat is switched off. Add ORDER_VISUALIZER_ANTHROPIC_API_KEY to the viewer\'s .env and restart it.'


class ChatView(pydantic.BaseModel):
    """What the page shows when the question is asked.

    Attributes:
        view: "order" or "day".
        parent_order_id: The open order, or None.
        highlighted_parts: The part paths kept bright.
        highlighted_legs: The leg ids kept bright.
        market_moment: The order book's moment, or None.
        day: The day shown in the skyline, as YYYY-MM-DD, or None.
        column_type: The order type of the chosen skyline column, or None.
        column_bucket_start: The epoch start of the chosen column's minute, or None.
    """

    view: str = 'order'
    parent_order_id: str | None = None
    highlighted_parts: list[str] = pydantic.Field(default_factory=list)
    highlighted_legs: list[str] = pydantic.Field(default_factory=list)
    market_moment: str | None = None
    day: str | None = None
    column_type: str | None = None
    column_bucket_start: float | None = None


class ChatRequest(pydantic.BaseModel):
    """The body of a chat request.

    Attributes:
        conversation_id: The conversation to continue, or None to start one.
        message: The question.
        view: What the page shows.
    """

    conversation_id: str | None = None
    message: str = pydantic.Field(min_length=1, max_length=4000)
    view: ChatView = pydantic.Field(default_factory=ChatView)


class ChatRoutes:
    """The /api/chat routes.

    Attributes:
        router: The FastAPI router holding the routes.
    """

    def __init__(self, assistant: ChatAssistant | None, sessions: ChatSessions, guard: SessionGuard):
        """Creates the routes.

        Args:
            assistant (ChatAssistant | None): Answers questions, or None when no API key is configured.
            sessions (ChatSessions): The recent conversations.
            guard (SessionGuard): Requires a logged-in session and the viewer's own header.
        """
        self.assistant = assistant
        self.sessions = sessions
        self._time_text = TimeText()
        self.router = fastapi.APIRouter(
            dependencies=[
                fastapi.Depends(guard.require_session),
            ],
        )
        self.router.add_api_route(
            '/api/chat',
            self.chat,
            methods=[
                'POST',
            ],
            dependencies=[
                fastapi.Depends(guard.require_viewer_header),
            ],
        )
        self.router.add_api_route(
            '/api/chat/status',
            self.status,
            methods=[
                'GET',
            ],
        )

    def status(self) -> dict[str, Any]:
        """Says whether the chat is switched on.

        Returns:
            dict[str, Any]: Whether it is enabled, and the reason when it is not.
        """
        if self.assistant is None:
            return {
                'enabled': False,
                'reason': _SWITCHED_OFF,
            }
        return {
            'enabled': True,
            'reason': None,
            'model': self.assistant.model,
        }

    def chat(self, body: ChatRequest) -> dict[str, Any]:
        """Answers one question.

        Args:
            body (ChatRequest): The question, the conversation id and what the page shows.

        Returns:
            dict[str, Any]: The conversation id, the answer, the view commands and whether the model declined.

        Raises:
            fastapi.HTTPException: 503 when the chat is switched off, 502 when Anthropic's API failed.
        """
        if self.assistant is None:
            raise fastapi.HTTPException(status_code=503, detail=_SWITCHED_OFF)
        session = self.sessions.get_or_create(body.conversation_id)
        try:
            return self.assistant.ask(session, body.message, self._describe(body.view))
        except anthropic.RateLimitError as error:
            raise fastapi.HTTPException(status_code=502, detail='Anthropic\'s API is rate limiting the chat; try again in a minute.') from error
        except anthropic.APIStatusError as error:
            raise fastapi.HTTPException(status_code=502, detail=f'Anthropic\'s API answered {error.status_code}: {error.message}') from error
        except anthropic.APIConnectionError as error:
            raise fastapi.HTTPException(status_code=502, detail='Anthropic\'s API could not be reached.') from error

    def _describe(self, view: ChatView) -> str:
        """Writes what the page shows as plain lines for the model.

        Args:
            view (ChatView): What the page shows.

        Returns:
            str: The description.
        """
        lines = []
        if view.view == 'day':
            lines.append(f'Whole-day skyline of {view.day or "the most recent day"}.')
            if view.column_type is not None and view.column_bucket_start is not None:
                lines.append(f'Chosen column: {view.column_type} orders that arrived at {self._time_text.minute(view.column_bucket_start)} IST.')
        else:
            if view.parent_order_id is None:
                lines.append('One-order view with no order open.')
            else:
                lines.append(f'One-order view showing order {view.parent_order_id}.')
            if view.market_moment is not None:
                lines.append(f'Order book moment: {view.market_moment}.')
            if view.highlighted_parts or view.highlighted_legs:
                lines.append(f'Highlighted parts: {view.highlighted_parts}; highlighted legs: {view.highlighted_legs}.')
        return '\n'.join(lines)
