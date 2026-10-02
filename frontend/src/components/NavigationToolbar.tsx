import { useEffect, useState } from 'react';

import type { DragMode, SkyListener } from '../three/sceneController';
import { solarPosition } from '../utilities/solarPosition';
import type { SunPlace } from '../utilities/solarPosition';

const SKY_STORAGE_KEY = 'order-visualizer-sky';
const IST_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Reads whether this browser last had the sky switched on.
 * @returns True unless the sky was switched off, or storage is unavailable and the default applies.
 */
function savedSkyChoice(): boolean {
  try {
    return window.localStorage.getItem(SKY_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * Saves the sky choice in this browser, doing nothing when storage is unavailable.
 * @param enabled Whether the sky is on.
 */
function saveSkyChoice(enabled: boolean): void {
  try {
    window.localStorage.setItem(SKY_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    return;
  }
}

/** The navigation a scene offers to the toolbar. */
export interface NavigableScene {
  setDragMode: (mode: DragMode) => void;
  turnView: (degrees: number) => void;
  zoomView: (factor: number) => void;
  fitView: () => void;
  setSkyEnabled: (enabled: boolean) => void;
  setSkyListener: (listener: SkyListener | null) => void;
}

/** The time the sky shows and where the sun stands then. */
interface SkyReading {
  epochSeconds: number;
  sun: SunPlace;
}

/** Props for NavigationToolbar. */
interface NavigationToolbarProps {
  getScene: () => NavigableScene | null;
}

const TURN_DEGREES = 30;
const ZOOM_STEP = 0.7;

/**
 * The buttons in a 3D view's corner for moving around the arena (what a drag does, turning, zooming and fitting the whole scene), the sky switch, and a readout of the time the sky shows and where the sun stands.
 * @param props A function that returns the scene, or null before it exists.
 * @returns The toolbar.
 */
export function NavigationToolbar(props: NavigationToolbarProps) {
  const { getScene } = props;
  const [dragMode, setDragMode] = useState<DragMode>('rotate');
  const [skyEnabled, setSkyEnabled] = useState<boolean>(savedSkyChoice);
  const [reading, setReading] = useState<SkyReading | null>(null);

  useEffect(() => {
    let connectedScene: NavigableScene | null = null;
    const connect = (): boolean => {
      const scene = getScene();
      if (scene === null) {
        return false;
      }
      connectedScene = scene;
      scene.setSkyEnabled(skyEnabled);
      scene.setSkyListener(
        skyEnabled
          ? (epochSeconds, sun) => setReading({
              epochSeconds,
              sun,
            })
          : null,
      );
      return true;
    };
    let timer: number | undefined;
    if (!connect()) {
      timer = window.setInterval(() => {
        if (connect()) {
          window.clearInterval(timer);
        }
      }, 200);
    }
    return () => {
      window.clearInterval(timer);
      connectedScene?.setSkyListener(null);
    };
  }, [getScene, skyEnabled]);

  const toggleSky = () => {
    const next = !skyEnabled;
    saveSkyChoice(next);
    setSkyEnabled(next);
    if (!next) {
      setReading(null);
    }
  };

  const chooseDragMode = (mode: DragMode) => {
    setDragMode(mode);
    getScene()?.setDragMode(mode);
  };

  return (
    <div className="navigation-toolbar" role="group" aria-label="Move around the view">
      <div className="navigation-row">
        <span className="muted">Drag</span>
        <button
          type="button"
          className={dragMode === 'rotate' ? 'view-button view-button-active' : 'view-button'}
          onClick={() => chooseDragMode('rotate')}
          title="A drag turns the view (Shift-drag or right-drag pans)"
        >
          Rotate
        </button>
        <button
          type="button"
          className={dragMode === 'pan' ? 'view-button view-button-active' : 'view-button'}
          onClick={() => chooseDragMode('pan')}
          title="A drag slides the arena along the ground (Shift-drag or right-drag rotates)"
        >
          Pan
        </button>
        <span className="navigation-divider" />
        <button type="button" className="view-button" onClick={() => getScene()?.turnView(TURN_DEGREES)} title="Turn the view left">
          ⟲
        </button>
        <button type="button" className="view-button" onClick={() => getScene()?.turnView(-TURN_DEGREES)} title="Turn the view right">
          ⟳
        </button>
        <button type="button" className="view-button" onClick={() => getScene()?.zoomView(ZOOM_STEP)} title="Zoom in">
          +
        </button>
        <button type="button" className="view-button" onClick={() => getScene()?.zoomView(1 / ZOOM_STEP)} title="Zoom out">
          −
        </button>
        <button type="button" className="view-button" onClick={() => getScene()?.fitView()} title="Show the whole scene again">
          Fit
        </button>
        <span className="navigation-divider" />
        <button
          type="button"
          className={skyEnabled ? 'view-button view-button-active' : 'view-button'}
          onClick={toggleSky}
          title="Show the sky, with the sun where it stood in Mumbai at the time you are looking at"
        >
          Sky
        </button>
      </div>
      {skyEnabled && reading !== null && <SkyReadout reading={reading} />}
      <div className="navigation-hint muted">Scroll zooms where you point · double-click zooms into a spot</div>
    </div>
  );
}

/** Props for SkyReadout. */
interface SkyReadoutProps {
  reading: SkyReading;
}

/**
 * The line saying what time the sky shows and where the sun is.
 * @param props The time and the sun's place.
 * @returns The readout.
 */
function SkyReadout(props: SkyReadoutProps) {
  const { reading } = props;
  const clock = IST_CLOCK.format(new Date(reading.epochSeconds * 1000));
  const elevation = Math.round(reading.sun.elevationDegrees);
  const direction = solarPosition.compass(reading.sun.azimuthDegrees);
  if (elevation < 0) {
    return (
      <div className="navigation-hint sky-readout">
        ☾ {clock} IST · sun {-elevation}° below the horizon, {direction}
      </div>
    );
  }
  return (
    <div className="navigation-hint sky-readout">
      ☀ {clock} IST · sun {elevation}° up, {direction} · Mumbai
    </div>
  );
}
