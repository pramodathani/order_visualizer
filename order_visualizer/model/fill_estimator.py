"""Describes where a resting leg stands against the order book: how far from trading, how much is queued ahead, and roughly how long the queue would take to clear.

These are estimates from five levels of depth and recent trading speed, not predictions. They assume prices hold still, that about half of the traded quantity trades on the leg's side of the book, and that orders ahead at the same price are not cancelled.

Typical usage example:

  estimate = FillEstimator().estimate(leg_document, snapshot, volume_per_minute)
"""

from typing import Any

from order_visualizer.model.depth_snapshot import DepthSnapshot

OPEN_LEG_STATES = frozenset(
    {
        'sending',
        'acknowledged',
    },
)
SIDE_SHARE_OF_VOLUME = 0.5


class FillEstimator:
    """Turns one leg and one book snapshot into plain facts and a one-sentence reading."""

    def estimate(self, leg: dict[str, Any], snapshot: DepthSnapshot, volume_per_minute: float | None) -> dict[str, Any]:
        """Estimates where one leg stands.

        Args:
            leg (dict[str, Any]): The leg as `Leg.to_document` describes it.
            snapshot (DepthSnapshot): The book at the moment of interest.
            volume_per_minute (float | None): How fast the instrument traded just before, or None when unknown.

        Returns:
            dict[str, Any]: The leg id, the kind of check made ("finished", "stop", "limit" or "unknown"), a status word, the distance to trading in rupees and percent, the queue ahead, whether the queue reaches past the visible depth, the minutes to the front of the queue, and a sentence explaining it.
        """
        result = {
            'leg_id': leg['leg_id'],
            'kind': 'unknown',
            'status': 'unknown',
            'distance': None,
            'distance_percent': None,
            'queue_ahead': None,
            'queue_beyond_visible_depth': False,
            'minutes_to_front': None,
            'explanation': '',
        }
        if leg.get('state') not in OPEN_LEG_STATES:
            result['kind'] = 'finished'
            result['status'] = leg.get('state') or 'unknown'
            result['explanation'] = f'This leg is {leg.get("state")}, so the book no longer affects it.'
            return result
        side = leg.get('transaction_type')
        order_type = (leg.get('order_type') or '').upper()
        if side not in ('BUY', 'SELL'):
            result['explanation'] = 'The leg has no side recorded, so it cannot be placed against the book.'
            return result
        if order_type.startswith('SL') and leg.get('trigger_price') is not None:
            return self._stop(result, side, float(leg['trigger_price']), snapshot)
        if leg.get('price') is not None and order_type in ('LIMIT', 'LMT', ''):
            return self._limit(result, side, float(leg['price']), snapshot, volume_per_minute)
        result['explanation'] = f'A {order_type or "plain"} order is not checked against the book.'
        return result

    def _stop(self, result: dict[str, Any], side: str, trigger: float, snapshot: DepthSnapshot) -> dict[str, Any]:
        """Fills in the reading for a stop leg, which waits for the price to reach its trigger.

        Args:
            result (dict[str, Any]): The result being built.
            side (str): "BUY" or "SELL".
            trigger (float): The trigger price.
            snapshot (DepthSnapshot): The book.

        Returns:
            dict[str, Any]: The result with the stop's distance filled in.
        """
        result['kind'] = 'stop'
        last = snapshot.last_price
        if last is None:
            result['explanation'] = 'No last price was recorded, so the distance to the trigger is unknown.'
            return result
        if side == 'SELL':
            move = last - trigger
            direction = 'fall'
        else:
            move = trigger - last
            direction = 'rise'
        result['distance'] = round(move, 4)
        result['distance_percent'] = round(move / last * 100, 3) if last else None
        if move <= 0:
            result['status'] = 'trigger_reached'
            result['explanation'] = f'The last price {last:.2f} is already past the trigger {trigger:.2f}, so this stop should be triggering.'
        else:
            result['status'] = 'waiting_for_trigger'
            result['explanation'] = f'The price must {direction} {move:.2f} ({result["distance_percent"]}%) from {last:.2f} to reach the trigger {trigger:.2f}.'
        return result

    def _limit(
        self,
        result: dict[str, Any],
        side: str,
        price: float,
        snapshot: DepthSnapshot,
        volume_per_minute: float | None,
    ) -> dict[str, Any]:
        """Fills in the reading for a limit leg: distance to the other side, queue ahead and time to the front.

        Args:
            result (dict[str, Any]): The result being built.
            side (str): "BUY" or "SELL".
            price (float): The limit price.
            snapshot (DepthSnapshot): The book.
            volume_per_minute (float | None): Recent trading speed, or None.

        Returns:
            dict[str, Any]: The result with the limit's position filled in.
        """
        result['kind'] = 'limit'
        if side == 'BUY':
            opposite = snapshot.best_ask()
            same_side = snapshot.bids
        else:
            opposite = snapshot.best_bid()
            same_side = snapshot.asks
        if opposite is not None:
            if side == 'BUY':
                gap = opposite - price
            else:
                gap = price - opposite
            result['distance'] = round(gap, 4)
            result['distance_percent'] = round(gap / price * 100, 3) if price else None
            if gap <= 0:
                result['status'] = 'marketable'
                result['explanation'] = f'The limit {price:.2f} already reaches the best {"ask" if side == "BUY" else "bid"} {opposite:.2f}, so it should trade as soon as it rests.'
                return result
        queue_ahead = 0
        beyond_visible = False
        at_best_price = True
        for level in same_side:
            better = level.price > price if side == 'BUY' else level.price < price
            if better:
                at_best_price = False
        if same_side:
            worst_visible = same_side[-1].price
            if (side == 'BUY' and price < worst_visible) or (side == 'SELL' and price > worst_visible):
                beyond_visible = True
                for level in same_side:
                    queue_ahead += level.quantity
            else:
                for level in same_side:
                    better = level.price > price if side == 'BUY' else level.price < price
                    if better or level.price == price:
                        queue_ahead += level.quantity
        result['queue_ahead'] = queue_ahead
        result['queue_beyond_visible_depth'] = beyond_visible
        result['status'] = 'resting' if at_best_price else 'behind_better_prices'
        if volume_per_minute is not None and volume_per_minute > 0:
            result['minutes_to_front'] = round(queue_ahead / (volume_per_minute * SIDE_SHARE_OF_VOLUME), 1)
        other_side_name = 'ask' if side == 'BUY' else 'bid'
        counter_party = 'sellers' if side == 'BUY' else 'buyers'
        parts = []
        if result['distance'] is not None:
            parts.append(f'The limit {price:.2f} is {result["distance"]:.2f} ({result["distance_percent"]}%) away from the best {other_side_name} {opposite:.2f}.')
        if at_best_price:
            if queue_ahead == 0:
                parts.append('It is the best price on its side with nothing visible queued ahead of it.')
            else:
                parts.append(f'It is at the best price on its side, with about {queue_ahead:,} queued ahead of it at that price.')
            if result['minutes_to_front'] is not None:
                parts.append(f'At the recent pace of {volume_per_minute:,.0f} traded per minute, it would reach the front in about {result["minutes_to_front"]} minutes if prices held.')
        else:
            prefix = 'at least ' if beyond_visible else 'about '
            parts.append(f'The price must move through better-priced orders first: {counter_party} would need to take {prefix}{queue_ahead:,} at prices ahead of it{", including everything in the five visible levels" if beyond_visible else ""}.')
            if result['minutes_to_front'] is not None:
                parts.append(f'At the recent pace of {volume_per_minute:,.0f} traded per minute, that is about {result["minutes_to_front"]} minutes of one-sided {"selling" if side == "BUY" else "buying"}.')
        if volume_per_minute is None:
            parts.append('Recent trading speed is unknown, so no time can be estimated.')
        result['explanation'] = ' '.join(parts)
        return result
