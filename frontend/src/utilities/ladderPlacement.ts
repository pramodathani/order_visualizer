const STORAGE_KEY = 'order-visualizer-ladder-placement';

/** How the user has moved, turned and resized the order book, relative to where it would stand by default. */
export interface LadderPlacementValue {
  offset: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

/** Remembers the order book's placement in this browser. */
export class LadderPlacement {
  /**
   * The placement that leaves the order book where the scene puts it.
   * @returns No offset, no rotation and normal size.
   */
  neutral(): LadderPlacementValue {
    return {
      offset: [
        0,
        0,
        0,
      ],
      rotation: [
        0,
        0,
        0,
      ],
      scale: 1,
    };
  }

  /**
   * Reads the saved placement.
   * @returns The saved placement, or the neutral one when none is saved, it is malformed, or storage is unavailable.
   */
  load(): LadderPlacementValue {
    try {
      const text = window.localStorage.getItem(STORAGE_KEY);
      if (text === null) {
        return this.neutral();
      }
      const value = JSON.parse(text) as LadderPlacementValue;
      if (!Array.isArray(value.offset) || !Array.isArray(value.rotation) || typeof value.scale !== 'number') {
        return this.neutral();
      }
      return value;
    } catch {
      return this.neutral();
    }
  }

  /**
   * Saves a placement, doing nothing when storage is unavailable.
   * @param value The placement.
   */
  save(value: LadderPlacementValue): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      return;
    }
  }
}

export const ladderPlacement = new LadderPlacement();
