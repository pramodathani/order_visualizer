"""One conversation in the chat box, and the store that keeps recent conversations.

The history is only ever appended to. Claude Opus 5.5 checks that earlier turns, including its thinking blocks, come back unchanged, so editing or trimming the history would break the next request.

Typical usage example:

  sessions = ChatSessions()
  session = sessions.get_or_create(None)
"""

import collections
import threading
import uuid
from typing import Any

_KEPT_CONVERSATIONS = 30


class ChatSession:
    """One conversation's history.

    Attributes:
        conversation_id: The conversation's id.
        messages: The messages sent to and received from the model, oldest first.
        lock: Held while a question is being answered, so two questions in one conversation never interleave.
    """

    def __init__(self, conversation_id: str):
        """Creates an empty conversation.

        Args:
            conversation_id (str): The conversation's id.
        """
        self.conversation_id = conversation_id
        self.messages: list[dict[str, Any]] = []
        self.lock = threading.Lock()


class ChatSessions:
    """The most recent conversations, oldest dropped first."""

    def __init__(self):
        """Creates an empty store."""
        self._sessions = collections.OrderedDict()
        self._lock = threading.Lock()

    def get_or_create(self, conversation_id: str | None) -> ChatSession:
        """Finds a conversation, or starts a new one.

        Args:
            conversation_id (str | None): The id the browser holds, or None to start afresh.

        Returns:
            ChatSession: The conversation; a new one when the id is None or no longer kept.
        """
        with self._lock:
            if conversation_id is not None and conversation_id in self._sessions:
                self._sessions.move_to_end(conversation_id)
                return self._sessions[conversation_id]
            session = ChatSession(str(uuid.uuid4()))
            self._sessions[session.conversation_id] = session
            while len(self._sessions) > _KEPT_CONVERSATIONS:
                self._sessions.popitem(last=False)
            return session
