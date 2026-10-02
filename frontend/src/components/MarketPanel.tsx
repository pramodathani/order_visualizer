import type { MarketMoment, MarketView, OrderDocument } from '../api/types';
import { Formatter } from '../utilities/formatter';
import { StateColours } from '../utilities/stateColours';

const MOMENT_LABELS: Record<MarketMoment, string> = {
  now: 'Now',
  received: 'When received',
  placed: 'When each leg was placed',
  ended: 'At its last event',
};

/** Props for MarketPanel. */
interface MarketPanelProps {
  order: OrderDocument;
  market: MarketView | null;
  moment: MarketMoment;
  onMomentChange: (moment: MarketMoment) => void;
}

/**
 * The panel under the 3D view: where each leg stands in the order book, and how similar orders ended.
 * @param props The order, its market view, the chosen moment and the handler for choosing another.
 * @returns The panel.
 */
export function MarketPanel(props: MarketPanelProps) {
  const { order, market, moment, onMomentChange } = props;
  const legsById = new Map(order.legs.map((leg) => [leg.leg_id, leg]));
  const moments: MarketMoment[] = order.finished ? ['received', 'placed', 'ended'] : ['now', 'placed', 'received'];

  return (
    <div className="details market-panel">
      <div className="market-heading">
        <h2>Order book</h2>
        <div className="view-switch" role="group" aria-label="Moment">
          {moments.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={candidate === moment ? 'view-button view-button-active' : 'view-button'}
              onClick={() => onMomentChange(candidate)}
            >
              {MOMENT_LABELS[candidate]}
            </button>
          ))}
        </div>
        {market?.snapshot && (
          <span className="muted">
            book at {Formatter.clockTime(market.snapshot.time)} · last {Formatter.price(market.snapshot.last_price)}
            {market.volume_per_minute !== null ? ` · trading ${Math.round(market.volume_per_minute).toLocaleString()} a minute` : ''}
          </span>
        )}
      </div>
      {market === null && <p className="empty">Loading the order book…</p>}
      {market !== null && !market.available && <p className="notice">{market.reason}</p>}
      {market !== null && market.available && <LegReadings market={market} legsById={legsById} />}
      {market !== null && <OutcomeHistory market={market} />}
      <p className="muted small-print">
        Readings come from the five visible price levels and the last five minutes of trading. They assume prices hold still and that about half the traded quantity trades on the leg's side, so they are estimates, not predictions.
      </p>
    </div>
  );
}

/** Props for LegReadings. */
interface LegReadingsProps {
  market: MarketView;
  legsById: Map<string, OrderDocument['legs'][number]>;
}

/**
 * One row per leg saying where it stands.
 * @param props The market view and the order's legs by id.
 * @returns The table.
 */
function LegReadings(props: LegReadingsProps) {
  const { market, legsById } = props;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Leg</th>
            <th>Order</th>
            <th>At</th>
            <th>Standing</th>
            <th>Away</th>
            <th>Queued ahead</th>
            <th>To front</th>
            <th>Reading</th>
          </tr>
        </thead>
        <tbody>
          {market.legs.map((estimate) => {
            const leg = legsById.get(estimate.leg_id);
            return (
              <tr key={estimate.leg_id}>
                <td className="mono">{leg?.role ?? estimate.leg_id}</td>
                <td>
                  {leg?.transaction_type} {leg?.order_type} {Formatter.price(leg?.price ?? null)}
                </td>
                <td>{Formatter.clockTime(estimate.at_time)}</td>
                <td style={{ color: StateColours.leg(leg?.state ?? null) }}>{estimate.status.replaceAll('_', ' ')}</td>
                <td>{estimate.distance === null ? '—' : `${estimate.distance.toFixed(2)} (${estimate.distance_percent}%)`}</td>
                <td>
                  {estimate.queue_ahead === null ? '—' : `${estimate.queue_beyond_visible_depth ? '≥ ' : ''}${estimate.queue_ahead.toLocaleString()}`}
                </td>
                <td>{estimate.minutes_to_front === null ? '—' : `~${estimate.minutes_to_front} min`}</td>
                <td className="wrap">{estimate.explanation}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Props for OutcomeHistory. */
interface OutcomeHistoryProps {
  market: MarketView;
}

/**
 * Stacked bars of how finished orders of the same type ended, overall and on this instrument.
 * @param props The market view, which carries the counts.
 * @returns The bars.
 */
function OutcomeHistory(props: OutcomeHistoryProps) {
  const { market } = props;
  const rows: [string, Record<string, number>][] = [
    ['All instruments', market.history.all_instruments],
    ['This instrument', market.history.this_instrument],
  ];
  return (
    <div className="outcomes">
      <h3>How finished {market.history.synthetic_type ?? 'similar'} orders ended (viewer's 7 days)</h3>
      {rows.map(([label, counts]) => {
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
        return (
          <div key={label} className="outcome-row">
            <span className="outcome-label">
              {label} <span className="muted">({total})</span>
            </span>
            <span className="outcome-bar">
              {total === 0 && <span className="muted">no finished orders yet</span>}
              {Object.entries(counts)
                .sort((one, other) => other[1] - one[1])
                .map(([state, count]) => (
                  <span
                    key={state}
                    className="outcome-segment"
                    style={{ width: `${(count / total) * 100}%`, background: StateColours.parent(state) }}
                    title={`${state}: ${count}`}
                  >
                    {count / total >= 0.12 ? `${state} ${Math.round((count / total) * 100)}%` : ''}
                  </span>
                ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
