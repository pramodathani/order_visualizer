"""The routes that deliver orders to the browser: the order list, one order, and live streams of both.

The streams use server-sent events. They look for changes every second, send the whole document when something changed, and send a comment line every fifteen seconds otherwise so the connection is not considered dead.

Typical usage example:

  application.include_router(OrderRoutes(book, follower, guard, clock).router)
"""

import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator, Callable
from typing import Any

import fastapi
import fastapi.responses

from order_visualizer.security.session_guard import SessionGuard
from order_visualizer.state.event_follower import EventFollower
from order_visualizer.state.market_service import MOMENTS, MarketService
from order_visualizer.state.order_book import OrderBook
from order_visualizer.utilities.clock import SystemClock

_KEEPALIVE_SECONDS = 15.0
_LIVE_MARKET_SECONDS = 2.0


class OrderRoutes:
    """The /api/orders, /api/overview and /api/events routes.

    Attributes:
        router: The FastAPI router holding the routes.
    """

    def __init__(
        self,
        book: OrderBook,
        follower: EventFollower,
        guard: SessionGuard,
        clock: SystemClock,
        market_service: MarketService | None = None,
        check_interval_seconds: float = 1.0,
    ):
        """Creates the routes.

        Args:
            book (OrderBook): The orders.
            follower (EventFollower): Reports how reading the event table is going.
            guard (SessionGuard): Requires a logged-in session.
            clock (SystemClock): The source of the current time.
            market_service (MarketService | None): Builds the market panel, or None to leave its routes out.
            check_interval_seconds (float): How often a stream looks for changes.
        """
        self.market_service = market_service
        self.book = book
        self.follower = follower
        self.clock = clock
        self.check_interval_seconds = check_interval_seconds
        self.router = fastapi.APIRouter(
            dependencies=[
                fastapi.Depends(guard.require_session),
            ],
        )
        self.router.add_api_route(
            '/api/orders',
            self.orders,
            methods=[
                'GET',
            ],
        )
        self.router.add_api_route(
            '/api/orders/{parent_order_id}',
            self.order,
            methods=[
                'GET',
            ],
        )
        self.router.add_api_route(
            '/api/events',
            self.order_list_events,
            methods=[
                'GET',
            ],
        )
        self.router.add_api_route(
            '/api/overview',
            self.overview,
            methods=[
                'GET',
            ],
        )
        self.router.add_api_route(
            '/api/overview/events',
            self.overview_events,
            methods=[
                'GET',
            ],
        )
        if market_service is not None:
            self.router.add_api_route(
                '/api/orders/{parent_order_id}/market',
                self.market,
                methods=[
                    'GET',
                ],
            )
            self.router.add_api_route(
                '/api/orders/{parent_order_id}/market/events',
                self.market_events,
                methods=[
                    'GET',
                ],
            )
        self.router.add_api_route(
            '/api/orders/{parent_order_id}/events',
            self.order_events,
            methods=[
                'GET',
            ],
        )

    def orders(self) -> dict[str, Any]:
        """Returns the order list once.

        Returns:
            dict[str, Any]: The order summaries, the follower's status and the time the list was made.
        """
        return self._order_list()

    def overview(self) -> dict[str, Any]:
        """Returns every order in the whole-day view's short form, once.

        Returns:
            dict[str, Any]: The overviews, oldest first, and the time they were made.
        """
        return self._overview()

    def overview_events(self, request: fastapi.Request) -> fastapi.responses.StreamingResponse:
        """Streams every order in the whole-day view's short form whenever any order changes.

        Args:
            request (fastapi.Request): The request, to notice when the browser leaves.

        Returns:
            fastapi.responses.StreamingResponse: A text/event-stream response of "overview" events.
        """
        return self._streaming_response(
            self._event_stream(request, 'overview', self._overview_marker, self._overview),
        )

    def market(self, parent_order_id: str, moment: str = 'now') -> dict[str, Any]:
        """Returns the market panel of one order, once.

        Args:
            parent_order_id (str): The parent order's id.
            moment (str): "now", "received", "placed" or "ended".

        Returns:
            dict[str, Any]: The market view.

        Raises:
            fastapi.HTTPException: 400 for a bad id or moment, 404 when the viewer does not hold the order.
        """
        self._check_identifier(parent_order_id)
        self._check_moment(moment)
        view = self.market_service.market_view(parent_order_id, moment)
        if view is None:
            raise fastapi.HTTPException(status_code=404, detail=f'No such order in the viewer: {parent_order_id}')
        return view

    def market_events(self, request: fastapi.Request, parent_order_id: str, moment: str = 'now') -> fastapi.responses.StreamingResponse:
        """Streams the market panel of one order: every two seconds for the live book, or once for a past moment.

        Args:
            request (fastapi.Request): The request, to notice when the browser leaves.
            parent_order_id (str): The parent order's id.
            moment (str): "now", "received", "placed" or "ended".

        Returns:
            fastapi.responses.StreamingResponse: A text/event-stream response of "market" events.

        Raises:
            fastapi.HTTPException: 400 for a bad id or moment.
        """
        self._check_identifier(parent_order_id)
        self._check_moment(moment)

        def marker() -> Any:
            """Changes every two seconds for the live book, and when the order changes.

            Returns:
                Any: The marker, or None while the order is not in the viewer.
            """
            version = self.book.version_of(parent_order_id)
            if version is None:
                return None
            if moment == 'now':
                return (
                    version,
                    int(self.clock.now() / _LIVE_MARKET_SECONDS),
                )
            return version

        def build() -> dict[str, Any] | None:
            """Builds the market view.

            Returns:
                dict[str, Any] | None: The view, or None while the order is not in the viewer.
            """
            return self.market_service.market_view(parent_order_id, moment)

        return self._streaming_response(self._event_stream(request, 'market', marker, build))

    def order(self, parent_order_id: str) -> dict[str, Any]:
        """Returns one order once.

        Args:
            parent_order_id (str): The parent order's id.

        Returns:
            dict[str, Any]: The order's full document.

        Raises:
            fastapi.HTTPException: 400 when the id is not a UUID, 404 when the viewer does not hold the order.
        """
        self._check_identifier(parent_order_id)
        document = self.book.document(parent_order_id)
        if document is None:
            raise fastapi.HTTPException(status_code=404, detail=f'No such order in the viewer: {parent_order_id}')
        return document

    def order_list_events(self, request: fastapi.Request) -> fastapi.responses.StreamingResponse:
        """Streams the order list whenever any order or the follower's status changes.

        Args:
            request (fastapi.Request): The request, to notice when the browser leaves.

        Returns:
            fastapi.responses.StreamingResponse: A text/event-stream response of "orders" events.
        """
        return self._streaming_response(
            self._event_stream(request, 'orders', self._order_list_marker, self._order_list),
        )

    def order_events(self, request: fastapi.Request, parent_order_id: str) -> fastapi.responses.StreamingResponse:
        """Streams one order whenever it changes.

        Args:
            request (fastapi.Request): The request, to notice when the browser leaves.
            parent_order_id (str): The parent order's id.

        Returns:
            fastapi.responses.StreamingResponse: A text/event-stream response of "order" events. Nothing is sent until the order is in the viewer.

        Raises:
            fastapi.HTTPException: 400 when the id is not a UUID.
        """
        self._check_identifier(parent_order_id)

        def marker() -> int | None:
            """Reads the order's version.

            Returns:
                int | None: The version, or None while the order is not in the viewer.
            """
            return self.book.version_of(parent_order_id)

        def build() -> dict[str, Any] | None:
            """Builds the order's document.

            Returns:
                dict[str, Any] | None: The document, or None while the order is not in the viewer.
            """
            return self.book.document(parent_order_id)

        return self._streaming_response(self._event_stream(request, 'order', marker, build))

    def _order_list(self) -> dict[str, Any]:
        """Builds the order list document.

        Returns:
            dict[str, Any]: The order summaries, the follower's status and the time the list was made.
        """
        return {
            'generated_at': self.clock.now(),
            'status': self.follower.status(),
            'orders': self.book.summaries(),
        }

    def _overview(self) -> dict[str, Any]:
        """Builds the whole-day view's document.

        Returns:
            dict[str, Any]: The overviews, oldest first, and the time they were made.
        """
        return {
            'generated_at': self.clock.now(),
            'orders': self.book.overviews(),
        }

    def _overview_marker(self) -> int:
        """Reads what must change before the overview is sent again.

        Returns:
            int: The book's change counter.
        """
        return self.book.change_counter

    def _order_list_marker(self) -> tuple[int, Any, Any]:
        """Reads what must change before the order list is sent again.

        Returns:
            tuple[int, Any, Any]: The book's change counter, the last successful poll time and the last error.
        """
        status = self.follower.status()
        return (
            self.book.change_counter,
            status['last_success_at'],
            status['last_error'],
        )

    def _streaming_response(self, stream: AsyncIterator[str]) -> fastapi.responses.StreamingResponse:
        """Wraps a stream of server-sent event messages in a response.

        Args:
            stream (AsyncIterator[str]): The messages.

        Returns:
            fastapi.responses.StreamingResponse: A text/event-stream response that is never cached or buffered.
        """
        return fastapi.responses.StreamingResponse(
            stream,
            media_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
            },
        )

    async def _event_stream(
        self,
        request: fastapi.Request,
        event_name: str,
        marker: Callable[[], Any],
        build: Callable[[], dict[str, Any] | None],
    ) -> AsyncIterator[str]:
        """Produces server-sent event messages until the browser disconnects.

        Args:
            request (fastapi.Request): The request.
            event_name (str): The name each message carries.
            marker (Callable[[], Any]): Returns a value that changes whenever the document changes.
            build (Callable[[], dict[str, Any] | None]): Builds the document, or returns None when there is nothing to send yet.

        Yields:
            str: The next event or keepalive comment.
        """
        last_marker = None
        last_sent = 0.0
        while not await request.is_disconnected():
            current_marker = marker()
            now = time.monotonic()
            document = None
            if current_marker is not None and current_marker != last_marker:
                document = build()
            if document is not None:
                yield f'event: {event_name}\ndata: {json.dumps(document)}\n\n'
                last_marker = current_marker
                last_sent = now
            elif now - last_sent >= _KEEPALIVE_SECONDS:
                yield ': keepalive\n\n'
                last_sent = now
            await asyncio.sleep(self.check_interval_seconds)

    def _check_moment(self, moment: str) -> None:
        """Checks that a moment is one the market panel knows.

        Args:
            moment (str): The moment from the request.

        Raises:
            fastapi.HTTPException: 400 when the moment is unknown.
        """
        if moment not in MOMENTS:
            raise fastapi.HTTPException(status_code=400, detail=f'Unknown moment: {moment!r}; use now, received, placed or ended.')

    def _check_identifier(self, parent_order_id: str) -> None:
        """Checks that an order id is a UUID.

        Args:
            parent_order_id (str): The id from the request.

        Raises:
            fastapi.HTTPException: 400 when the id is not a UUID.
        """
        try:
            uuid.UUID(parent_order_id)
        except ValueError as error:
            raise fastapi.HTTPException(status_code=400, detail=f'Not an order id: {parent_order_id!r}') from error
