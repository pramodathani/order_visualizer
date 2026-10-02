"""The source of the current time.

Classes take a clock object instead of calling `time.time()` directly, so tests can choose the moment.

Typical usage example:

  clock = SystemClock()
  now = clock.now()
"""

import time


class SystemClock:
    """The real wall clock."""

    def now(self) -> float:
        """Reads the current time.

        Returns:
            float: Seconds since the Unix epoch.
        """
        return time.time()
