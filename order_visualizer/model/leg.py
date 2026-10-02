"""One broker order that the engine placed on behalf of a parent order.

Typical usage example:

  leg = Leg('parent-id:1')
  leg.apply(event)
  document = leg.to_document()
"""

from typing import Any

from order_visualizer.model.order_event import OrderEvent


class Leg:
    """One broker order, with the history of its states.

    Attributes:
        leg_id: The engine's id for the leg.
        role: The leg's role, which for a plan is its part path.
        state: The leg's latest state, such as "acknowledged" or "filled".
        broker: The broker the leg went to.
        broker_order_id: The broker's own id for the order.
        transaction_type: "BUY" or "SELL".
        order_type: The order type, such as "LIMIT" or "SL-LMT".
        quantity: The quantity asked for.
        filled_quantity: The quantity filled so far.
        price: The limit price.
        trigger_price: The trigger price.
        average_price: The average fill price.
        status_message: The latest message from the broker or the engine.
        requested_at: When the engine first asked for the leg, in epoch seconds.
        cancel_requested_at: When the engine asked to cancel the leg, or None.
        state_history: Each state change as a (time, state) pair, oldest first.
    """

    def __init__(self, leg_id: str):
        """Creates a leg that has not yet seen any event.

        Args:
            leg_id (str): The engine's id for the leg.
        """
        self.leg_id = leg_id
        self.role = None
        self.state = None
        self.broker = None
        self.broker_order_id = None
        self.transaction_type = None
        self.order_type = None
        self.quantity = None
        self.filled_quantity = None
        self.price = None
        self.trigger_price = None
        self.average_price = None
        self.status_message = None
        self.requested_at = None
        self.cancel_requested_at = None
        self.state_history = []

    def apply(self, event: OrderEvent) -> None:
        """Folds one event about this leg into its state.

        Args:
            event (OrderEvent): An event whose leg_id is this leg's id.
        """
        if self.requested_at is None:
            self.requested_at = event.time
        if event.event == 'leg_cancel_requested' and self.cancel_requested_at is None:
            self.cancel_requested_at = event.time
        if event.leg_role is not None:
            self.role = event.leg_role
        if event.broker is not None:
            self.broker = event.broker
        if event.broker_order_id is not None:
            self.broker_order_id = event.broker_order_id
        if event.transaction_type is not None:
            self.transaction_type = event.transaction_type
        if event.order_type is not None:
            self.order_type = event.order_type
        if event.quantity is not None:
            self.quantity = event.quantity
        if event.filled_quantity is not None:
            self.filled_quantity = event.filled_quantity
        if event.price is not None:
            self.price = event.price
        if event.trigger_price is not None:
            self.trigger_price = event.trigger_price
        if event.average_price is not None:
            self.average_price = event.average_price
        if event.status_message is not None:
            self.status_message = event.status_message
        if event.leg_state is not None and event.leg_state != self.state:
            self.state = event.leg_state
            self.state_history.append(
                (
                    event.time,
                    event.leg_state,
                ),
            )

    def to_document(self) -> dict[str, Any]:
        """Describes the leg for the browser.

        Returns:
            dict[str, Any]: The leg's fields, with its state history as a list of {"time", "state"} objects.
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
            'leg_id': self.leg_id,
            'role': self.role,
            'state': self.state,
            'broker': self.broker,
            'broker_order_id': self.broker_order_id,
            'transaction_type': self.transaction_type,
            'order_type': self.order_type,
            'quantity': self.quantity,
            'filled_quantity': self.filled_quantity,
            'price': self.price,
            'trigger_price': self.trigger_price,
            'average_price': self.average_price,
            'status_message': self.status_message,
            'requested_at': self.requested_at,
            'cancel_requested_at': self.cancel_requested_at,
            'state_history': history,
        }
