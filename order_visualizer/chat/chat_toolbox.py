"""The tools the chat model may call: some read the orders, and some change what the page shows.

Reading tools answer from the viewer's own memory and market service, so a question never adds a query to UBI beyond what the market panel already makes. View tools change nothing here; each one records a command that the browser carries out after the answer arrives.

Typical usage example:

  toolbox = ChatToolbox(book, market_service)
  result, commands = toolbox.run('show_order', {'parent_order_id': '...'})
"""

import json
from typing import Any

from order_visualizer.chat.time_text import TimeText
from order_visualizer.state.market_service import MarketService
from order_visualizer.state.order_book import OrderBook

_LIST_LIMIT = 60


class ChatToolbox:
    """The chat model's tools, their definitions and their behaviour.

    Attributes:
        book: The orders.
        market_service: Builds market views, or None when depth is not wired in.
    """

    def __init__(self, book: OrderBook, market_service: MarketService | None):
        """Creates the toolbox.

        Args:
            book (OrderBook): The orders.
            market_service (MarketService | None): Builds market views, or None.
        """
        self.book = book
        self.market_service = market_service
        self._time_text = TimeText()

    def definitions(self) -> list[dict[str, Any]]:
        """Describes every tool for the Messages API, in a fixed order so the prompt cache stays valid.

        Returns:
            list[dict[str, Any]]: The tool definitions, each with a strict JSON schema.
        """
        return [
            self._tool(
                'list_orders',
                'Lists parent orders the viewer holds (the last 7 days), newest first, with optional filters. Use it to find orders by type, state or day.',
                {
                    'synthetic_type': self._nullable('string', 'Only this order type, such as "plan", "bracket" or "simple"; null for every type.'),
                    'state': self._nullable('string', 'Only this parent state, such as "working", "completed", "cancelled" or "rejected"; null for every state.'),
                    'day': self._nullable('string', 'Only orders received on this IST day, as YYYY-MM-DD; null for every day.'),
                },
            ),
            self._tool(
                'get_order',
                'Reads one order in full: its request, plan, parts with their state history, legs with their state history, and every event.',
                {
                    'parent_order_id': self._string('The order id.'),
                },
            ),
            self._tool(
                'get_market',
                'Reads the order book around one order at a moment, where each resting leg stands in it (distance, queue ahead, minutes to the front), and how finished orders of the same type ended. Readings are estimates.',
                {
                    'parent_order_id': self._string('The order id.'),
                    'moment': self._choice(
                        [
                            'now',
                            'received',
                            'placed',
                            'ended',
                        ],
                        'now for the live book (working orders only), received for when the order arrived, placed for each leg against the book when that leg began resting (best for judging a finished order\'s legs), ended for its last event.',
                    ),
                },
            ),
            self._tool(
                'day_summary',
                'Summarises one IST day: order counts by type and by final state, and the busiest minutes by type.',
                {
                    'day': self._string('The IST day as YYYY-MM-DD.'),
                },
            ),
            self._tool(
                'show_order',
                'Switches the page to the one-order view and opens this order as a 3D plan tree.',
                {
                    'parent_order_id': self._string('The order id.'),
                },
            ),
            self._tool(
                'highlight_in_order',
                'In the one-order view, keeps the named parts and legs bright and dims everything else. Call show_order first if the order is not open.',
                {
                    'part_paths': self._string_list('Part paths to keep bright, such as "root.each_fill.children.0"; may be empty.'),
                    'leg_ids': self._string_list('Leg ids to keep bright; may be empty.'),
                },
            ),
            self._tool(
                'clear_highlight',
                'Removes any highlight in the one-order view.',
                {},
            ),
            self._tool(
                'set_market_moment',
                'Changes which moment the order book beside the open order shows.',
                {
                    'moment': self._choice(
                        [
                            'now',
                            'received',
                            'placed',
                            'ended',
                        ],
                        'now, received, placed or ended.',
                    ),
                },
            ),
            self._tool(
                'show_day',
                'Switches the page to the whole-day skyline for one IST day.',
                {
                    'day': self._string('The IST day as YYYY-MM-DD.'),
                },
            ),
            self._tool(
                'focus_day_column',
                'In the whole-day skyline, flies the camera to one column (the orders of one type that arrived in one IST minute), outlines it and lists its orders.',
                {
                    'day': self._string('The IST day as YYYY-MM-DD.'),
                    'synthetic_type': self._string('The order type of the column.'),
                    'minute': self._string('The IST minute as HH:MM.'),
                },
            ),
        ]

    def run(self, name: str, arguments: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
        """Runs one tool.

        Args:
            name (str): The tool's name.
            arguments (dict[str, Any]): Its arguments, already checked against its schema by the API.

        Returns:
            tuple[str, list[dict[str, Any]]]: The result as JSON text for the model, and the view commands for the browser.

        Raises:
            ValueError: The tool is unknown, or an argument names something the viewer does not hold.
        """
        if name == 'list_orders':
            return self._json(self._list_orders(arguments)), []
        if name == 'get_order':
            return self._json(self._get_order(arguments['parent_order_id'])), []
        if name == 'get_market':
            return self._json(self._get_market(arguments['parent_order_id'], arguments['moment'])), []
        if name == 'day_summary':
            return self._json(self._day_summary(arguments['day'])), []
        if name == 'show_order':
            self._get_order(arguments['parent_order_id'])
            return 'The page now shows this order.', [
                {
                    'type': 'show_order',
                    'parent_order_id': arguments['parent_order_id'],
                },
            ]
        if name == 'highlight_in_order':
            return 'The named parts and legs are bright and the rest is dimmed.', [
                {
                    'type': 'highlight',
                    'part_paths': arguments['part_paths'],
                    'leg_ids': arguments['leg_ids'],
                },
            ]
        if name == 'clear_highlight':
            return 'The highlight is cleared.', [
                {
                    'type': 'highlight',
                    'part_paths': [],
                    'leg_ids': [],
                    'clear': True,
                },
            ]
        if name == 'set_market_moment':
            return f'The order book now shows the moment "{arguments["moment"]}".', [
                {
                    'type': 'market_moment',
                    'moment': arguments['moment'],
                },
            ]
        if name == 'show_day':
            return f'The page now shows the skyline of {arguments["day"]}.', [
                {
                    'type': 'show_day',
                    'day': arguments['day'],
                },
            ]
        if name == 'focus_day_column':
            bucket_start = self._time_text.minute_start(arguments['day'], arguments['minute'])
            return 'The camera is on that column and its orders are listed.', [
                {
                    'type': 'focus_day_column',
                    'day': arguments['day'],
                    'synthetic_type': arguments['synthetic_type'],
                    'bucket_start': bucket_start,
                },
            ]
        raise ValueError(f'Unknown tool: {name!r}')

    def _list_orders(self, arguments: dict[str, Any]) -> dict[str, Any]:
        """Lists orders matching the filters.

        Args:
            arguments (dict[str, Any]): The optional type, state and day filters.

        Returns:
            dict[str, Any]: How many matched, and up to 60 of them in short form.
        """
        matching = []
        for summary in self.book.summaries():
            if arguments['synthetic_type'] is not None and summary['synthetic_type'] != arguments['synthetic_type']:
                continue
            if arguments['state'] is not None and summary['state'] != arguments['state']:
                continue
            received_day = None
            if summary['received_at'] is not None:
                received_day = self._time_text.day(summary['received_at'])
            if arguments['day'] is not None and received_day != arguments['day']:
                continue
            matching.append(summary)
        return {
            'matching': len(matching),
            'shown': min(len(matching), _LIST_LIMIT),
            'orders': self._time_text.readable(matching[:_LIST_LIMIT]),
        }

    def _get_order(self, parent_order_id: str) -> dict[str, Any]:
        """Reads one order.

        Args:
            parent_order_id (str): The order id.

        Returns:
            dict[str, Any]: The order's document with times as IST text.

        Raises:
            ValueError: The viewer does not hold the order.
        """
        document = self.book.document(parent_order_id)
        if document is None:
            raise ValueError(f'The viewer holds no order with id {parent_order_id}.')
        return self._time_text.readable(document)

    def _get_market(self, parent_order_id: str, moment: str) -> dict[str, Any]:
        """Reads the market view of one order.

        Args:
            parent_order_id (str): The order id.
            moment (str): "now", "received", "placed" or "ended".

        Returns:
            dict[str, Any]: The market view with times as IST text.

        Raises:
            ValueError: The order book is not wired in, or the viewer does not hold the order.
        """
        if self.market_service is None:
            raise ValueError('The order book is not available in this viewer.')
        view = self.market_service.market_view(parent_order_id, moment)
        if view is None:
            raise ValueError(f'The viewer holds no order with id {parent_order_id}.')
        return self._time_text.readable(view)

    def _day_summary(self, day: str) -> dict[str, Any]:
        """Summarises one IST day.

        Args:
            day (str): The day as YYYY-MM-DD.

        Returns:
            dict[str, Any]: Totals, counts by type and by state, and the 15 busiest type-and-minute columns with their outcome counts.
        """
        by_type = {}
        by_state = {}
        columns = {}
        total = 0
        for overview in self.book.overviews():
            if overview['received_at'] is None or self._time_text.day(overview['received_at']) != day:
                continue
            total += 1
            order_type = overview['synthetic_type'] or 'order'
            state = overview['state'] or 'unknown'
            by_type[order_type] = by_type.get(order_type, 0) + 1
            by_state[state] = by_state.get(state, 0) + 1
            key = (
                order_type,
                self._time_text.minute(overview['received_at']),
            )
            column = columns.get(key)
            if column is None:
                column = {
                    'synthetic_type': order_type,
                    'minute': key[1],
                    'orders': 0,
                    'states': {},
                }
                columns[key] = column
            column['orders'] += 1
            column['states'][state] = column['states'].get(state, 0) + 1
        busiest = sorted(columns.values(), key=self._column_size, reverse=True)[:15]
        return {
            'day': day,
            'orders': total,
            'by_type': by_type,
            'by_state': by_state,
            'busiest_columns': busiest,
        }

    @staticmethod
    def _column_size(column: dict[str, Any]) -> int:
        """The sort key for the busiest columns.

        Args:
            column (dict[str, Any]): One column.

        Returns:
            int: Its order count.
        """
        return column['orders']

    def _json(self, value: Any) -> str:
        """Writes a tool result as compact JSON.

        Args:
            value (Any): The result.

        Returns:
            str: The JSON text.
        """
        return json.dumps(value, separators=(',', ':'), default=str)

    def _tool(self, name: str, description: str, properties: dict[str, Any]) -> dict[str, Any]:
        """Builds one strict tool definition.

        Args:
            name (str): The tool's name.
            description (str): What it does and when to use it.
            properties (dict[str, Any]): Its parameters, every one required.

        Returns:
            dict[str, Any]: The definition.
        """
        return {
            'name': name,
            'description': description,
            'strict': True,
            'input_schema': {
                'type': 'object',
                'properties': properties,
                'required': list(properties),
                'additionalProperties': False,
            },
        }

    def _string(self, description: str) -> dict[str, Any]:
        """Describes a text parameter.

        Args:
            description (str): What it holds.

        Returns:
            dict[str, Any]: The schema.
        """
        return {
            'type': 'string',
            'description': description,
        }

    def _nullable(self, kind: str, description: str) -> dict[str, Any]:
        """Describes a parameter that may be null.

        Args:
            kind (str): The JSON type when it is not null.
            description (str): What it holds.

        Returns:
            dict[str, Any]: The schema.
        """
        return {
            'type': [
                kind,
                'null',
            ],
            'description': description,
        }

    def _choice(self, options: list[str], description: str) -> dict[str, Any]:
        """Describes a text parameter limited to a few values.

        Args:
            options (list[str]): The allowed values.
            description (str): What it chooses.

        Returns:
            dict[str, Any]: The schema.
        """
        return {
            'type': 'string',
            'enum': options,
            'description': description,
        }

    def _string_list(self, description: str) -> dict[str, Any]:
        """Describes a list of text values.

        Args:
            description (str): What the list holds.

        Returns:
            dict[str, Any]: The schema.
        """
        return {
            'type': 'array',
            'items': {
                'type': 'string',
            },
            'description': description,
        }
