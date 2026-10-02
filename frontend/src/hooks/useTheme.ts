import { useCallback, useEffect, useState } from 'react';

import { themeRegistry } from '../utilities/themes';
import type { Theme } from '../utilities/themes';

const THEME_EVENT = 'order-visualizer-theme-change';

/**
 * Follows the theme in use, so a component re-renders when the user picks another.
 * @returns The current theme and a function that switches to another by id.
 */
export function useTheme(): [Theme, (id: string) => void] {
  const [theme, setTheme] = useState<Theme>(themeRegistry.current);

  useEffect(() => {
    const handleChange = () => setTheme(themeRegistry.current);
    window.addEventListener(THEME_EVENT, handleChange);
    return () => window.removeEventListener(THEME_EVENT, handleChange);
  }, []);

  const choose = useCallback((id: string) => {
    themeRegistry.use(id);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return [
    theme,
    choose,
  ];
}
