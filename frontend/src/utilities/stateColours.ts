/** The colour of each state, shared by the 3D scene and the tables. */
export class StateColours {
  static readonly LEG: Record<string, string> = {
    sending: '#ffd54f',
    acknowledged: '#64b5f6',
    filled: '#81c784',
    cancelled: '#9aa0a6',
    rejected: '#e57373',
  };

  static readonly PART: Record<string, string> = {
    pending: '#5f6368',
    waiting: '#b39ddb',
    working: '#ff8a65',
    done: '#81c784',
  };

  static readonly PARENT: Record<string, string> = {
    received: '#ffd54f',
    working: '#ff8a65',
    protecting: '#ba68c8',
    cancelling: '#bcaaa4',
    completed: '#81c784',
    cancelled: '#9aa0a6',
    rejected: '#e57373',
    failed: '#e57373',
  };

  static readonly UNKNOWN = '#5f6368';

  /**
   * The colour of a leg state.
   * @param state The state, or null.
   * @returns A CSS colour.
   */
  static leg(state: string | null): string {
    return (state !== null && StateColours.LEG[state]) || StateColours.UNKNOWN;
  }

  /**
   * The colour of a part state, where a finished part takes the colour of how it finished.
   * @param state The state, or null.
   * @param reason Why a finished part finished, or null.
   * @returns A CSS colour.
   */
  static part(state: string | null, reason: string | null): string {
    if (state === 'done' && reason === 'cancelled') {
      return StateColours.LEG.cancelled;
    }
    return (state !== null && StateColours.PART[state]) || StateColours.UNKNOWN;
  }

  /**
   * The colour of a parent order state.
   * @param state The state, or null.
   * @returns A CSS colour.
   */
  static parent(state: string | null): string {
    return (state !== null && StateColours.PARENT[state]) || StateColours.UNKNOWN;
  }
}
