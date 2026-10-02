"""Writes epoch times as Indian Standard Time text, which the chat model reads more reliably than raw numbers.

Typical usage example:

  TimeText().clock(1759299050.0)
  readable = TimeText().readable(document)
"""

import datetime
import zoneinfo
from typing import Any

_INDIA = zoneinfo.ZoneInfo('Asia/Kolkata')
_TIME_KEYS = frozenset(
    {
        'time',
        'at_time',
        'received_at',
        'updated_at',
        'requested_at',
        'cancel_requested_at',
        'first_seen_at',
        'generated_at',
        'last_success_at',
        'last_error_at',
    },
)


class TimeText:
    """Converts epoch seconds to IST dates and clock times."""

    def clock(self, epoch_seconds: float) -> str:
        """Writes a moment as a date and clock time in IST.

        Args:
            epoch_seconds (float): The moment.

        Returns:
            str: Text such as "2026-10-01 11:40:50 IST".
        """
        moment = datetime.datetime.fromtimestamp(epoch_seconds, _INDIA)
        return moment.strftime('%Y-%m-%d %H:%M:%S IST')

    def day(self, epoch_seconds: float) -> str:
        """Names the IST calendar day of a moment.

        Args:
            epoch_seconds (float): The moment.

        Returns:
            str: The day as YYYY-MM-DD.
        """
        return datetime.datetime.fromtimestamp(epoch_seconds, _INDIA).date().isoformat()

    def minute(self, epoch_seconds: float) -> str:
        """Names the IST minute of a moment.

        Args:
            epoch_seconds (float): The moment.

        Returns:
            str: The minute as HH:MM.
        """
        return datetime.datetime.fromtimestamp(epoch_seconds, _INDIA).strftime('%H:%M')

    def minute_start(self, day: str, minute: str) -> float:
        """Finds the epoch time where an IST minute of a day begins.

        Args:
            day (str): The day as YYYY-MM-DD.
            minute (str): The minute as HH:MM.

        Returns:
            float: The epoch seconds.

        Raises:
            ValueError: The day or minute is not in the expected form.
        """
        moment = datetime.datetime.strptime(f'{day} {minute}', '%Y-%m-%d %H:%M').replace(tzinfo=_INDIA)
        return moment.timestamp()

    def readable(self, value: Any) -> Any:
        """Copies a document, writing every known time field as IST text.

        Args:
            value (Any): A document made of dicts, lists and plain values.

        Returns:
            Any: The copy.
        """
        if isinstance(value, dict):
            copy = {}
            for key, item in value.items():
                if key in _TIME_KEYS and isinstance(item, (int, float)) and not isinstance(item, bool):
                    copy[key] = self.clock(item)
                else:
                    copy[key] = self.readable(item)
            return copy
        if isinstance(value, list):
            items = []
            for item in value:
                items.append(self.readable(item))
            return items
        return value
