import { useCallback, useEffect, useState } from 'react';

import { apiClient } from './api/apiClient';
import type { OrderList } from './api/types';
import { useEventStream } from './hooks/useEventStream';
import { useNow } from './hooks/useNow';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './pages/OrdersPage';
import { Formatter } from './utilities/formatter';

type SessionState = 'checking' | 'logged-out' | 'logged-in';

const STALE_AFTER_SECONDS = 15;

/**
 * The application root: checks the session, then shows the login page or the viewer.
 * @returns The application.
 */
export function App() {
  const [sessionState, setSessionState] = useState<SessionState>('checking');

  useEffect(() => {
    apiClient
      .isLoggedIn()
      .then((loggedIn) => setSessionState(loggedIn ? 'logged-in' : 'logged-out'))
      .catch(() => setSessionState('logged-out'));
  }, []);

  const handleLoggedOut = useCallback(() => setSessionState('logged-out'), []);

  if (sessionState === 'checking') {
    return <p className="empty centered">Loading…</p>;
  }
  if (sessionState === 'logged-out') {
    return <LoginPage onLoggedIn={() => setSessionState('logged-in')} />;
  }
  return <Viewer onLoggedOut={handleLoggedOut} />;
}

/** Props for Viewer. */
interface ViewerProps {
  onLoggedOut: () => void;
}

/**
 * The logged-in layout: the header and the orders page.
 * @param props Called when the session ends.
 * @returns The viewer.
 */
function Viewer(props: ViewerProps) {
  const { onLoggedOut } = props;
  const { document: orderList, connected } = useEventStream<OrderList>('/api/events', 'orders', onLoggedOut);

  const logOut = async () => {
    try {
      await apiClient.logOut();
    } finally {
      onLoggedOut();
    }
  };

  return (
    <div className="shell">
      <header className="header">
        <h1>Order visualizer</h1>
        <span className="read-only-badge">read-only</span>
        <ConnectionState orderList={orderList} connected={connected} />
        <button type="button" className="button button-quiet log-out" onClick={logOut}>
          Log out
        </button>
      </header>
      {orderList === null ? (
        <p className="empty centered">Waiting for the first read of the event table…</p>
      ) : (
        <OrdersPage orderList={orderList} onLoggedOut={onLoggedOut} />
      )}
    </div>
  );
}

/** Props for ConnectionState. */
interface ConnectionStateProps {
  orderList: OrderList | null;
  connected: boolean;
}

/**
 * The header's summary of how fresh the data is.
 * @param props The latest order list and whether its stream is connected.
 * @returns The summary.
 */
function ConnectionState(props: ConnectionStateProps) {
  const { orderList, connected } = props;
  const now = useNow(1000);
  if (orderList === null) {
    return <span className="connection muted">{connected ? 'Connected' : 'Connecting…'}</span>;
  }
  const status = orderList.status;
  if (status.last_error !== null) {
    return (
      <span className="connection connection-error" title={status.last_error}>
        <span className="connection-dot connection-dot-error" aria-hidden="true" />
        Reading the event table failed: {status.last_error}
      </span>
    );
  }
  const age = status.last_success_at === null ? Infinity : now - status.last_success_at;
  const live = connected && age < STALE_AFTER_SECONDS;
  return (
    <span className="connection">
      <span className={live ? 'connection-dot connection-dot-live' : 'connection-dot'} aria-hidden="true" />
      <span>{live ? 'Live' : 'Not updating'}</span>
      <span className="muted">
        read {Number.isFinite(age) ? `${Formatter.duration(age)} ago` : 'never'} · {orderList.orders.length} orders
      </span>
    </span>
  );
}
