import random

from order_visualizer.model.order_event import OrderEvent
from order_visualizer.state.order_book import OrderBook
from tests.event_factory import PARENT_ID, EventFactory


class TestOrderBook:
    """Tests for OrderBook and the ParentOrder, Leg and Part classes it fills."""

    def test_apply_folds_a_plan_into_parts_and_legs(self):
        """A plan's rows become its parts, its legs and its final state."""
        book = OrderBook()
        book.apply(EventFactory().plan_rows())
        document = book.document(PARENT_ID)
        assert document['state'] == 'cancelled'
        assert document['finished'] is True
        assert document['transaction_type'] == 'BUY'
        assert document['price'] == 13.11
        assert document['plan'] == {
            'order': {
                'presets': [
                    'bracket',
                ],
            },
        }
        parts = {}
        for part in document['parts']:
            parts[part['path']] = part
        assert parts['root.first']['state'] == 'done'
        assert parts['root.first']['reason'] == 'filled'
        assert [entry['state'] for entry in parts['root.first']['state_history']] == [
            'pending',
            'working',
            'done',
        ]
        assert parts['root.each_fill.children.1']['target'] == 1
        legs = document['legs']
        assert [leg['role'] for leg in legs] == [
            'root.first',
            'root.each_fill.children.0',
        ]
        assert legs[0]['state'] == 'filled'
        assert legs[0]['filled_quantity'] == 1
        assert legs[1]['state'] == 'cancelled'
        assert legs[1]['trigger_price'] == 12.95
        assert legs[1]['cancel_requested_at'] == 1_000_010.0
        assert [entry['state'] for entry in legs[1]['state_history']] == [
            'sending',
            'acknowledged',
            'cancelled',
        ]
        assert len(document['timeline']) == 12

    def test_apply_ignores_repeated_rows(self):
        """Rows read twice because of the follower's overlap are counted once."""
        book = OrderBook()
        rows = EventFactory().plan_rows()
        assert book.apply(rows[:6]) == 6
        assert book.apply(rows[3:]) == 6
        assert book.document(PARENT_ID)['version'] == 12

    def test_apply_sorts_rows_by_sequence(self):
        """Rows handed over out of order are folded in sequence order."""
        rows = EventFactory().plan_rows()
        shuffled = list(rows)
        random.Random(7).shuffle(shuffled)
        in_order = OrderBook()
        in_order.apply(rows)
        out_of_order = OrderBook()
        out_of_order.apply(shuffled)
        assert out_of_order.document(PARENT_ID) == in_order.document(PARENT_ID)

    def test_summaries_put_the_newest_order_first(self):
        """The order list starts with the most recently received order."""
        book = OrderBook()
        rows = EventFactory().plan_rows()
        book.apply(rows)
        later = OrderEvent(
            time=2_000_000.0,
            parent_order_id='00000000-0000-0000-0000-000000000001',
            sequence=1,
            event='parent_received',
            synthetic_type='simple',
            parent_state='received',
        )
        book.apply(
            [
                later,
            ],
        )
        summaries = book.summaries()
        assert [summary['synthetic_type'] for summary in summaries] == [
            'simple',
            'plan',
        ]
        assert summaries[0]['finished'] is False

    def test_document_of_an_unknown_order_is_none(self):
        """An order the book never saw has no document and no version."""
        book = OrderBook()
        assert book.document(PARENT_ID) is None
        assert book.version_of(PARENT_ID) is None
