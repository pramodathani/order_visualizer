"""Keeps the order book current by asking the event table for new rows on an interval.

Each poll asks for rows later than the newest row already seen, minus a short overlap. The overlap catches a row whose transaction committed a moment after a later row's did, so its time is a little earlier than rows already read. The order book ignores the repeats the overlap brings back.

Typical usage example:

  follower = EventFollower(reader, book, clock, poll_interval_seconds=2.0, lookback_hours=72.0)
  await follower.run()
"""

import asyncio
import logging
from typing import Any

import psycopg2

from order_visualizer.sources.event_reader import EventReader
from order_visualizer.state.order_book import OrderBook
from order_visualizer.utilities.clock import SystemClock

_LOGGER = logging.getLogger(__name__)


class EventFollower:
    """The loop that reads new event rows into the order book.

    Attributes:
        poll_interval_seconds: How long to wait between polls.
        lookback_hours: How far back the first poll reads.
        overlap_seconds: How far before the newest row seen each poll starts reading.
        batch_size: The most rows one query reads.
    """

    def __init__(
        self,
        reader: EventReader,
        book: OrderBook,
        clock: SystemClock,
        poll_interval_seconds: float,
        lookback_hours: float,
        overlap_seconds: float = 10.0,
        batch_size: int = 5000,
    ):
        """Creates the follower without reading anything.

        Args:
            reader (EventReader): Reads rows from the event table.
            book (OrderBook): Receives the rows.
            clock (SystemClock): The source of the current time.
            poll_interval_seconds (float): How long to wait between polls.
            lookback_hours (float): How far back the first poll reads.
            overlap_seconds (float): How far before the newest row seen each poll starts reading.
            batch_size (int): The most rows one query reads.
        """
        self.reader = reader
        self.book = book
        self.clock = clock
        self.poll_interval_seconds = poll_interval_seconds
        self.lookback_hours = lookback_hours
        self.overlap_seconds = overlap_seconds
        self.batch_size = batch_size
        self._newest_time = None
        self._last_success_at = None
        self._last_error = None
        self._last_error_at = None
        self._rows_loaded = 0

    async def run(self) -> None:
        """Polls until cancelled, logging failures and trying again on the next poll."""
        try:
            while True:
                try:
                    await asyncio.to_thread(self.poll_once)
                except psycopg2.Error as error:
                    self._last_error = str(error).strip()
                    self._last_error_at = self.clock.now()
                    _LOGGER.warning('Reading the event table failed: %s', self._last_error)
                await asyncio.sleep(self.poll_interval_seconds)
        finally:
            self.reader.close()

    def poll_once(self) -> int:
        """Reads every row recorded since the last poll into the book.

        Returns:
            int: How many rows were new to the book.

        Raises:
            psycopg2.Error: The database could not be reached or refused the query.
        """
        new_rows = 0
        start_time = self._start_time()
        while True:
            events = self.reader.read_since(start_time, self.batch_size)
            new_rows += self.book.apply(events)
            self._rows_loaded += len(events)
            for event in events:
                if self._newest_time is None or event.time > self._newest_time:
                    self._newest_time = event.time
            if len(events) < self.batch_size:
                break
            start_time = self._newest_time
        self._last_success_at = self.clock.now()
        self._last_error = None
        return new_rows

    def status(self) -> dict[str, Any]:
        """Describes how the follower is doing, for the page header.

        Returns:
            dict[str, Any]: The last successful poll time, the last error and its time, and how many rows have been read.
        """
        return {
            'last_success_at': self._last_success_at,
            'last_error': self._last_error,
            'last_error_at': self._last_error_at,
            'rows_loaded': self._rows_loaded,
            'poll_interval_seconds': self.poll_interval_seconds,
        }

    def _start_time(self) -> float:
        """Chooses the moment the next query reads from.

        Returns:
            float: The lookback start on the first poll, otherwise the newest row's time minus the overlap, in epoch seconds.
        """
        if self._newest_time is None:
            return self.clock.now() - self.lookback_hours * 3600.0
        return self._newest_time - self.overlap_seconds
