import { useEffect, useRef, useState } from 'react';

import type { MarketView, OrderDocument } from '../api/types';
import { useFontsReady } from '../hooks/useFontsReady';
import { useNow } from '../hooks/useNow';
import { useTheme } from '../hooks/useTheme';
import { PlanTreeScene } from '../three/planTreeScene';
import type { LadderMode, PlanHighlight } from '../three/planTreeScene';

const LADDER_MODES: [LadderMode, string][] = [
  ['translate', 'Move'],
  ['rotate', 'Rotate'],
  ['scale', 'Resize'],
];

/** Props for PlanView3D. */
interface PlanView3DProps {
  order: OrderDocument;
  highlight: PlanHighlight | null;
  market: MarketView | null;
}

/**
 * The canvas holding the 3D plan tree, redrawn when the order changes and every second while it is still working.
 * @param props The order to draw, the parts or legs to make stand out, and the order book to stand beside it.
 * @returns The canvas, or a message when the browser has no WebGL.
 */
export function PlanView3D(props: PlanView3DProps) {
  const { order, highlight, market } = props;
  const [theme] = useTheme();
  const fontsReady = useFontsReady();
  const canvasReference = useRef<HTMLCanvasElement | null>(null);
  const sceneReference = useRef<PlanTreeScene | null>(null);
  const [failure, setFailure] = useState('');
  const [ladderMode, setLadderMode] = useState<LadderMode>('off');
  const secondTick = useNow(1000);
  const redrawKey = order.finished ? 0 : secondTick;

  useEffect(() => {
    const canvas = canvasReference.current;
    if (canvas === null) {
      return;
    }
    let scene: PlanTreeScene;
    try {
      scene = new PlanTreeScene(canvas, theme);
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
    sceneReference.current?.setHighlight(highlight);
  }, [highlight]);

  useEffect(() => {
    sceneReference.current?.setMarket(market);
  }, [market]);

  useEffect(() => {
    sceneReference.current?.setLadderMode(ladderMode);
  }, [ladderMode, market]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLadderMode('off');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const bookShown = market !== null && market.available;

  useEffect(() => {
    if (fontsReady) {
      sceneReference.current?.showOrder(order, Date.now() / 1000);
    }
  }, [order, redrawKey, fontsReady]);

  if (failure) {
    return <p className="empty">The 3D view could not start: {failure}</p>;
  }
  return (
    <div className="scene-wrapper">
      <canvas ref={canvasReference} className="plan-canvas" />
      {bookShown && (
        <div className="scene-toolbar" role="group" aria-label="Order book placement">
          <span className="muted">Order book</span>
          {LADDER_MODES.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={ladderMode === mode ? 'view-button view-button-active' : 'view-button'}
              onClick={() => setLadderMode(ladderMode === mode ? 'off' : mode)}
              title={ladderMode === mode ? 'Hide the handle (Esc)' : `${label} the order book with a handle`}
            >
              {label}
            </button>
          ))}
          <button type="button" className="view-button" onClick={() => sceneReference.current?.resetLadder()} title="Put the order book back where it started">
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
