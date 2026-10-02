import { useEffect, useState } from 'react';

/**
 * Reads the current time and re-renders on an interval.
 * @param intervalMilliseconds How often to update.
 * @returns The current time in epoch seconds.
 */
export function useNow(intervalMilliseconds: number): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() / 1000), intervalMilliseconds);
    return () => window.clearInterval(timer);
  }, [intervalMilliseconds]);
  return now;
}
