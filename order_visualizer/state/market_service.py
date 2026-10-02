"""Builds the market panel of one order: the order book at a chosen moment, where each resting leg stands in it, and how similar orders ended.

Reads of the ticks table are cached for one second per instrument and moment, so any number of open browsers cause at most one read a second per instrument.

Typical usage example:

  service = MarketService(depth_reader, book, clock)
  view = service.market_view(parent_order_id, 'now')
"""

import logging
import threading
from typing import Any

import psycopg2
import psycopg2.errors

from order_visualizer.model.fill_estimator import FillEstimator
from order_visualizer.sources.depth_reader import DepthReader
from order_visualizer.state.order_book import OrderBook
from order_visualizer.utilities.clock import SystemClock

_LOGGER = logging.getLogger(__name__)
MOMENTS = (
    'now',
    'received',
    'placed',
    'ended',
)
_RESTING_STATE = 'acknowledged'
_CACHE_SECONDS = 1.0
_CACHE_LIMIT = 500


class MarketService:
    """Combines the depth reader, the estimator and the order history into one market view.

    Attributes:
        depth_reader: Reads the ticks table.
        book: The orders.
        clock: The source of the current time.
    """

    def __init__(self, depth_reader: DepthReader, book: OrderBook, clock: SystemClock):
        """Creates the service.

        Args:
            depth_reader (DepthReader): Reads the ticks table.
            book (OrderBook): The orders.
            clock (SystemClock): The source of the current time.
        """
        self.depth_reader = depth_reader
        self.book = book
        self.clock = clock
        self._estimator = FillEstimator()
        self._cache = {}
        self._lock = threading.Lock()

    def market_view(self, parent_order_id: str, moment: str) -> dict[str, Any] | None:
        """Builds the market view of one order.

        Args:
            parent_order_id (str): The order's id.
            moment (str): "now" for the live book, "received" for the book when the order arrived, "placed" for the book when each leg began resting at its broker, or "ended" for the book at its last event.

        Returns:
            dict[str, Any] | None: None when the viewer does not hold the order. Otherwise the moment used and its time, whether depth was available and why not, the snapshot shown on the ladder, the trading speed, one estimate per leg judged by the leg's state at that moment (with "placed", each leg against the book at its own resting time), and outcome counts for the order's type overall and on its instrument.

        Raises:
            ValueError: The moment is not one of "now", "received", "placed" or "ended".
        """
        if moment not in MOMENTS:
            raise ValueError(f'Unknown moment: {moment!r}')
        order = self.book.document(parent_order_id)
        if order is None:
            return None
        at_time = self._moment_time(order, moment)
        view = {
            'parent_order_id': parent_order_id,
            'moment': moment,
            'at_time': at_time,
            'available': False,
            'reason': None,
            'snapshot': None,
            'volume_per_minute': None,
            'legs': [],
            'history': {
                'synthetic_type': order['synthetic_type'],
                'all_instruments': self.book.outcome_counts(order['synthetic_type'], None),
                'this_instrument': self.book.outcome_counts(order['synthetic_type'], order['instrument_id']),
            },
        }
        instrument_id = order['instrument_id']
        if instrument_id is None:
            view['reason'] = 'The order has no instrument recorded.'
            return view
        try:
            snapshot, volume_per_minute = self._read(instrument_id, at_time)
        except psycopg2.errors.InsufficientPrivilege:
            view['reason'] = 'The viewer may not read unified.ticks yet. Run bin/grant-ticks-read once.'
            return view
        except psycopg2.Error as error:
            _LOGGER.warning('Reading depth failed: %s', str(error).strip())
            view['reason'] = f'Reading the order book failed: {str(error).strip()}'
            return view
        if snapshot is None:
            view['reason'] = 'No tick was stored for this instrument in the two minutes before that moment. The market may have been closed, or the feed was not running.'
            return view
        view['available'] = True
        view['snapshot'] = snapshot.to_document()
        view['volume_per_minute'] = volume_per_minute
        for leg in order['legs']:
            view['legs'].append(self._estimate_leg(leg, instrument_id, moment, at_time, snapshot, volume_per_minute))
        return view

    def _estimate_leg(
        self,
        leg: dict[str, Any],
        instrument_id: str,
        moment: str,
        at_time: float,
        snapshot: Any,
        volume_per_minute: float | None,
    ) -> dict[str, Any]:
        """Judges one leg against the book, using the leg's state at the moment rather than its state now.

        Args:
            leg (dict[str, Any]): The leg's document.
            instrument_id (str): The instrument's id.
            moment (str): The moment's name.
            at_time (float): The moment, in epoch seconds.
            snapshot (Any): The book at that moment.
            volume_per_minute (float | None): The trading speed at that moment.

        Returns:
            dict[str, Any]: The estimate, with the time it applies to.

        Raises:
            psycopg2.Error: Reading the book at the leg's own resting time failed.
        """
        leg_time = at_time
        if moment == 'placed':
            resting_since = self._resting_since(leg)
            if resting_since is not None:
                leg_time = resting_since
                snapshot, volume_per_minute = self._read(instrument_id, leg_time)
        state = self._state_at(leg, leg_time)
        if state is None or snapshot is None:
            estimate = {
                'leg_id': leg['leg_id'],
                'kind': 'not_placed',
                'status': 'not_placed',
                'distance': None,
                'distance_percent': None,
                'queue_ahead': None,
                'queue_beyond_visible_depth': False,
                'minutes_to_front': None,
                'explanation': 'This leg had not been placed at that moment.' if state is None else 'No tick was stored around the time this leg was placed.',
            }
        else:
            leg_at_moment = dict(leg)
            leg_at_moment['state'] = state
            estimate = self._estimator.estimate(leg_at_moment, snapshot, volume_per_minute)
        estimate['at_time'] = leg_time
        return estimate

    def _state_at(self, leg: dict[str, Any], at_time: float) -> str | None:
        """Finds a leg's state at a moment from its history.

        Args:
            leg (dict[str, Any]): The leg's document.
            at_time (float): The moment, in epoch seconds.

        Returns:
            str | None: The state it was in, or None when it had not been asked for yet.
        """
        state = None
        for change in leg['state_history']:
            if change['time'] > at_time:
                break
            state = change['state']
        return state

    def _resting_since(self, leg: dict[str, Any]) -> float | None:
        """Finds when a leg began resting at its broker.

        Args:
            leg (dict[str, Any]): The leg's document.

        Returns:
            float | None: The time of its first acknowledged state, or None when it never rested.
        """
        for change in leg['state_history']:
            if change['state'] == _RESTING_STATE:
                return change['time']
        return None

    def _moment_time(self, order: dict[str, Any], moment: str) -> float:
        """Turns a moment's name into a time; for "placed", the time the first leg began resting.

        Args:
            order (dict[str, Any]): The order's document.
            moment (str): The moment's name.

        Returns:
            float: The time in epoch seconds.
        """
        if moment == 'received' and order['received_at'] is not None:
            return order['received_at']
        if moment == 'ended' and order['updated_at'] is not None:
            return order['updated_at']
        if moment == 'placed':
            first_resting = None
            for leg in order['legs']:
                resting_since = self._resting_since(leg)
                if resting_since is not None and (first_resting is None or resting_since < first_resting):
                    first_resting = resting_since
            if first_resting is not None:
                return first_resting
            if order['received_at'] is not None:
                return order['received_at']
        return self.clock.now()

    def _read(self, instrument_id: str, at_time: float) -> tuple[Any, float | None]:
        """Reads the snapshot and trading speed, answering from the cache when a read for the same second exists.

        Args:
            instrument_id (str): The instrument's id.
            at_time (float): The moment, in epoch seconds.

        Returns:
            tuple[Any, float | None]: The snapshot or None, and the traded quantity per minute or None.

        Raises:
            psycopg2.Error: The database could not be reached or refused a query.
        """
        key = (
            instrument_id,
            int(at_time / _CACHE_SECONDS),
        )
        with self._lock:
            cached = self._cache.get(key)
            if cached is not None:
                return cached
        snapshot = self.depth_reader.read_snapshot(instrument_id, at_time)
        volume_per_minute = None
        if snapshot is not None:
            volume_per_minute = self.depth_reader.read_volume_rate(instrument_id, at_time)
        answer = (
            snapshot,
            volume_per_minute,
        )
        with self._lock:
            if len(self._cache) >= _CACHE_LIMIT:
                self._cache.clear()
            self._cache[key] = answer
        return answer
