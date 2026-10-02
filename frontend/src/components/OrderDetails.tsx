import type { OrderDocument } from '../api/types';
import { Formatter } from '../utilities/formatter';
import { StateColours } from '../utilities/stateColours';

/** Props for OrderDetails. */
interface OrderDetailsProps {
  order: OrderDocument;
}

/**
 * The tables under the 3D view: one row per leg, and every event newest first.
 * @param props The order.
 * @returns The tables.
 */
export function OrderDetails(props: OrderDetailsProps) {
  const { order } = props;
  const timeline = [...order.timeline].reverse();
  return (
    <div className="details">
      <h2>Legs</h2>
      {order.legs.length === 0 ? (
        <p className="empty">The engine has not placed any leg yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>State</th>
                <th>Side</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Filled</th>
                <th>Price</th>
                <th>Trigger</th>
                <th>Avg</th>
                <th>Broker order</th>
                <th>Asked at</th>
              </tr>
            </thead>
            <tbody>
              {order.legs.map((leg) => (
                <tr key={leg.leg_id}>
                  <td className="mono">{leg.role ?? '—'}</td>
                  <td style={{ color: StateColours.leg(leg.state) }}>{leg.state ?? '—'}</td>
                  <td>{leg.transaction_type ?? '—'}</td>
                  <td>{leg.order_type ?? '—'}</td>
                  <td>{leg.quantity ?? '—'}</td>
                  <td>{leg.filled_quantity ?? '—'}</td>
                  <td>{Formatter.price(leg.price)}</td>
                  <td>{Formatter.price(leg.trigger_price)}</td>
                  <td>{Formatter.price(leg.average_price)}</td>
                  <td className="mono">{leg.broker ? `${leg.broker} ${leg.broker_order_id ?? ''}` : '—'}</td>
                  <td>{Formatter.clockTime(leg.requested_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>Events</h2>
      <div className="table-scroll table-tall">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>#</th>
              <th>Event</th>
              <th>Order state</th>
              <th>Leg</th>
              <th>Leg state</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((entry) => (
              <tr key={entry.sequence}>
                <td>{Formatter.clockTime(entry.time)}</td>
                <td>{entry.sequence}</td>
                <td className="mono">{entry.event}</td>
                <td style={{ color: StateColours.parent(entry.parent_state) }}>{entry.parent_state ?? ''}</td>
                <td className="mono">{entry.leg_id ? entry.leg_id.split(':').pop() : ''}</td>
                <td style={{ color: StateColours.leg(entry.leg_state) }}>{entry.leg_state ?? ''}</td>
                <td>{entry.status_message ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
