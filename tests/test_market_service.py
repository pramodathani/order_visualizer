import psycopg2.errors

from order_visualizer.model.depth_snapshot import DepthLevel, DepthSnapshot
from order_visualizer.state.market_service import MarketService
from order_visualizer.state.order_book import OrderBook
from tests.event_factory import PARENT_ID, EventFactory
from tests.test_event_follower import FakeClock


class FakeDepthReader:
    """A depth reader that answers from one fixed snapshot and counts reads."""

    def __init__(self, refuse: bool = False):
        """Creates the reader.

        Args:
            refuse (bool): Whether every read fails as if the grant were missing.
        """
        self.refuse = refuse
        self.reads = 0

    def read_snapshot(self, instrument_id: str, at_time: float, window_seconds: float = 120.0) -> DepthSnapshot:
        """Returns the fixed snapshot.

        Args:
            instrument_id (str): Ignored.
            at_time (float): Ignored.
            window_seconds (float): Ignored.

        Returns:
            DepthSnapshot: A book with a bid at 13.10 and an ask at 13.12.

        Raises:
            psycopg2.errors.InsufficientPrivilege: When the reader was made to refuse.
        """
        del instrument_id, at_time, window_seconds
        self.reads += 1
        if self.refuse:
            raise psycopg2.errors.InsufficientPrivilege('permission denied for table ticks')
        return DepthSnapshot(
            time=1_000_000.0,
            last_price=13.11,
            volume=1000,
            bids=[
                DepthLevel(price=13.10, quantity=100, orders=1),
            ],
            asks=[
                DepthLevel(price=13.12, quantity=100, orders=1),
            ],
        )

    def read_volume_rate(self, instrument_id: str, at_time: float, window_seconds: float = 300.0) -> float:
        """Returns a fixed trading speed.

        Args:
            instrument_id (str): Ignored.
            at_time (float): Ignored.
            window_seconds (float): Ignored.

        Returns:
            float: 600 per minute.
        """
        del instrument_id, at_time, window_seconds
        return 600.0


class TestMarketService:
    """Tests for MarketService."""

    def _book(self) -> OrderBook:
        """Makes a book holding the factory's plan order.

        Returns:
            OrderBook: The book.
        """
        book = OrderBook()
        book.apply(EventFactory().plan_rows())
        return book

    def test_market_view_estimates_every_leg_and_counts_history(self):
        """The view carries the snapshot, one estimate per leg and the type's outcome counts."""
        service = MarketService(FakeDepthReader(), self._book(), FakeClock())
        view = service.market_view(PARENT_ID, 'ended')
        assert view['available'] is True
        assert view['at_time'] == 1_000_012.0
        assert len(view['legs']) == 2
        assert view['legs'][0]['kind'] == 'finished'
        assert view['history']['all_instruments'] == {
            'cancelled': 1,
        }

    def test_market_view_judges_legs_by_their_state_at_the_moment(self):
        """When the order arrived no leg existed; when placed, each leg is judged while resting at its own time."""
        service = MarketService(FakeDepthReader(), self._book(), FakeClock())
        received = service.market_view(PARENT_ID, 'received')
        assert [leg['kind'] for leg in received['legs']] == [
            'not_placed',
            'not_placed',
        ]
        placed = service.market_view(PARENT_ID, 'placed')
        assert placed['at_time'] == 1_000_004.0
        assert [leg['at_time'] for leg in placed['legs']] == [
            1_000_004.0,
            1_000_009.0,
        ]
        assert placed['legs'][0]['kind'] == 'limit'
        assert placed['legs'][0]['status'] == 'resting'
        assert placed['legs'][1]['kind'] == 'stop'
        assert placed['legs'][1]['status'] == 'waiting_for_trigger'

    def test_market_view_reads_once_per_second_per_instrument(self):
        """A second request for the same moment is answered from the cache."""
        reader = FakeDepthReader()
        service = MarketService(reader, self._book(), FakeClock())
        service.market_view(PARENT_ID, 'now')
        service.market_view(PARENT_ID, 'now')
        assert reader.reads == 1

    def test_market_view_explains_a_missing_grant(self):
        """Without SELECT on unified.ticks the view says how to fix it."""
        service = MarketService(FakeDepthReader(refuse=True), self._book(), FakeClock())
        view = service.market_view(PARENT_ID, 'now')
        assert view['available'] is False
        assert 'bin/grant-ticks-read' in view['reason']

    def test_market_view_of_an_unknown_order_is_none(self):
        """An order the viewer does not hold has no view."""
        service = MarketService(FakeDepthReader(), self._book(), FakeClock())
        assert service.market_view('00000000-0000-0000-0000-000000000000', 'now') is None
