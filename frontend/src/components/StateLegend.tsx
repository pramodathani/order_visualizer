import { StateColours } from '../utilities/stateColours';

/**
 * The key under the 3D view saying what each colour means.
 * @returns The legend.
 */
export function StateLegend() {
  const legEntries = Object.entries(StateColours.LEG);
  const partEntries = Object.entries(StateColours.PART);
  return (
    <div className="legend">
      <span className="legend-title">Legs</span>
      {legEntries.map(([state, colour]) => (
        <span key={`leg-${state}`} className="legend-entry">
          <span className="swatch" style={{ background: colour }} />
          {state === 'acknowledged' ? 'resting' : state}
        </span>
      ))}
      <span className="legend-title">Parts</span>
      {partEntries.map(([state, colour]) => (
        <span key={`part-${state}`} className="legend-entry">
          <span className="swatch swatch-round" style={{ background: colour }} />
          {state}
        </span>
      ))}
      <span className="legend-entry muted">ring = cancel requested · time runs away from you</span>
    </div>
  );
}
