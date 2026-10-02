/**
 * Smooth random patterns for the landscape, made from a seed so the same land, trees and mountains appear every time.
 * Value noise on a grid, blended smoothly, and summed over several scales ("fractal" noise) for natural-looking detail.
 */
export class ValueNoise {
  private readonly seed: number;

  /**
   * Creates the generator.
   * @param seed Any whole number; different seeds give different land.
   */
  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * A repeatable random number for a grid point.
   * @param x The grid column.
   * @param y The grid row.
   * @returns A number from 0 to 1.
   */
  hash(x: number, y: number): number {
    let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(this.seed, 2147483647);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967295;
  }

  /**
   * Smooth noise at a point.
   * @param x Across.
   * @param y Down.
   * @returns A number from 0 to 1 that changes gently between neighbouring points.
   */
  sample(x: number, y: number): number {
    const column = Math.floor(x);
    const row = Math.floor(y);
    const across = this.fade(x - column);
    const down = this.fade(y - row);
    const topLeft = this.hash(column, row);
    const topRight = this.hash(column + 1, row);
    const bottomLeft = this.hash(column, row + 1);
    const bottomRight = this.hash(column + 1, row + 1);
    const top = topLeft + (topRight - topLeft) * across;
    const bottom = bottomLeft + (bottomRight - bottomLeft) * across;
    return top + (bottom - top) * down;
  }

  /**
   * Noise summed over several scales, each finer and fainter than the last.
   * @param x Across.
   * @param y Down.
   * @param octaves How many scales to sum.
   * @returns A number from 0 to 1.
   */
  fractal(x: number, y: number, octaves: number): number {
    let total = 0;
    let weight = 1;
    let weights = 0;
    let frequency = 1;
    for (let octave = 0; octave < octaves; octave += 1) {
      total += this.sample(x * frequency + octave * 17.3, y * frequency - octave * 9.1) * weight;
      weights += weight;
      weight *= 0.5;
      frequency *= 2;
    }
    return total / weights;
  }

  /**
   * A repeatable random sequence, for placing trees.
   * @returns A function that returns the next number from 0 to 1 each time it is called.
   */
  sequence(): () => number {
    let state = this.seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  /**
   * Eases a fraction so neighbouring grid cells join without creases.
   * @param fraction A number from 0 to 1.
   * @returns The eased number.
   */
  private fade(fraction: number): number {
    return fraction * fraction * fraction * (fraction * (fraction * 6 - 15) + 10);
  }
}
