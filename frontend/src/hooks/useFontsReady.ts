import { useEffect, useState } from 'react';

import { LABEL_FONT_FAMILY } from '../three/labelSprite';

/**
 * Waits until JetBrains Mono has loaded, because 3D labels are painted once and would otherwise keep a fallback font.
 * @returns True once the regular and bold weights are ready, or once loading has failed and a fallback must do.
 */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stopped = false;
    Promise.all([
      document.fonts.load(`400 64px ${LABEL_FONT_FAMILY}`),
      document.fonts.load(`600 64px ${LABEL_FONT_FAMILY}`),
    ])
      .catch(() => undefined)
      .then(() => {
        if (!stopped) {
          setReady(true);
        }
      });
    return () => {
      stopped = true;
    };
  }, []);
  return ready;
}
