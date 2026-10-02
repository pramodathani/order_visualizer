import { useEffect, useMemo, useState } from 'react';

import type { OrderDocument, OrderList as OrderListDocument, OrderSummary } from '../api/types';
import { OrderDetails } from '../components/OrderDetails';
import { OrderList } from '../components/OrderList';
import { PlanView3D } from '../components/PlanView3D';
import { StateLegend } from '../components/StateLegend';
import { useEventStream } from '../hooks/useEventStream';
import { Formatter } from '../utilities/formatter';
import { StateColours } from '../utilities/stateColours';

const HASH_PREFIX = '#order=';

/** Props for OrdersPage. */
interface OrdersPageProps {
  orderList: OrderListDocument;
  onLoggedOut: () => void;
}

/**
 * Reads the chosen order's id from the page address.
 * @returns The id, or null when none is chosen.
 */
function selectedIdFromHash(): string | null {
  if (window.location.hash.startsWith(HASH_PREFIX)) {
    return window.location.hash.slice(HASH_PREFIX.length);
  }
  return null;
}

/**
 * The main page: the order list on the left and the chosen order in 3D on the right.
 * @param props The streamed order list and the handler for a lost session.
 * @returns The page.
 */
export function OrdersPage(props: OrdersPageProps) {
  const { orderList, onLoggedOut } = props;
  const [selectedId, setSelectedId] = useState<string | null>(selectedIdFromHash);
  const [plansOnly, setPlansOnly] = useState(false);
  const [workingOnly, setWorkingOnly] = useState(false);

  const visibleOrders = useMemo(() => {
    const visible: OrderSummary[] = [];
    for (const order of orderList.orders) {
      if (plansOnly && order.synthetic_type !== 'plan') {
        continue;
      }
      if (workingOnly && order.finished) {
        continue;
      }
      visible.push(order);
    }
    return visible;
  }, [orderList.orders, plansOnly, workingOnly]);

  useEffect(() => {
    if (selectedId !== null || orderList.orders.length === 0) {
      return;
    }
    const working = orderList.orders.find((order) => !order.finished);
    setSelectedId((working ?? orderList.orders[0]).parent_order_id);
  }, [selectedId, orderList.orders]);

  useEffect(() => {
    const handleHashChange = () => setSelectedId(selectedIdFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const select = (parentOrderId: string) => {
    window.location.hash = `${HASH_PREFIX}${parentOrderId}`;
    setSelectedId(parentOrderId);
  };

  const orderUrl = selectedId === null ? null : `/api/orders/${encodeURIComponent(selectedId)}/events`;
  const { document: order } = useEventStream<OrderDocument>(orderUrl, 'order', onLoggedOut);

  return (
    <div className="orders-page">
      <aside className="sidebar">
        <div className="filters">
          <label>
            <input type="checkbox" checked={plansOnly} onChange={(event) => setPlansOnly(event.target.checked)} /> Plans only
          </label>
          <label>
            <input type="checkbox" checked={workingOnly} onChange={(event) => setWorkingOnly(event.target.checked)} /> Working only
          </label>
          <span className="muted">{visibleOrders.length} orders</span>
        </div>
        <OrderList orders={visibleOrders} selectedId={selectedId} onSelect={select} />
      </aside>
      <section className="viewer">
        {order === null ? (
          <p className="empty centered">{selectedId === null ? 'No orders in the last few days.' : 'Loading the order…'}</p>
        ) : (
          <>
            <div className="order-heading">
              <h2>
                {order.synthetic_type ?? 'order'}{' '}
                <span style={{ color: StateColours.parent(order.state) }}>{order.state}</span>
              </h2>
              <span className="muted mono">{Formatter.shortIdentifier(order.parent_order_id)}</span>
              <span className="muted">
                {order.transaction_type} {order.quantity} @ {Formatter.price(order.price)} · received {Formatter.dateTime(order.received_at)}
                {order.updated_at !== null && order.received_at !== null
                  ? ` · ${order.finished ? 'lasted' : 'running for'} ${Formatter.duration(order.updated_at - order.received_at)}`
                  : ''}
              </span>
            </div>
            <PlanView3D order={order} />
            <StateLegend />
            <OrderDetails order={order} />
          </>
        )}
      </section>
    </div>
  );
}
