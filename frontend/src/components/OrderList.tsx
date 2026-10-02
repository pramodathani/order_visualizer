import { useEffect, useRef } from 'react';

import type { OrderSummary } from '../api/types';
import { Formatter } from '../utilities/formatter';
import { StateColours } from '../utilities/stateColours';

/** Props for OrderList. */
interface OrderListProps {
  orders: OrderSummary[];
  selectedId: string | null;
  onSelect: (parentOrderId: string) => void;
}

/**
 * The list of parent orders, newest first, with the chosen one highlighted.
 * @param props The orders, the chosen id and the handler for a click.
 * @returns The list.
 */
export function OrderList(props: OrderListProps) {
  const { orders, selectedId, onSelect } = props;
  const listReference = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const selected = listReference.current?.querySelector('.order-row-selected');
    selected?.scrollIntoView({
      block: 'nearest',
    });
  }, [selectedId, orders.length]);

  if (orders.length === 0) {
    return <p className="empty">No orders match.</p>;
  }
  return (
    <ul className="order-list" ref={listReference}>
      {orders.map((order) => {
        const selected = order.parent_order_id === selectedId;
        return (
          <li key={order.parent_order_id}>
            <button
              type="button"
              className={selected ? 'order-row order-row-selected' : 'order-row'}
              onClick={() => onSelect(order.parent_order_id)}
            >
              <span className="order-row-top">
                <span className="order-type">{order.synthetic_type ?? 'order'}</span>
                <span className="state-chip" style={{ color: StateColours.parent(order.state) }}>
                  {order.state ?? '—'}
                </span>
              </span>
              <span className="order-row-bottom muted">
                {order.transaction_type ?? ''} {order.quantity ?? ''} @ {Formatter.price(order.price)} · {order.leg_count} legs ·{' '}
                {Formatter.dateTime(order.received_at)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
