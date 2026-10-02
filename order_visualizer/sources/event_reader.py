"""Reads rows from UBI's `unified.synthetic_order_events` table, and nothing else.

The connection logs in as the viewer's own role, which may only SELECT from that one table. The session is also marked read-only and given a statement timeout, so a mistake on this side cannot write to the table or hold a query open against it.

Typical usage example:

  reader = EventReader(address, 'order_visualizer_reader', password)
  events = reader.read_since(after_time=0.0, limit=5000)
  reader.close()
"""

import decimal
from typing import Any

import psycopg2
import psycopg2.extensions

from order_visualizer.configuration.database_address import DatabaseAddress
from order_visualizer.model.order_event import OrderEvent

_COLUMNS = (
    'extract(epoch from "time")::double precision',
    'parent_order_id::text',
    'sequence',
    'event',
    'synthetic_type',
    'parent_state',
    'leg_id',
    'leg_role',
    'leg_state',
    'broker',
    'broker_order_id',
    'instrument_id::text',
    'transaction_type',
    'order_type',
    'quantity',
    'filled_quantity',
    'price',
    'trigger_price',
    'average_price',
    'outcome',
    'status_message',
    'detail',
)

_READ_SINCE_QUERY = (
    f'SELECT {", ".join(_COLUMNS)} '
    'FROM unified.synthetic_order_events '
    'WHERE "time" > to_timestamp(%s) '
    'ORDER BY "time", parent_order_id, sequence '
    'LIMIT %s'
)


class EventReader:
    """A read-only connection to the event table.

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
        statement_timeout_milliseconds: int = 5000,
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

    def read_since(self, after_time: float, limit: int) -> list[OrderEvent]:
        """Reads the rows recorded after a moment, oldest first.

        Args:
            after_time (float): Only rows whose time is later than this, in epoch seconds, are read.
            limit (int): The most rows to read in one call.

        Returns:
            list[OrderEvent]: The rows, ordered by time, parent order id and sequence.

        Raises:
            psycopg2.Error: The database could not be reached or refused the query. The connection is closed, so the next call connects again.
        """
        connection = self._open_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    _READ_SINCE_QUERY,
                    (
                        after_time,
                        limit,
                    ),
                )
                rows = cursor.fetchall()
        except psycopg2.Error:
            self.close()
            raise
        events = []
        for row in rows:
            events.append(self._event_from_row(row))
        return events

    def close(self) -> None:
        """Closes the connection if one is open."""
        if self._connection is None:
            return
        try:
            self._connection.close()
        finally:
            self._connection = None

    def _open_connection(self) -> psycopg2.extensions.connection:
        """Returns the open connection, connecting first when there is none.

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
            application_name='order_visualizer',
            options=options,
        )
        connection.set_session(
            readonly=True,
            autocommit=True,
        )
        self._connection = connection
        return connection

    def _event_from_row(self, row: tuple[Any, ...]) -> OrderEvent:
        """Turns one result row into an event.

        Args:
            row (tuple[Any, ...]): The values in the order of the query's columns.

        Returns:
            OrderEvent: The event.
        """
        return OrderEvent(
            time=row[0],
            parent_order_id=row[1],
            sequence=row[2],
            event=row[3],
            synthetic_type=row[4],
            parent_state=row[5],
            leg_id=row[6],
            leg_role=row[7],
            leg_state=row[8],
            broker=row[9],
            broker_order_id=row[10],
            instrument_id=row[11],
            transaction_type=row[12],
            order_type=row[13],
            quantity=row[14],
            filled_quantity=row[15],
            price=self._number(row[16]),
            trigger_price=self._number(row[17]),
            average_price=self._number(row[18]),
            outcome=row[19],
            status_message=row[20],
            detail=row[21],
        )

    @staticmethod
    def _number(value: decimal.Decimal | None) -> float | None:
        """Turns a NUMERIC column's value into a float.

        Args:
            value (decimal.Decimal | None): The value as psycopg2 returns it.

        Returns:
            float | None: The value as a float, or None.
        """
        if value is None:
            return None
        return float(value)
