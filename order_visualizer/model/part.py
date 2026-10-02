"""One part of a plan, such as `root.first` or `root.each_fill.children.0`.

Typical usage example:

  part = Part('root.first')
  part.update({'state': 'working'}, event_time)
"""

from typing import Any


class Part:
    """One node of a plan's tree of parts, with the history of its states.

    Attributes:
        path: The part's dotted path, such as "root.each_fill.children.0".
        state: The part's latest state, such as "pending", "working" or "done", or None when the engine never gave one.
        reason: Why a finished part finished, such as "filled" or "cancelled", or None.
        target: The quantity the part aims for, or None.
        first_seen_at: When the part first appeared, in epoch seconds.
        state_history: Each state change as a (time, state, reason) tuple, oldest first.
    """

    def __init__(self, path: str, first_seen_at: float):
        """Creates a part with no state yet.

        Args:
            path (str): The part's dotted path.
            first_seen_at (float): When the part first appeared, in epoch seconds.
        """
        self.path = path
        self.state = None
        self.reason = None
        self.target = None
        self.first_seen_at = first_seen_at
        self.state_history = []

    def update(self, record: dict[str, Any], time: float) -> None:
        """Takes the part's record from a plan's `parts` map.

        Args:
            record (dict[str, Any]): The part's record, holding any of "state", "reason" and "target".
            time (float): When the record was written, in epoch seconds.
        """
        self.target = record.get('target', self.target)
        state = record.get('state')
        reason = record.get('reason')
        if state is None:
            return
        if state != self.state or reason != self.reason:
            self.state = state
            self.reason = reason
            self.state_history.append(
                (
                    time,
                    state,
                    reason,
                ),
            )

    def to_document(self) -> dict[str, Any]:
        """Describes the part for the browser.

        Returns:
            dict[str, Any]: The part's fields, with its state history as a list of {"time", "state", "reason"} objects.
        """
        history = []
        for time, state, reason in self.state_history:
            history.append(
                {
                    'time': time,
                    'state': state,
                    'reason': reason,
                },
            )
        return {
            'path': self.path,
            'state': self.state,
            'reason': self.reason,
            'target': self.target,
            'first_seen_at': self.first_seen_at,
            'state_history': history,
        }
