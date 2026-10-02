import { useEffect, useRef, useState } from 'react';

import type { OrderDocument } from '../api/types';
import { useNow } from '../hooks/useNow';
import { PlanTreeScene } from '../three/planTreeScene';

/** Props for PlanView3D. */
interface PlanView3DProps {
  order: OrderDocument;
}

/**
 * The canvas holding the 3D plan tree, redrawn when the order changes and every second while it is still working.
 * @param props The order to draw.
 * @returns The canvas, or a message when the browser has no WebGL.
 */
export function PlanView3D(props: PlanView3DProps) {
  const { order } = props;
  const canvasReference = useRef<HTMLCanvasElement | null>(null);
  const sceneReference = useRef<PlanTreeScene | null>(null);
  const [failure, setFailure] = useState('');
  const secondTick = useNow(1000);
  const redrawKey = order.finished ? 0 : secondTick;

  useEffect(() => {
    const canvas = canvasReference.current;
    if (canvas === null) {
      return;
    }
    let scene: PlanTreeScene;
    try {
      scene = new PlanTreeScene(canvas);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'WebGL is not available.');
      return;
    }
    sceneReference.current = scene;
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
    sceneReference.current?.showOrder(order, Date.now() / 1000);
  }, [order, redrawKey]);

  if (failure) {
    return <p className="empty">The 3D view could not start: {failure}</p>;
  }
  return <canvas ref={canvasReference} className="plan-canvas" />;
}
