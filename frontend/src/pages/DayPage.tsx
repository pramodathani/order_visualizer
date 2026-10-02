import { useEffect, useMemo, useState } from 'react';

import type { Overview, OverviewOrder } from '../api/types';
import { DayView3D } from '../components/DayView3D';
import { useEventStream } from '../hooks/useEventStream';
import type { SkylineCell } from '../three/dayScene';
import { Formatter } from '../utilities/formatter';
import { StateColours } from '../utilities/stateColours';
import { useViewBridge, viewBridge } from '../utilities/viewBridge';

const HASH_PREFIX = '#day=';
const BUCKET_SECONDS = 60;

/** Props for DayPage. */
interface DayPageProps {
  onLoggedOut: () => void;
  onOpenOrder: (parentOrderId: string) => void;
}

/** The chosen column: an order type and the minute its orders arrived in. */
interface ChosenCell {
  key: string;
  type: string;
  bucketStart: number;
}

/**
 * Names the local calendar day of a moment.
 * @param epochSeconds The moment, in epoch seconds.
 * @returns The day as YYYY-MM-DD in the browser's time zone.
 */
function dayOf(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}

/**
 * Reads the chosen day from the page address.
 * @returns The day, or null when none is chosen.
 */
function dayFromHash(): string | null {
  if (window.location.hash.startsWith(HASH_PREFIX)) {
    return window.location.hash.slice(HASH_PREFIX.length);
  }
  return null;
}

/**
 * The whole-day view: a skyline of every order of one day in 3D, a picker for the day, and the orders of the chosen column.
 * @param props The handlers for a lost session and for opening one order.
 * @returns The page.
 */
export function DayPage(props: DayPageProps) {
  const { onLoggedOut, onOpenOrder } = props;
  const { document: overview } = useEventStream<Overview>('/api/overview/events', 'overview', onLoggedOut);
  const [chosenDay, setChosenDay] = useState<string | null>(dayFromHash);
  const [chosenCell, setChosenCell] = useState<ChosenCell | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const bridge = useViewBridge();

  useEffect(() => {
    if (bridge.dayRequest !== null) {
      window.history.replaceState(null, '', `${HASH_PREFIX}${bridge.dayRequest.day}`);
      setChosenDay(bridge.dayRequest.day);
      setChosenCell(null);
    }
  }, [bridge.dayRequest]);

  useEffect(() => {
    const focus = bridge.dayFocus;
    if (focus === null) {
      return;
    }
    const key = `${focus.syntheticType}@${focus.bucketStart}`;
    window.history.replaceState(null, '', `${HASH_PREFIX}${focus.day}`);
    setChosenDay(focus.day);
    setChosenCell({
      key,
      type: focus.syntheticType,
      bucketStart: focus.bucketStart,
    });
    setFocusKey(`${key}#${focus.request}`);
  }, [bridge.dayFocus]);

  const ordersByDay = useMemo(() => {
    const grouped = new Map<string, OverviewOrder[]>();
    for (const order of overview?.orders ?? []) {
      if (order.received_at === null) {
        continue;
      }
      const day = dayOf(order.received_at);
      const list = grouped.get(day) ?? [];
      list.push(order);
      grouped.set(day, list);
    }
    return grouped;
  }, [overview]);

  const days = [...ordersByDay.keys()].sort().reverse();
  const day = chosenDay !== null && ordersByDay.has(chosenDay) ? chosenDay : (days[0] ?? null);
  const orders = useMemo(() => (day === null ? [] : (ordersByDay.get(day) ?? [])), [day, ordersByDay]);

  useEffect(() => {
    viewBridge.report({
      day,
      columnType: chosenCell?.type ?? null,
      columnBucketStart: chosenCell?.bucketStart ?? null,
    });
  }, [day, chosenCell]);

  const choose = (nextDay: string) => {
    window.history.replaceState(null, '', `${HASH_PREFIX}${nextDay}`);
    setChosenDay(nextDay);
    setChosenCell(null);
  };

  const pickCell = (cell: SkylineCell) => {
    setChosenCell({
      key: cell.key,
      type: cell.type,
      bucketStart: cell.bucketStart,
    });
  };

  if (overview === null) {
    return <p className="empty centered">Loading every order…</p>;
  }
  if (day === null) {
    return <p className="empty centered">No orders in the viewer's lookback window.</p>;
  }

  const stateCounts = new Map<string, number>();
  const types = new Set<string>();
  let first = Infinity;
  let last = -Infinity;
  for (const order of orders) {
    const state = order.state ?? 'unknown';
    stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
    types.add(order.synthetic_type ?? 'order');
    first = Math.min(first, order.received_at ?? first);
    last = Math.max(last, order.updated_at ?? last);
  }

  const cellOrders: OverviewOrder[] = [];
  if (chosenCell !== null) {
    for (const order of orders) {
      if ((order.synthetic_type ?? 'order') !== chosenCell.type || order.received_at === null) {
        continue;
      }
      if (Math.floor(order.received_at / BUCKET_SECONDS) * BUCKET_SECONDS === chosenCell.bucketStart) {
        cellOrders.push(order);
      }
    }
  }

  return (
    <section className="day-page">
      <div className="day-heading">
        <label>
          Day{' '}
          <select value={day} onChange={(event) => choose(event.target.value)}>
            {days.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate} ({ordersByDay.get(candidate)?.length ?? 0} orders)
              </option>
            ))}
          </select>
        </label>
        <span>
          {orders.length} orders · {types.size} types · {Formatter.clockTime(first)} to {Formatter.clockTime(last)}
        </span>
        <span className="legend">
          {[...stateCounts.entries()]
            .sort((one, other) => other[1] - one[1])
            .map(([state, count]) => (
              <span key={state} className="legend-entry">
                <span className="swatch" style={{ background: StateColours.parent(state) }} />
                {state} {count}
              </span>
            ))}
        </span>
      </div>
      <DayView3D day={day} orders={orders} selectedKey={chosenCell?.key ?? null} focusKey={focusKey} onPickCell={pickCell} />
      <p className="muted day-help">
        Each column is the orders of one type that arrived in one minute, split by how they ended. Quiet stretches longer than two minutes are squeezed into marked breaks. Drag to turn, scroll to zoom, right-drag to pan, and click a column to list its orders.
      </p>
      {chosenCell !== null && (
        <div className="details">
          <h2>
            {chosenCell.type} orders that arrived at {Formatter.clockTime(chosenCell.bucketStart).slice(0, 5)} ({cellOrders.length})
          </h2>
          <div className="table-scroll table-tall">
            <table>
              <thead>
                <tr>
                  <th>Arrived</th>
                  <th>State</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Legs</th>
                  <th>Lasted</th>
                  <th>Order</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cellOrders.map((order) => (
                  <tr key={order.parent_order_id}>
                    <td>{Formatter.clockTime(order.received_at)}</td>
                    <td style={{ color: StateColours.parent(order.state) }}>{order.state ?? '—'}</td>
                    <td>{order.transaction_type ?? '—'}</td>
                    <td>{order.quantity ?? '—'}</td>
                    <td>{Formatter.price(order.price)}</td>
                    <td>{order.leg_count}</td>
                    <td>
                      {order.received_at !== null && order.updated_at !== null ? Formatter.duration(order.updated_at - order.received_at) : '—'}
                    </td>
                    <td className="mono">{Formatter.shortIdentifier(order.parent_order_id)}</td>
                    <td>
                      <button type="button" className="button button-small" onClick={() => onOpenOrder(order.parent_order_id)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
