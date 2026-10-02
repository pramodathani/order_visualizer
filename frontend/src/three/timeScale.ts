/** One busy stretch of the day, when at least one order was alive. */
export interface BusyStretch {
  start: number;
  end: number;
  depthStart: number;
}

/**
 * Turns times of day into depths along a broken time axis: busy stretches keep their true length, and each quiet gap longer than a limit is squeezed to a short fixed break.
 */
export class TimeScale {
  readonly stretches: BusyStretch[] = [];
  readonly totalDepth: number;
  private readonly secondsPerUnit: number;
  private readonly breakDepth: number;

  /**
   * Builds the scale from the lives of the day's orders.
   * @param lives Each order's [start, end] in epoch seconds.
   * @param gapLimitSeconds A quiet gap longer than this becomes a break.
   * @param secondsPerUnit How many seconds of busy time one unit of depth holds.
   * @param breakDepth How deep each break is drawn.
   */
  constructor(lives: [number, number][], gapLimitSeconds: number, secondsPerUnit: number, breakDepth: number) {
    this.secondsPerUnit = secondsPerUnit;
    this.breakDepth = breakDepth;
    const sorted = [...lives].sort((first, second) => first[0] - second[0]);
    const merged: [number, number][] = [];
    for (const [start, end] of sorted) {
      const last = merged[merged.length - 1];
      if (last !== undefined && start <= last[1] + gapLimitSeconds) {
        last[1] = Math.max(last[1], end);
      } else {
        merged.push([
          start,
          end,
        ]);
      }
    }
    let depth = 0;
    merged.forEach(([start, end], index) => {
      if (index > 0) {
        depth += breakDepth;
      }
      this.stretches.push({
        start,
        end,
        depthStart: depth,
      });
      depth += (end - start) / secondsPerUnit;
    });
    this.totalDepth = depth;
  }

  /**
   * Finds how far into the screen a moment sits.
   * @param time The moment, in epoch seconds.
   * @returns The depth as a negative number, where 0 is the day's first order. A moment inside a gap sits inside that gap's break.
   */
  depthOf(time: number): number {
    if (this.stretches.length === 0) {
      return 0;
    }
    for (let index = 0; index < this.stretches.length; index += 1) {
      const stretch = this.stretches[index];
      if (time <= stretch.end) {
        if (time >= stretch.start) {
          return -(stretch.depthStart + (time - stretch.start) / this.secondsPerUnit);
        }
        const previous = this.stretches[index - 1];
        if (previous === undefined) {
          return -stretch.depthStart;
        }
        const previousEndDepth = previous.depthStart + (previous.end - previous.start) / this.secondsPerUnit;
        const share = (time - previous.end) / (stretch.start - previous.end);
        return -(previousEndDepth + share * this.breakDepth);
      }
    }
    const last = this.stretches[this.stretches.length - 1];
    return -(last.depthStart + (time - last.start) / this.secondsPerUnit);
  }

  /**
   * Finds the moment at a depth, the reverse of depthOf.
   * @param depth A depth, where 0 is the day's first order and further away is more negative.
   * @returns The epoch time; inside a break, a moment inside that gap; before the first or after the last stretch, that stretch's start or end.
   */
  timeAt(depth: number): number {
    const distance = -depth;
    if (this.stretches.length === 0) {
      return 0;
    }
    if (distance <= 0) {
      return this.stretches[0].start;
    }
    for (let index = 0; index < this.stretches.length; index += 1) {
      const stretch = this.stretches[index];
      const stretchEnd = stretch.depthStart + (stretch.end - stretch.start) / this.secondsPerUnit;
      if (distance < stretch.depthStart) {
        const previous = this.stretches[index - 1];
        if (previous === undefined) {
          return stretch.start;
        }
        const share = (distance - (stretch.depthStart - this.breakDepth)) / this.breakDepth;
        return previous.end + share * (stretch.start - previous.end);
      }
      if (distance <= stretchEnd) {
        return stretch.start + (distance - stretch.depthStart) * this.secondsPerUnit;
      }
    }
    return this.stretches[this.stretches.length - 1].end;
  }

  /**
   * Lists the breaks between busy stretches.
   * @returns For each break, the depth where it starts and the length of the gap it stands for, in seconds.
   */
  breaks(): {
    depth: number;
    gapSeconds: number;
  }[] {
    const result: {
      depth: number;
      gapSeconds: number;
    }[] = [];
    for (let index = 1; index < this.stretches.length; index += 1) {
      const previous = this.stretches[index - 1];
      const stretch = this.stretches[index];
      result.push({
        depth: -(stretch.depthStart - this.breakDepth),
        gapSeconds: stretch.start - previous.end,
      });
    }
    return result;
  }
}
