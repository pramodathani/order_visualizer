/** Turns numbers and times into short text for the page. */
export class Formatter {
  /**
   * Formats a moment as a local clock time.
   * @param epochSeconds The moment, in epoch seconds, or null.
   * @returns The time as HH:MM:SS, or a dash.
   */
  static clockTime(epochSeconds: number | null): string {
    if (epochSeconds === null) {
      return '—';
    }
    return new Date(epochSeconds * 1000).toLocaleTimeString('en-GB', {
      hour12: false,
    });
  }

  /**
   * Formats a moment as a local date and clock time.
   * @param epochSeconds The moment, in epoch seconds, or null.
   * @returns The date and time, or a dash.
   */
  static dateTime(epochSeconds: number | null): string {
    if (epochSeconds === null) {
      return '—';
    }
    const date = new Date(epochSeconds * 1000);
    const day = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    });
    return `${day} ${Formatter.clockTime(epochSeconds)}`;
  }

  /**
   * Formats a length of time.
   * @param seconds The length in seconds.
   * @returns Text such as "8s", "4m 10s" or "2h 5m".
   */
  static duration(seconds: number): string {
    const whole = Math.max(0, Math.round(seconds));
    if (whole < 60) {
      return `${whole}s`;
    }
    if (whole < 3600) {
      return `${Math.floor(whole / 60)}m ${whole % 60}s`;
    }
    return `${Math.floor(whole / 3600)}h ${Math.floor((whole % 3600) / 60)}m`;
  }

  /**
   * Formats a price.
   * @param value The price, or null.
   * @returns The price with two decimals, or a dash.
   */
  static price(value: number | null): string {
    if (value === null) {
      return '—';
    }
    return value.toFixed(2);
  }

  /**
   * Shortens an id to its first eight characters.
   * @param identifier The id.
   * @returns The short form.
   */
  static shortIdentifier(identifier: string): string {
    return identifier.slice(0, 8);
  }
}
