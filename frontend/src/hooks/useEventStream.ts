import { useEffect, useState } from 'react';

import { apiClient } from '../api/apiClient';

const RECONNECT_DELAY_MILLISECONDS = 3000;

/** The latest document from a stream and whether the stream is connected. */
export interface StreamConnection<Document> {
  document: Document | null;
  connected: boolean;
}

/**
 * Follows one of the server's event streams, reconnecting after failures.
 * @param url The stream's address, or null to follow nothing.
 * @param eventName The name of the events that carry the document.
 * @param onLoggedOut Called when the stream fails because the session ended.
 * @returns The latest document and the connection state.
 */
export function useEventStream<Document>(
  url: string | null,
  eventName: string,
  onLoggedOut: () => void,
): StreamConnection<Document> {
  const [document, setDocument] = useState<Document | null>(null);
  const [connected, setConnected] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setDocument(null);
  }, [url]);

  useEffect(() => {
    if (url === null) {
      return;
    }
    const source = new EventSource(url);
    let reconnectTimer: number | undefined;
    let stopped = false;

    const scheduleReconnect = () => {
      if (!stopped) {
        reconnectTimer = window.setTimeout(() => setAttempt((previous) => previous + 1), RECONNECT_DELAY_MILLISECONDS);
      }
    };

    source.addEventListener(eventName, (event) => {
      const message = event as MessageEvent<string>;
      setDocument(JSON.parse(message.data) as Document);
      setConnected(true);
    });
    source.addEventListener('open', () => {
      setConnected(true);
    });
    source.addEventListener('error', () => {
      setConnected(false);
      if (source.readyState !== EventSource.CLOSED || stopped) {
        return;
      }
      apiClient
        .isLoggedIn()
        .then((loggedIn) => {
          if (stopped) {
            return;
          }
          if (!loggedIn) {
            onLoggedOut();
            return;
          }
          scheduleReconnect();
        })
        .catch(scheduleReconnect);
    });

    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      source.close();
    };
  }, [url, eventName, attempt, onLoggedOut]);

  return {
    document,
    connected,
  };
}
