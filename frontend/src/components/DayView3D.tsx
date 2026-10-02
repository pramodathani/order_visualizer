import { useEffect, useRef, useState } from 'react';

import type { OverviewOrder } from '../api/types';
import { useFontsReady } from '../hooks/useFontsReady';
import { useTheme } from '../hooks/useTheme';
import { DayScene } from '../three/dayScene';
import type { SkylineCell } from '../three/dayScene';
import { Formatter } from '../utilities/formatter';
import { StateColours } from '../utilities/stateColours';

/** Props for DayView3D. */
interface DayView3DProps {
  day: string;
  orders: OverviewOrder[];
  selectedKey: string | null;
  focusKey: string | null;
  onPickCell: (cell: SkylineCell) => void;
}

/** The column under the pointer and where to show its card. */
interface Hovered {
  cell: SkylineCell;
  left: number;
  top: number;
}

/**
 * The canvas holding the day's skyline, with a card for the column under the pointer.
 * @param props The day, its orders, the chosen column, a column the camera should fly to, and the handler for a click on a column.
 * @returns The canvas and card, or a message when the browser has no WebGL.
 */
export function DayView3D(props: DayView3DProps) {
  const { day, orders, selectedKey, focusKey, onPickCell } = props;
  const [theme] = useTheme();
  const fontsReady = useFontsReady();
  const wrapperReference = useRef<HTMLDivElement | null>(null);
  const canvasReference = useRef<HTMLCanvasElement | null>(null);
  const sceneReference = useRef<DayScene | null>(null);
  const pickReference = useRef(onPickCell);
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [failure, setFailure] = useState('');

  pickReference.current = onPickCell;

  useEffect(() => {
    const canvas = canvasReference.current;
    if (canvas === null) {
      return;
    }
    let scene: DayScene;
    try {
      scene = new DayScene(canvas, {
        onHover: (cell, clientX, clientY) => {
          const wrapper = wrapperReference.current;
          if (cell === null || wrapper === null) {
            setHovered(null);
            return;
          }
          const box = wrapper.getBoundingClientRect();
          setHovered({
            cell,
            left: clientX - box.left + 14,
            top: clientY - box.top + 14,
          });
        },
        onPick: (cell) => pickReference.current(cell),
      }, theme);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'WebGL is not available.');
      return;
    }
    sceneReference.current = scene;
    scene.resize(canvas.clientWidth, canvas.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      scene.resize(box.width, box.height);
    });
    observer.observe(canvas);
    scene.start();
    return () => {
      observer.disconnect();
      scene.dispose();
      sceneReference.current = null;
    };
  }, []);

  useEffect(() => {
    sceneReference.current?.applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (fontsReady) {
      sceneReference.current?.showDay(day, orders);
    }
  }, [day, orders, fontsReady]);

  useEffect(() => {
    if (focusKey !== null && fontsReady) {
      sceneReference.current?.focusCell(focusKey.split('#')[0]);
    }
  }, [focusKey, fontsReady]);

  useEffect(() => {
    sceneReference.current?.select(selectedKey);
  }, [selectedKey, day, orders]);

  if (failure) {
    return <p className="empty">The 3D view could not start: {failure}</p>;
  }
  return (
    <div className="day-canvas-wrapper" ref={wrapperReference}>
      <canvas ref={canvasReference} className="plan-canvas day-canvas" />
      {hovered !== null && <HoverCard hovered={hovered} />}
    </div>
  );
}

/** Props for HoverCard. */
interface HoverCardProps {
  hovered: Hovered;
}

/**
 * The card describing the column under the pointer.
 * @param props The column and where to show the card.
 * @returns The card.
 */
function HoverCard(props: HoverCardProps) {
  const { hovered } = props;
  const counts = new Map<string, number>();
  for (const order of hovered.cell.orders) {
    const state = order.state ?? 'unknown';
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return (
    <div className="hover-card" style={{ left: hovered.left, top: hovered.top }}>
      <strong>{hovered.cell.type}</strong> · {hovered.cell.orders.length} orders arrived at {Formatter.clockTime(hovered.cell.bucketStart).slice(0, 5)}
      <br />
      {[...counts.entries()].map(([state, count]) => (
        <span key={state} className="hover-count" style={{ color: StateColours.parent(state) }}>
          {state} {count}
        </span>
      ))}
      <br />
      <span className="muted">click to list them</span>
    </div>
  );
}
