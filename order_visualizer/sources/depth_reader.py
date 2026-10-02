"""Reads one instrument's order book from UBI's `unified.ticks` table, and nothing else.

`unified.ticks` is very large. Every query here names one instrument and a short time window, so it is answered from the `(instrument_id, time DESC)` index in a few milliseconds. A query without both would scan whole days of ticks, which is the kind of load on UBI's database this project must never cause.

Typical usage example:

  reader = DepthReader(address, 'order_visualizer_reader', password)
  snapshot = reader.read_snapshot(instrument_id, at_time=time.time())
"""

import threading
from typing import Any

import psycopg2
import psycopg2.extensions

from order_visualizer.configuration.database_address import DatabaseAddress
from order_visualizer.model.depth_snapshot import DepthLevel, DepthSnapshot

LEVELS = 5

_LEVEL_COLUMNS = []
for _side in (
    'bid',
    'ask',
):
    for _level in range(1, LEVELS + 1):
        _LEVEL_COLUMNS.append(f'{_side}{_level}_price')
        _LEVEL_COLUMNS.append(f'{_side}{_level}_quantity')
        _LEVEL_COLUMNS.append(f'{_side}{_level}_orders')

_SNAPSHOT_QUERY = (
    'SELECT extract(epoch from "time")::double precision, last_price, volume, '
    f'{", ".join(_LEVEL_COLUMNS)} '
    'FROM unified.ticks '
    'WHERE instrument_id = %s '
    'AND "time" <= to_timestamp(%s) '
    'AND "time" > to_timestamp(%s) '
    'ORDER BY "time" DESC '
    'LIMIT 1'
)

_EARLIEST_VOLUME_QUERY = (
    'SELECT extract(epoch from "time")::double precision, volume '
    'FROM unified.ticks '
    'WHERE instrument_id = %s '
    'AND "time" <= to_timestamp(%s) '
    'AND "time" > to_timestamp(%s) '
    'AND volume IS NOT NULL '
    'ORDER BY "time" ASC '
    'LIMIT 1'
)


class DepthReader:
    """A read-only connection to the ticks table, shared safely between request threads.

    Attributes:
        address: Where UBI's database listens.
        username: The read-only role's name.
        statement_timeout_milliseconds: How long one query may run before the database stops it.
    """

    def __init__(
        self,
        address: DatabaseAddress,
        username: str,
        password: str,
        statement_timeout_milliseconds: int = 2000,
    ):
        """Creates the reader without connecting.

        Args:
            address (DatabaseAddress): Where UBI's database listens.
            username (str): The read-only role's name.
            password (str): The read-only role's password.
            statement_timeout_milliseconds (int): How long one query may run before the database stops it.
        """
        self.address = address
        self.username = username
        self.statement_timeout_milliseconds = statement_timeout_milliseconds
        self._password = password
        self._connection = None
        self._lock = threading.Lock()

    def read_snapshot(self, instrument_id: str, at_time: float, window_seconds: float = 120.0) -> DepthSnapshot | None:
        """Reads the newest tick of one instrument at or before a moment.

        Args:
            instrument_id (str): The instrument's id.
            at_time (float): The moment, in epoch seconds.
            window_seconds (float): How far before the moment to look; an older tick is treated as missing.

        Returns:
            DepthSnapshot | None: The book at that moment, or None when no tick falls in the window.

        Raises:
            psycopg2.Error: The database could not be reached, refused the query, or the role lacks SELECT on unified.ticks.
        """
        row = self._fetch_one(
            _SNAPSHOT_QUERY,
            (
                instrument_id,
                at_time,
                at_time - window_seconds,
            ),
        )
        if row is None:
            return None
        return self._snapshot_from_row(row)

    def read_volume_rate(self, instrument_id: str, at_time: float, window_seconds: float = 300.0) -> float | None:
        """Works out how fast the instrument traded over the minutes before a moment.

        Args:
            instrument_id (str): The instrument's id.
            at_time (float): The end of the window, in epoch seconds.
            window_seconds (float): The length of the window.

        Returns:
            float | None: The quantity traded per minute, or None when the window holds too little to tell.

        Raises:
            psycopg2.Error: The database could not be reached or refused the query.
        """
        latest = self.read_snapshot(instrument_id, at_time, window_seconds)
        if latest is None or latest.volume is None:
            return None
        earliest = self._fetch_one(
            _EARLIEST_VOLUME_QUERY,
            (
                instrument_id,
                at_time,
                at_time - window_seconds,
            ),
        )
        if earliest is None:
            return None
        earliest_time, earliest_volume = earliest
        elapsed = latest.time - earliest_time
        if elapsed < 30 or latest.volume < earliest_volume:
            return None
        return (latest.volume - earliest_volume) / elapsed * 60.0

    def close(self) -> None:
        """Closes the connection if one is open."""
        with self._lock:
            if self._connection is None:
                return
            try:
                self._connection.close()
            finally:
                self._connection = None

    def _fetch_one(self, query: str, parameters: tuple[Any, ...]) -> tuple[Any, ...] | None:
        """Runs one query and returns its first row.

        Args:
            query (str): The query.
            parameters (tuple[Any, ...]): Its parameters.

        Returns:
            tuple[Any, ...] | None: The first row, or None when there is none.

        Raises:
            psycopg2.Error: The database could not be reached or refused the query. The connection is closed, so the next call connects again.
        """
        with self._lock:
            connection = self._open_connection()
            try:
                with connection.cursor() as cursor:
                    cursor.execute(query, parameters)
                    return cursor.fetchone()
            except psycopg2.Error:
                connection.close()
                self._connection = None
                raise

    def _open_connection(self) -> psycopg2.extensions.connection:
        """Returns the open connection, connecting first when there is none. The caller must hold the lock.

        Returns:
            psycopg2.extensions.connection: A connection in read-only autocommit mode.

        Raises:
            psycopg2.Error: The database could not be reached or refused the login.
        """
        if self._connection is not None and not self._connection.closed:
            return self._connection
        options = f'-c default_transaction_read_only=on -c statement_timeout={self.statement_timeout_milliseconds}'
        connection = psycopg2.connect(
            host=self.address.host,
            port=self.address.port,
            dbname=self.address.database,
            user=self.username,
            password=self._password,
            connect_timeout=5,
            application_name='order_visualizer_depth',
            options=options,
        )
        connection.set_session(
            readonly=True,
            autocommit=True,
        )
        self._connection = connection
        return connection

    def _snapshot_from_row(self, row: tuple[Any, ...]) -> DepthSnapshot:
        """Turns one result row into a snapshot, leaving out empty levels.

        Args:
            row (tuple[Any, ...]): The time, last price, volume and then price, quantity and orders for each bid level and each ask level.

        Returns:
            DepthSnapshot: The snapshot.
        """
        bids = []
        asks = []
        for index in range(LEVELS * 2):
            offset = 3 + index * 3
            price = row[offset]
            quantity = row[offset + 1]
            if price is None or quantity is None or quantity <= 0:
                continue
            level = DepthLevel(price=float(price), quantity=int(quantity), orders=row[offset + 2])
            if index < LEVELS:
                bids.append(level)
            else:
                asks.append(level)
        last_price = None
        if row[1] is not None:
            last_price = float(row[1])
        return DepthSnapshot(
            time=row[0],
            last_price=last_price,
            volume=row[2],
            bids=bids,
            asks=asks,
        )
