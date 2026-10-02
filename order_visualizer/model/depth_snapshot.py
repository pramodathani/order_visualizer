"""One moment of an instrument's order book, as UBI stored it in `unified.ticks`.

Typical usage example:

  snapshot = DepthSnapshot(time=..., last_price=13.1, volume=120000, bids=[...], asks=[...])
  print(snapshot.best_bid())
"""

import dataclasses
from typing import Any


@dataclasses.dataclass(frozen=True)
class DepthLevel:
    """One price level of the book.

    Attributes:
        price: The level's price, in rupees.
        quantity: The quantity resting at that price.
        orders: How many orders make up that quantity, or None when the broker does not say.
    """

    price: float
    quantity: int
    orders: int | None

    def to_document(self) -> dict[str, Any]:
        """Describes the level for the browser.

        Returns:
            dict[str, Any]: The price, quantity and order count.
        """
        return {
            'price': self.price,
            'quantity': self.quantity,
            'orders': self.orders,
        }


@dataclasses.dataclass(frozen=True)
class DepthSnapshot:
    """The five best bids and asks of one instrument at one moment.

    Attributes:
        time: When the tick was decoded, in epoch seconds.
        last_price: The last traded price, or None.
        volume: The quantity traded so far that day, or None.
        bids: The buying levels, best (highest) first.
        asks: The selling levels, best (lowest) first.
    """

    time: float
    last_price: float | None
    volume: int | None
    bids: list[DepthLevel]
    asks: list[DepthLevel]

    def best_bid(self) -> float | None:
        """The highest price a buyer is waiting at.

        Returns:
            float | None: The price, or None when no bid is shown.
        """
        if not self.bids:
            return None
        return self.bids[0].price

    def best_ask(self) -> float | None:
        """The lowest price a seller is waiting at.

        Returns:
            float | None: The price, or None when no ask is shown.
        """
        if not self.asks:
            return None
        return self.asks[0].price

    def to_document(self) -> dict[str, Any]:
        """Describes the snapshot for the browser.

        Returns:
            dict[str, Any]: The time, last price, volume and both sides of the book.
        """
        bids = []
        for level in self.bids:
            bids.append(level.to_document())
        asks = []
        for level in self.asks:
            asks.append(level.to_document())
        return {
            'time': self.time,
            'last_price': self.last_price,
            'volume': self.volume,
            'bids': bids,
            'asks': asks,
        }
