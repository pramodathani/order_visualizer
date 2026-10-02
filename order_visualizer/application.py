"""Builds every component of the viewer and runs the web server.

Typical usage example:

  Application().run()
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

import anthropic
import fastapi
import starlette.middleware.sessions
import uvicorn

from order_visualizer.chat.chat_assistant import ChatAssistant
from order_visualizer.chat.chat_session import ChatSessions
from order_visualizer.chat.chat_toolbox import ChatToolbox
from order_visualizer.configuration.database_address import DatabaseAddress
from order_visualizer.configuration.settings import Settings
from order_visualizer.routes.auth_routes import AuthRoutes
from order_visualizer.routes.chat_routes import ChatRoutes
from order_visualizer.routes.frontend_routes import FrontendRoutes
from order_visualizer.routes.order_routes import OrderRoutes
from order_visualizer.security.authenticator import Authenticator
from order_visualizer.security.session_guard import SessionGuard
from order_visualizer.sources.depth_reader import DepthReader
from order_visualizer.sources.event_reader import EventReader
from order_visualizer.state.event_follower import EventFollower
from order_visualizer.state.market_service import MarketService
from order_visualizer.state.order_book import OrderBook
from order_visualizer.utilities.clock import SystemClock

_LOGGER = logging.getLogger(__name__)
_SESSION_COOKIE = 'order_visualizer_session'


class Application:
    """The whole viewer: the event follower, the order book and the web routes.

    Attributes:
        settings: The viewer's settings.
        clock: The source of the current time.
        book: The orders rebuilt from the event table.
        follower: The loop that reads new rows, or None until the application is built.
    """

    def __init__(self, settings: Settings | None = None):
        """Creates the application without connecting to anything.

        Args:
            settings (Settings | None): The settings, or None to read them from the environment and .env.
        """
        if settings is None:
            settings = Settings()
        self.settings = settings
        self.clock = SystemClock()
        self.book = OrderBook()
        self.follower = None

    def run(self) -> None:
        """Builds the application and serves it until stopped.

        Raises:
            ValueError: A setting or UBI's .env file is invalid.
            FileNotFoundError: UBI's .env file is missing.
        """
        logging.basicConfig(level=logging.INFO, format='%(levelname)-8s %(name)s %(message)s')
        web_application = self.build()
        uvicorn.run(
            web_application,
            host=self.settings.host,
            port=self.settings.port,
            workers=1,
            proxy_headers=False,
            log_config=None,
        )

    def build(self) -> fastapi.FastAPI:
        """Builds every component and the FastAPI application.

        Returns:
            fastapi.FastAPI: The web application, whose startup starts the follower.

        Raises:
            ValueError: A setting or UBI's .env file is invalid.
            FileNotFoundError: UBI's .env file is missing.
        """
        self.settings.require_security_values()
        address = DatabaseAddress.load(self.settings.unified_broker_interface_directory)
        reader = EventReader(address, self.settings.database_username, self.settings.database_password)
        self.follower = EventFollower(
            reader,
            self.book,
            self.clock,
            self.settings.poll_interval_seconds,
            self.settings.lookback_hours,
        )
        depth_reader = DepthReader(address, self.settings.database_username, self.settings.database_password)
        market_service = MarketService(depth_reader, self.book, self.clock)
        assistant = None
        if self.settings.anthropic_api_key:
            client = anthropic.Anthropic(api_key=self.settings.anthropic_api_key, timeout=180.0)
            assistant = ChatAssistant(client, ChatToolbox(self.book, market_service), self.settings.chat_model)
        else:
            _LOGGER.info('The chat is switched off because ORDER_VISUALIZER_ANTHROPIC_API_KEY is empty.')
        return self.create_web_application(
            authenticator=Authenticator(self.settings.password_hash, self.clock),
            follower=self.follower,
            with_lifespan=True,
            market_service=market_service,
            assistant=assistant,
        )

    def create_web_application(
        self,
        authenticator: Authenticator,
        follower: EventFollower,
        with_lifespan: bool,
        market_service: MarketService | None = None,
        assistant: ChatAssistant | None = None,
    ) -> fastapi.FastAPI:
        """Assembles the FastAPI application from ready components.

        Tests call this with a fake follower and without the lifespan.

        Args:
            authenticator (Authenticator): Checks the password.
            follower (EventFollower): Reads new rows and reports its status.
            with_lifespan (bool): Whether startup should start the follower's loop.
            market_service (MarketService | None): Builds the market panel, or None to leave its routes out.
            assistant (ChatAssistant | None): Answers chat questions, or None to keep the chat switched off.

        Returns:
            fastapi.FastAPI: The web application.
        """
        lifespan = None
        if with_lifespan:
            lifespan = self._lifespan
        web_application = fastapi.FastAPI(
            title='Order visualizer',
            docs_url=None,
            redoc_url=None,
            openapi_url=None,
            lifespan=lifespan,
        )
        web_application.add_middleware(
            starlette.middleware.sessions.SessionMiddleware,
            secret_key=self.settings.session_secret,
            session_cookie=_SESSION_COOKIE,
            max_age=self.settings.session_max_age_seconds,
            same_site='strict',
            https_only=False,
        )
        guard = SessionGuard()
        web_application.include_router(AuthRoutes(authenticator, guard, self.clock).router)
        web_application.include_router(OrderRoutes(self.book, follower, guard, self.clock, market_service).router)
        web_application.include_router(ChatRoutes(assistant, ChatSessions(), guard).router)
        web_application.include_router(FrontendRoutes(self.settings.frontend_directory).router)
        return web_application

    @contextlib.asynccontextmanager
    async def _lifespan(self, web_application: fastapi.FastAPI) -> AsyncIterator[None]:
        """Starts the follower when the server starts and stops it when it stops.

        Args:
            web_application (fastapi.FastAPI): The application being started.

        Yields:
            None: Control returns to the server while the application runs.
        """
        del web_application
        _LOGGER.info('Reading the last %.0f hours of order events every %.1f seconds.', self.settings.lookback_hours, self.settings.poll_interval_seconds)
        follower_task = asyncio.create_task(self.follower.run())
        try:
            yield
        finally:
            follower_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await follower_task
