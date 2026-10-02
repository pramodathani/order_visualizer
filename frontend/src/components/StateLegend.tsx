import { StateColours } from '../utilities/stateColours';

/**
 * The key under the 3D view saying what each colour means in the current theme.
 * @returns The legend.
 */
export function StateLegend() {
  return (
    <div className="legend">
      <span className="legend-title">Legs</span>
      {StateColours.LEG_STATES.map((state) => (
        <span key={`leg-${state}`} className="legend-entry">
          <span className="swatch" style={{ background: StateColours.leg(state) }} />
          {state === 'acknowledged' ? 'resting' : state}
        </span>
      ))}
      <span className="legend-title">Parts</span>
      {StateColours.PART_STATES.map((state) => (
        <span key={`part-${state}`} className="legend-entry">
          <span className="swatch swatch-round" style={{ background: StateColours.part(state, null) }} />
          {state}
        </span>
      ))}
      <span className="legend-entry muted">ring = cancel requested · particles = resting at the broker · time runs away from you</span>
    </div>
  );
}
