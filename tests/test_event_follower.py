from order_visualizer.model.order_event import OrderEvent
from order_visualizer.state.event_follower import EventFollower
from order_visualizer.state.order_book import OrderBook
from tests.event_factory import EventFactory


class FakeClock:
    """A clock that always reads the same moment."""

    def now(self) -> float:
        """Reads the fixed moment.

        Returns:
            float: 1,000,100 seconds after the epoch.
        """
        return 1_000_100.0


class FakeReader:
    """A reader that answers from a fixed list of rows and records each query."""

    def __init__(self, rows: list[OrderEvent]):
        """Creates the reader.

        Args:
            rows (list[OrderEvent]): The rows the table holds.
        """
        self.rows = rows
        self.queries = []

    def read_since(self, after_time: float, limit: int) -> list[OrderEvent]:
        """Answers like the real query: later rows, oldest first, at most limit of them.

        Args:
            after_time (float): Only rows later than this are returned.
            limit (int): The most rows to return.

        Returns:
            list[OrderEvent]: The matching rows.
        """
        self.queries.append(after_time)
        matching = []
        for row in self.rows:
            if row.time > after_time:
                matching.append(row)
        return matching[:limit]

    def close(self) -> None:
        """Does nothing, as there is no connection."""


class TestEventFollower:
    """Tests for EventFollower."""

    def test_poll_once_starts_from_the_lookback_and_then_overlaps(self):
        """The first poll reads the lookback window and the next starts ten seconds before the newest row."""
        reader = FakeReader(EventFactory().plan_rows())
        follower = EventFollower(reader, OrderBook(), FakeClock(), poll_interval_seconds=2.0, lookback_hours=1.0)
        assert follower.poll_once() == 12
        assert follower.poll_once() == 0
        assert reader.queries == [
            1_000_100.0 - 3600.0,
            1_000_012.0 - 10.0,
        ]
        assert follower.status()['rows_loaded'] == 12 + 10

    def test_poll_once_keeps_reading_while_batches_are_full(self):
        """A full batch is followed by another query from the newest row's time, until a batch comes back short."""
        reader = FakeReader(EventFactory().plan_rows())
        book = OrderBook()
        follower = EventFollower(reader, book, FakeClock(), poll_interval_seconds=2.0, lookback_hours=1.0, batch_size=5)
        assert follower.poll_once() == 12
        assert reader.queries == [
            1_000_100.0 - 3600.0,
            1_000_005.0,
            1_000_010.0,
        ]
        assert book.summaries()[0]['state'] == 'cancelled'
