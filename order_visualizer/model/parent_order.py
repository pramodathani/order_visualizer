"""One parent order rebuilt from its event rows.

A parent order is what the caller asked for, such as a plain limit order, a bracket or a plan. The engine places one or more legs at brokers on its behalf. For a plan, each leg's role is the path of the part it belongs to.

Typical usage example:

  parent = ParentOrder('677a737c-...')
  for event in events:
      parent.apply(event)
  document = parent.to_document()
"""

from typing import Any

from order_visualizer.model.leg import Leg
from order_visualizer.model.order_event import OrderEvent
from order_visualizer.model.part import Part

FINISHED_STATES = frozenset(
    {
        'cancelled',
        'completed',
        'failed',
        'rejected',
    },
)


class ParentOrder:
    """One parent order with its legs, its plan parts and its timeline.

    Attributes:
        parent_order_id: The parent order's id.
        synthetic_type: The order's type, such as "plan" or "bracket".
        state: The parent's latest state, such as "working" or "completed".
        instrument_id: The instrument's id.
        transaction_type: "BUY" or "SELL".
        order_type: The order type of the request, such as "LIMIT".
        quantity: The quantity asked for.
        price: The limit price asked for.
        body: The request as the engine received it.
        plan: The plan description for a plan order, or None.
        received_at: When the engine received the order, in epoch seconds.
        updated_at: When the latest event was recorded, in epoch seconds.
        version: How many events have been folded in, which changes whenever the order changes.
        legs: The legs by leg id, in the order they were first seen.
        parts: The plan parts by path, in the order they were first seen.
        timeline: Each event in a short form, oldest first.
        state_history: Each change of the parent's state as a (time, state) pair, oldest first.
    """

    def __init__(self, parent_order_id: str):
        """Creates a parent order that has not yet seen any event.

        Args:
            parent_order_id (str): The parent order's id.
        """
        self.parent_order_id = parent_order_id
        self.synthetic_type = None
        self.state = None
        self.instrument_id = None
        self.transaction_type = None
        self.order_type = None
        self.quantity = None
        self.price = None
        self.body = None
        self.plan = None
        self.received_at = None
        self.updated_at = None
        self.version = 0
        self.legs = {}
        self.parts = {}
        self.timeline = []
        self.state_history = []

    def apply(self, event: OrderEvent) -> None:
        """Folds one event into the order.

        Events must arrive in sequence order. The order book sorts them before calling this.

        Args:
            event (OrderEvent): An event whose parent_order_id is this order's id.
        """
        if self.received_at is None:
            self.received_at = event.time
        self.updated_at = event.time
        self.version += 1
        if event.synthetic_type is not None:
            self.synthetic_type = event.synthetic_type
        if event.parent_state is not None and event.parent_state != self.state:
            self.state = event.parent_state
            self.state_history.append(
                (
                    event.time,
                    event.parent_state,
                ),
            )
        if event.event == 'parent_received':
            self._take_request(event)
        self._take_parameters(event)
        if event.leg_id is not None:
            leg = self.legs.get(event.leg_id)
            if leg is None:
                leg = Leg(event.leg_id)
                self.legs[event.leg_id] = leg
            leg.apply(event)
        self.timeline.append(
            {
                'time': event.time,
                'sequence': event.sequence,
                'event': event.event,
                'parent_state': event.parent_state,
                'leg_id': event.leg_id,
                'leg_state': event.leg_state,
                'status_message': event.status_message,
            },
        )

    def is_finished(self) -> bool:
        """Checks whether the order has reached a final state.

        Returns:
            bool: True when the state is cancelled, completed, failed or rejected.
        """
        return self.state in FINISHED_STATES

    def to_summary(self) -> dict[str, Any]:
        """Describes the order in the short form used by the order list.

        Returns:
            dict[str, Any]: The order's identifying fields, state, times and leg count.
        """
        return {
            'parent_order_id': self.parent_order_id,
            'synthetic_type': self.synthetic_type,
            'state': self.state,
            'finished': self.is_finished(),
            'instrument_id': self.instrument_id,
            'transaction_type': self.transaction_type,
            'order_type': self.order_type,
            'quantity': self.quantity,
            'price': self.price,
            'received_at': self.received_at,
            'updated_at': self.updated_at,
            'version': self.version,
            'leg_count': len(self.legs),
            'part_count': len(self.parts),
        }

    def to_overview(self) -> dict[str, Any]:
        """Describes the order in the short form used by the whole-day view.

        Returns:
            dict[str, Any]: The order's id, type, side, state, times, leg count and state history as a list of {"time", "state"} objects.
        """
        history = []
        for time, state in self.state_history:
            history.append(
                {
                    'time': time,
                    'state': state,
                },
            )
        return {
            'parent_order_id': self.parent_order_id,
            'synthetic_type': self.synthetic_type,
            'state': self.state,
            'finished': self.is_finished(),
            'transaction_type': self.transaction_type,
            'quantity': self.quantity,
            'price': self.price,
            'received_at': self.received_at,
            'updated_at': self.updated_at,
            'leg_count': len(self.legs),
            'state_history': history,
        }

    def to_document(self) -> dict[str, Any]:
        """Describes the whole order for the 3D view.

        Returns:
            dict[str, Any]: The summary fields plus the request, the plan, every leg, every part and the timeline.
        """
        legs = []
        for leg in self.legs.values():
            legs.append(leg.to_document())
        parts = []
        for part in self.parts.values():
            parts.append(part.to_document())
        document = self.to_summary()
        document['body'] = self.body
        document['plan'] = self.plan
        document['legs'] = legs
        document['parts'] = parts
        document['timeline'] = list(self.timeline)
        return document

    def _take_request(self, event: OrderEvent) -> None:
        """Copies the request's fields from the parent_received event.

        Args:
            event (OrderEvent): The parent_received event.
        """
        if event.instrument_id is not None:
            self.instrument_id = event.instrument_id
        if event.transaction_type is not None:
            self.transaction_type = event.transaction_type
        if event.detail is None:
            return
        body = event.detail.get('body')
        if not isinstance(body, dict):
            return
        self.body = body
        if self.instrument_id is None:
            self.instrument_id = body.get('instrument_id')
        if self.transaction_type is None:
            self.transaction_type = body.get('transaction_type')
        self.order_type = body.get('order_type')
        self.quantity = body.get('quantity')
        self.price = body.get('price')

    def _take_parameters(self, event: OrderEvent) -> None:
        """Copies the plan and its parts from an event that carries parameters.

        Args:
            event (OrderEvent): Any event; those without parameters are ignored.
        """
        if event.detail is None:
            return
        parameters = event.detail.get('parameters')
        if not isinstance(parameters, dict):
            return
        plan = parameters.get('plan')
        if plan is not None:
            self.plan = plan
        parts = parameters.get('parts')
        if not isinstance(parts, dict):
            return
        for path, record in parts.items():
            if not isinstance(record, dict):
                continue
            part = self.parts.get(path)
            if part is None:
                part = Part(path, event.time)
                self.parts[path] = part
            part.update(record, event.time)
