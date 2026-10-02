"""One row of UBI's `unified.synthetic_order_events` table.

Typical usage example:

  event = OrderEvent(time=..., parent_order_id='...', sequence=1, event='parent_received')
"""

import dataclasses
from typing import Any


@dataclasses.dataclass(frozen=True)
class OrderEvent:
    """One transition the order engine recorded.

    Attributes:
        time: When the engine recorded the transition, in epoch seconds.
        parent_order_id: The parent order's id.
        sequence: The transition's number within its parent, counted from 1.
        event: What happened, such as "leg_requested" or "parent_state_changed".
        synthetic_type: The parent's type, such as "plan" or "bracket", or None.
        parent_state: The parent's state after the transition, or None.
        leg_id: The leg the transition is about, or None.
        leg_role: The leg's role, which for a plan is its part path, or None.
        leg_state: The leg's state after the transition, or None.
        broker: The broker the leg was sent to, or None.
        broker_order_id: The broker's order id for the leg, or None.
        instrument_id: The instrument's id, or None.
        transaction_type: "BUY" or "SELL", or None.
        order_type: The order type, such as "LIMIT", or None.
        quantity: The quantity asked for, or None.
        filled_quantity: The quantity filled so far, or None.
        price: The limit price, or None.
        trigger_price: The trigger price, or None.
        average_price: The average fill price, or None.
        outcome: The engine's outcome word for the transition, or None.
        status_message: The broker's or engine's message, or None.
        detail: The JSON detail of the row, or None.
    """

    time: float
    parent_order_id: str
    sequence: int
    event: str
    synthetic_type: str | None = None
    parent_state: str | None = None
    leg_id: str | None = None
    leg_role: str | None = None
    leg_state: str | None = None
    broker: str | None = None
    broker_order_id: str | None = None
    instrument_id: str | None = None
    transaction_type: str | None = None
    order_type: str | None = None
    quantity: int | None = None
    filled_quantity: int | None = None
    price: float | None = None
    trigger_price: float | None = None
    average_price: float | None = None
    outcome: str | None = None
    status_message: str | None = None
    detail: dict[str, Any] | None = None

    def key(self) -> tuple[str, int]:
        """The identity of the row, which the engine never reuses.

        Returns:
            tuple[str, int]: The parent order id and the sequence number.
        """
        return (
            self.parent_order_id,
            self.sequence,
        )
