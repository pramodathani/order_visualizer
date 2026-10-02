import argon2
import fastapi.testclient

from order_visualizer.application import Application
from order_visualizer.configuration.settings import Settings
from order_visualizer.security.authenticator import Authenticator
from order_visualizer.state.event_follower import EventFollower
from tests.event_factory import PARENT_ID, EventFactory
from tests.test_event_follower import FakeClock, FakeReader

PASSWORD = 'correct horse battery'
HEADERS = {
    'X-Requested-With': 'order-visualizer',
}


class TestOrderRoutes:
    """Tests for the order routes behind the login."""

    def _client(self) -> fastapi.testclient.TestClient:
        """Builds the web application with a fake reader holding one plan order.

        Returns:
            fastapi.testclient.TestClient: A client for the application.
        """
        settings = Settings(
            _env_file=None,
            password_hash=argon2.PasswordHasher().hash(PASSWORD),
            session_secret='test-secret',
            database_password='unused',
        )
        application = Application(settings)
        clock = FakeClock()
        follower = EventFollower(FakeReader(EventFactory().plan_rows()), application.book, clock, 2.0, 1.0)
        follower.poll_once()
        web_application = application.create_web_application(
            authenticator=Authenticator(settings.password_hash, clock),
            follower=follower,
            with_lifespan=False,
        )
        return fastapi.testclient.TestClient(web_application)

    def test_orders_need_a_login(self):
        """Without a session the order routes answer 401."""
        client = self._client()
        assert client.get('/api/orders').status_code == 401
        assert client.get(f'/api/orders/{PARENT_ID}').status_code == 401

    def test_orders_after_login(self):
        """After logging in, the list and the order document are served."""
        client = self._client()
        response = client.post('/api/auth/login', json={'password': PASSWORD}, headers=HEADERS)
        assert response.status_code == 200
        order_list = client.get('/api/orders').json()
        assert order_list['status']['rows_loaded'] == 12
        assert [order['parent_order_id'] for order in order_list['orders']] == [
            PARENT_ID,
        ]
        document = client.get(f'/api/orders/{PARENT_ID}').json()
        assert len(document['legs']) == 2

    def test_order_rejects_a_bad_or_unknown_id(self):
        """An id that is not a UUID is refused, and an unknown one is not found."""
        client = self._client()
        client.post('/api/auth/login', json={'password': PASSWORD}, headers=HEADERS)
        assert client.get('/api/orders/not-an-id').status_code == 400
        assert client.get('/api/orders/00000000-0000-0000-0000-000000000000').status_code == 404

    def test_there_is_no_route_that_writes_orders(self):
        """Every order route answers only GET."""
        client = self._client()
        client.post('/api/auth/login', json={'password': PASSWORD}, headers=HEADERS)
        assert client.post('/api/orders', headers=HEADERS).status_code == 405
        assert client.delete(f'/api/orders/{PARENT_ID}', headers=HEADERS).status_code == 405
