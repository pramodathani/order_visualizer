"""Builds OrderEvent rows shaped like the engine's real rows, for tests."""

from typing import Any

from order_visualizer.model.order_event import OrderEvent

PARENT_ID = '677a737c-1676-493a-bd86-c796f9110db7'


class EventFactory:
    """Makes the rows of one plan order: a filled entry and a bracket whose two exits are cancelled."""

    def plan_rows(self) -> list[OrderEvent]:
        """Makes the plan order's rows in sequence order.

        Returns:
            list[OrderEvent]: Twelve rows, one second apart.
        """
        return [
            self._row(1, 'parent_received', parent_state='received', detail=self._received_detail()),
            self._row(2, 'parameters_changed', parent_state='received', detail=self._parts('working', 'pending', 'pending')),
            self._row(3, 'leg_requested', parent_state='received', leg_id=f'{PARENT_ID}:1', leg_role='root.first', leg_state='sending', quantity=1, price=13.11, transaction_type='BUY', order_type='LIMIT'),
            self._row(4, 'leg_answered', parent_state='received', leg_id=f'{PARENT_ID}:1', leg_role='root.first', leg_state='acknowledged'),
            self._row(5, 'parent_state_changed', parent_state='working'),
            self._row(6, 'leg_update', parent_state='working', leg_id=f'{PARENT_ID}:1', leg_role='root.first', leg_state='filled', filled_quantity=1),
            self._row(7, 'parameters_changed', parent_state='working', detail=self._parts('done', 'working', 'working', first_reason='filled')),
            self._row(8, 'leg_requested', parent_state='working', leg_id=f'{PARENT_ID}:2', leg_role='root.each_fill.children.0', leg_state='sending', quantity=1, price=12.94, trigger_price=12.95, transaction_type='SELL', order_type='SL'),
            self._row(9, 'leg_answered', parent_state='working', leg_id=f'{PARENT_ID}:2', leg_role='root.each_fill.children.0', leg_state='acknowledged'),
            self._row(10, 'leg_cancel_requested', parent_state='working', leg_id=f'{PARENT_ID}:2', leg_role='root.each_fill.children.0', leg_state='acknowledged'),
            self._row(11, 'parent_state_changed', parent_state='cancelled'),
            self._row(12, 'leg_update', parent_state='cancelled', leg_id=f'{PARENT_ID}:2', leg_role='root.each_fill.children.0', leg_state='cancelled'),
        ]

    def _row(self, sequence: int, event: str, **fields: Any) -> OrderEvent:
        """Makes one row of the plan order.

        Args:
            sequence (int): The row's sequence number, which also sets its time.
            event (str): The event name.
            **fields (Any): Any other OrderEvent fields.

        Returns:
            OrderEvent: The row.
        """
        return OrderEvent(
            time=1_000_000.0 + sequence,
            parent_order_id=PARENT_ID,
            sequence=sequence,
            event=event,
            synthetic_type='plan',
            **fields,
        )

    def _received_detail(self) -> dict[str, Any]:
        """Makes the detail of the parent_received row.

        Returns:
            dict[str, Any]: The request body and the first parameters.
        """
        return {
            'body': {
                'instrument_id': 'e7d0deaa-25ed-5c7b-a00b-221c8413b26a',
                'transaction_type': 'BUY',
                'order_type': 'LIMIT',
                'quantity': 1,
                'price': 13.11,
            },
            'parameters': {
                'plan': {
                    'order': {
                        'presets': [
                            'bracket',
                        ],
                    },
                },
                'parts': {
                    'root.first': {
                        'state': 'pending',
                    },
                },
            },
        }

    def _parts(self, first: str, stop: str, target: str, first_reason: str | None = None) -> dict[str, Any]:
        """Makes the detail of a parameters_changed row.

        Args:
            first (str): The state of root.first.
            stop (str): The state of root.each_fill.children.0.
            target (str): The state of root.each_fill.children.1.
            first_reason (str | None): The reason root.first finished, or None.

        Returns:
            dict[str, Any]: The parameters holding the three parts.
        """
        first_record = {
            'state': first,
        }
        if first_reason is not None:
            first_record['reason'] = first_reason
        return {
            'parameters': {
                'parts': {
                    'root.first': first_record,
                    'root.each_fill.children.0': {
                        'state': stop,
                        'target': 1,
                    },
                    'root.each_fill.children.1': {
                        'state': target,
                        'target': 1,
                    },
                },
            },
        }
