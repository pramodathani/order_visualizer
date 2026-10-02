from order_visualizer.model.depth_snapshot import DepthLevel, DepthSnapshot
from order_visualizer.model.fill_estimator import FillEstimator


class TestFillEstimator:
    """Tests for FillEstimator, using a book shaped like IDEA's on 1 October."""

    def _snapshot(self) -> DepthSnapshot:
        """Makes a book with bids from 13.10 down and asks from 13.12 up, one paisa apart.

        Returns:
            DepthSnapshot: The book.
        """
        bids = []
        asks = []
        for index in range(5):
            bids.append(DepthLevel(price=round(13.10 - index * 0.01, 2), quantity=1000 * (index + 1), orders=10))
            asks.append(DepthLevel(price=round(13.12 + index * 0.01, 2), quantity=500 * (index + 1), orders=5))
        return DepthSnapshot(time=1_000_000.0, last_price=13.11, volume=500_000, bids=bids, asks=asks)

    def _leg(self, **fields) -> dict:
        """Makes a resting leg document.

        Args:
            **fields: Fields that differ from a resting BUY LIMIT of 1 at 13.08.

        Returns:
            dict: The leg.
        """
        leg = {
            'leg_id': 'parent:1',
            'state': 'acknowledged',
            'transaction_type': 'BUY',
            'order_type': 'LIMIT',
            'price': 13.08,
            'trigger_price': None,
        }
        leg.update(fields)
        return leg

    def test_limit_buy_counts_the_queue_at_better_and_equal_prices(self):
        """A buy at 13.08 waits behind the 13.10, 13.09 and 13.08 bids."""
        estimate = FillEstimator().estimate(self._leg(), self._snapshot(), volume_per_minute=12_000)
        assert estimate['kind'] == 'limit'
        assert estimate['status'] == 'behind_better_prices'
        assert estimate['distance'] == 0.04
        assert estimate['queue_ahead'] == 1000 + 2000 + 3000
        assert estimate['minutes_to_front'] == 1.0
        assert 'sellers would need to take about 6,000' in estimate['explanation']
        assert 'one-sided selling' in estimate['explanation']

    def test_limit_at_the_best_bid_waits_in_the_queue_at_its_price(self):
        """A buy at the best bid 13.10 waits only behind the 1,000 already there."""
        estimate = FillEstimator().estimate(self._leg(price=13.10), self._snapshot(), volume_per_minute=12_000)
        assert estimate['status'] == 'resting'
        assert estimate['queue_ahead'] == 1000
        assert 'if prices held' in estimate['explanation']

    def test_limit_that_reaches_the_other_side_is_marketable(self):
        """A buy at 13.12 meets the best ask."""
        estimate = FillEstimator().estimate(self._leg(price=13.12), self._snapshot(), volume_per_minute=None)
        assert estimate['status'] == 'marketable'

    def test_limit_beyond_the_visible_depth_says_so(self):
        """A buy below the fifth bid is behind everything visible."""
        estimate = FillEstimator().estimate(self._leg(price=12.90), self._snapshot(), volume_per_minute=None)
        assert estimate['queue_beyond_visible_depth'] is True
        assert estimate['queue_ahead'] == 15000
        assert estimate['minutes_to_front'] is None

    def test_sell_stop_measures_the_fall_to_its_trigger(self):
        """A sell stop at 12.95 needs a fall of 0.16 from 13.11."""
        leg = self._leg(transaction_type='SELL', order_type='SL', price=12.94, trigger_price=12.95)
        estimate = FillEstimator().estimate(leg, self._snapshot(), volume_per_minute=None)
        assert estimate['kind'] == 'stop'
        assert estimate['status'] == 'waiting_for_trigger'
        assert estimate['distance'] == 0.16
        assert 'fall 0.16' in estimate['explanation']

    def test_finished_leg_is_not_placed_against_the_book(self):
        """A filled leg is reported as finished."""
        estimate = FillEstimator().estimate(self._leg(state='filled'), self._snapshot(), volume_per_minute=None)
        assert estimate['kind'] == 'finished'
        assert estimate['status'] == 'filled'
