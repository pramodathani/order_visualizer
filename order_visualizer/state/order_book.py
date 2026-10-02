"""Every parent order the viewer knows about, rebuilt from event rows.

The follower can hand the same row over more than once, because it reads with an overlap. The book remembers which rows it has folded in and ignores repeats, which is also how the engine's own recovery treats a duplicate row.

Typical usage example:

  book = OrderBook()
  book.apply(events)
  summaries = book.summaries()
"""

import threading
from collections.abc import Iterable
from typing import Any

from order_visualizer.model.order_event import OrderEvent
from order_visualizer.model.parent_order import ParentOrder


class OrderBook:
    """The parent orders by id, with a counter that changes whenever any order changes.

    Attributes:
        change_counter: A number that grows each time an event is folded in.
    """

    def __init__(self):
        """Creates an empty book."""
        self.change_counter = 0
        self._parents = {}
        self._seen_keys = set()
        self._lock = threading.Lock()

    def apply(self, events: Iterable[OrderEvent]) -> int:
        """Folds new events into their parent orders, ignoring rows already seen.

        Args:
            events (Iterable[OrderEvent]): Rows in any order.

        Returns:
            int: How many rows were new.
        """
        new_events = []
        with self._lock:
            for event in events:
                key = event.key()
                if key in self._seen_keys:
                    continue
                self._seen_keys.add(key)
                new_events.append(event)
            new_events.sort(key=OrderEvent.key)
            for event in new_events:
                parent = self._parents.get(event.parent_order_id)
                if parent is None:
                    parent = ParentOrder(event.parent_order_id)
                    self._parents[event.parent_order_id] = parent
                parent.apply(event)
                self.change_counter += 1
        return len(new_events)

    def summaries(self) -> list[dict[str, Any]]:
        """Lists every order in its short form, newest first.

        Returns:
            list[dict[str, Any]]: One summary per parent order.
        """
        with self._lock:
            parents = list(self._parents.values())
            summaries = []
            for parent in parents:
                summaries.append(parent.to_summary())
        summaries.sort(key=self._received_at, reverse=True)
        return summaries

    def document(self, parent_order_id: str) -> dict[str, Any] | None:
        """Describes one whole order.

        Args:
            parent_order_id (str): The parent order's id.

        Returns:
            dict[str, Any] | None: The order's full document, or None when the book does not hold it.
        """
        with self._lock:
            parent = self._parents.get(parent_order_id)
            if parent is None:
                return None
            return parent.to_document()

    def version_of(self, parent_order_id: str) -> int | None:
        """Reads one order's version, which changes whenever the order changes.

        Args:
            parent_order_id (str): The parent order's id.

        Returns:
            int | None: The version, or None when the book does not hold the order.
        """
        with self._lock:
            parent = self._parents.get(parent_order_id)
            if parent is None:
                return None
            return parent.version

    @staticmethod
    def _received_at(summary: dict[str, Any]) -> float:
        """The sort key that puts the newest orders first.

        Args:
            summary (dict[str, Any]): One order's summary.

        Returns:
            float: When the order was received, or 0 when unknown.
        """
        received_at = summary.get('received_at')
        if received_at is None:
            return 0.0
        return received_at
