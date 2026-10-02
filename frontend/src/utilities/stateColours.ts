import { themeRegistry } from './themes';
import type { ThemeHues } from './themes';

type HueName = keyof ThemeHues;

const LEG_HUES: Record<string, HueName> = {
  sending: 'yellow',
  acknowledged: 'blue',
  filled: 'green',
  cancelled: 'grey',
  rejected: 'red',
};

const PART_HUES: Record<string, HueName> = {
  pending: 'grey',
  waiting: 'purple',
  working: 'orange',
  done: 'green',
};

const PARENT_HUES: Record<string, HueName> = {
  received: 'yellow',
  working: 'orange',
  protecting: 'purple',
  cancelling: 'cyan',
  completed: 'green',
  cancelled: 'grey',
  rejected: 'red',
  failed: 'red',
};

/** The colour of each state in the current theme, shared by the 3D scenes and the tables. */
export class StateColours {
  static readonly LEG_STATES = Object.keys(LEG_HUES);
  static readonly PART_STATES = Object.keys(PART_HUES);

  /**
   * The colour of a leg state.
   * @param state The state, or null.
   * @returns A CSS colour.
   */
  static leg(state: string | null): string {
    return StateColours.hue(state === null ? undefined : LEG_HUES[state]);
  }

  /**
   * The colour of a part state, where a finished part takes the colour of how it finished.
   * @param state The state, or null.
   * @param reason Why a finished part finished, or null.
   * @returns A CSS colour.
   */
  static part(state: string | null, reason: string | null): string {
    if (state === 'done' && reason === 'cancelled') {
      return StateColours.hue('grey');
    }
    return StateColours.hue(state === null ? undefined : PART_HUES[state]);
  }

  /**
   * The colour of a parent order state.
   * @param state The state, or null.
   * @returns A CSS colour.
   */
  static parent(state: string | null): string {
    return StateColours.hue(state === null ? undefined : PARENT_HUES[state]);
  }

  /**
   * The colour of the buying side of an order book.
   * @returns A CSS colour.
   */
  static bid(): string {
    return StateColours.hue('green');
  }

  /**
   * The colour of the selling side of an order book.
   * @returns A CSS colour.
   */
  static ask(): string {
    return StateColours.hue('red');
  }

  /**
   * Looks a hue up in the current theme.
   * @param name The hue's name, or undefined for an unknown state.
   * @returns A CSS colour, grey for an unknown state.
   */
  private static hue(name: HueName | undefined): string {
    return themeRegistry.current.hues[name ?? 'grey'];
  }
}
