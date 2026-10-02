import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import type { OverviewOrder } from '../api/types';
import { Formatter } from '../utilities/formatter';
import { StateColours } from '../utilities/stateColours';
import type { Theme } from '../utilities/themes';
import { labelSprite } from './labelSprite';
import { SceneController } from './sceneController';
import { TimeScale } from './timeScale';

const BUCKET_SECONDS = 60;
const SECONDS_PER_UNIT = 60;
const GAP_LIMIT_SECONDS = 120;
const BREAK_DEPTH = 3;
const LANE_SPACING = 1.25;
const COLUMN_WIDTH = 0.9;
const TALLEST_COLUMN = 18;
const SHORTEST_SEGMENT = 0.12;
const MINIMUM_TICK_DEPTH = 8;
const CLICK_TOLERANCE_PIXELS = 5;
const TICK_STEPS_SECONDS = [
  300,
  600,
  900,
  1800,
  3600,
  7200,
];
const OUTCOME_ORDER = [
  'completed',
  'cancelled',
  'rejected',
  'failed',
];
const HOVER_BRIGHTENING = 1.45;

/** The orders of one type that arrived in one minute. */
export interface SkylineCell {
  key: string;
  type: string;
  bucketStart: number;
  orders: OverviewOrder[];
}

/** What the scene tells the page when the pointer moves over a column or a column is clicked. */
export interface DaySceneListener {
  onHover: (cell: SkylineCell | null, clientX: number, clientY: number) => void;
  onPick: (cell: SkylineCell) => void;
}

/**
 * Draws one day as a skyline: order types across, minutes running away from the viewer on a broken time axis, and a column for each minute in which orders of a type arrived.
 * A column's height is the number of orders, split into how they ended. All segments are one instanced mesh, so a busy day stays fast.
 */
export class DayScene extends SceneController {
  private readonly canvas: HTMLCanvasElement;
  private readonly listener: DaySceneListener;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private dayGroup = new THREE.Group();
  private columns: THREE.InstancedMesh | null = null;
  private cellByInstance: SkylineCell[] = [];
  private baseColours: THREE.Color[] = [];
  private hoveredKey: string | null = null;
  private lastDay: string | null = null;
  private lastOrders: OverviewOrder[] = [];
  private columnBoxes = new Map<string, THREE.Box3>();
  private selection: THREE.LineSegments | null = null;
  private selectedKey: string | null = null;
  private fittedDay: string | null = null;
  private pointerDownAt: THREE.Vector2 | null = null;

  /**
   * Creates the scene on a canvas.
   * @param canvas The canvas to draw on.
   * @param listener Told about hovering over and clicking on columns.
   * @param theme The theme to draw in.
   * @throws Error when the browser cannot create a WebGL context.
   */
  constructor(canvas: HTMLCanvasElement, listener: DaySceneListener, theme: Theme) {
    super(canvas, 42, theme);
    this.canvas = canvas;
    this.listener = listener;
    this.scene.add(this.dayGroup);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointerleave', this.handlePointerLeave);
  }

  /**
   * Draws a day's orders, replacing whatever was drawn before.
   * The camera is moved to fit only when a different day is shown, so live updates keep the user's view.
   * @param day The day's name, such as "2026-09-29", used to notice a change of day.
   * @param orders The day's orders.
   */
  showDay(day: string, orders: OverviewOrder[]): void {
    this.lastDay = day;
    this.lastOrders = orders;
    this.clearDay();
    if (orders.length === 0) {
      return;
    }
    const cells = this.buildCells(orders);
    const laneTypes = this.laneOrder(orders);
    const across = (type: string): number => (laneTypes.indexOf(type) - (laneTypes.length - 1) / 2) * LANE_SPACING;
    const bucketLives: [number, number][] = [];
    let largestCount = 0;
    for (const cell of cells) {
      bucketLives.push([
        cell.bucketStart,
        cell.bucketStart + BUCKET_SECONDS,
      ]);
      largestCount = Math.max(largestCount, cell.orders.length);
    }
    const timeScale = new TimeScale(bucketLives, GAP_LIMIT_SECONDS, SECONDS_PER_UNIT, BREAK_DEPTH);
    const heightPerOrder = Math.min(1, TALLEST_COLUMN / largestCount);

    this.addColumns(cells, across, timeScale, heightPerOrder);
    this.addFloor(laneTypes.length * LANE_SPACING, timeScale.totalDepth);
    laneTypes.forEach((type, index) => {
      const label = labelSprite.create(type, {
        colour: index % 2 === 0 ? this.theme.colours.ink : this.theme.colours.muted,
        height: 0.5,
        background: labelSprite.pill(this.theme.colours.surface, 0.7),
        anchor: 'centre',
      });
      label.position.set(across(type), 0.2, index % 2 === 0 ? 1.4 : 2.6);
      this.dayGroup.add(label);
    });
    this.addTimeAxis(timeScale, across(laneTypes[0]) - LANE_SPACING * 2);
    this.addScaleNote(heightPerOrder, across(laneTypes[laneTypes.length - 1]) + LANE_SPACING * 2);
    this.drawSelection();

    this.applyHover();
    const bounds = new THREE.Box3().setFromObject(this.dayGroup);
    this.fitShadows(bounds);
    if (this.fittedDay !== day) {
      const firstFit = this.fittedDay === null;
      this.fittedDay = day;
      this.selectedKey = null;
      this.drawSelection();
      const view = this.framing(bounds, new THREE.Vector3(0.3, 0.7, 0.65), 1);
      this.flyTo(view.position, view.target, firstFit ? 0 : 1);
    }
  }

  /**
   * Restyles the scene for a theme and redraws the day in its colours.
   * @param theme The theme.
   */
  applyTheme(theme: Theme): void {
    super.applyTheme(theme);
    if (this.lastDay !== null) {
      this.showDay(this.lastDay, this.lastOrders);
    }
  }

  /**
   * Glides the camera to look closely at one column and outlines it.
   * @param key The cell's key.
   * @returns True when the column exists on the day shown.
   */
  focusCell(key: string): boolean {
    const box = this.columnBoxes.get(key);
    if (box === undefined) {
      return false;
    }
    this.select(key);
    const focus = box.clone().expandByScalar(6);
    const view = this.framing(focus, new THREE.Vector3(0.45, 0.6, 0.65), 1);
    this.flyTo(view.position, view.target, 1.1);
    return true;
  }

  /**
   * Outlines the chosen column, or removes the outline.
   * @param key The chosen cell's key, or null for none.
   */
  select(key: string | null): void {
    this.selectedKey = key;
    this.drawSelection();
  }

  /**
   * Turns the camera with damping on every frame.
   * @param elapsedSeconds Seconds since the scene started.
   * @param deltaSeconds Seconds since the previous frame.
   */
  protected update(elapsedSeconds: number, deltaSeconds: number): void {
    void deltaSeconds;
    if (this.selection !== null) {
      (this.selection.material as THREE.LineBasicMaterial).opacity = 0.65 + 0.35 * Math.sin(elapsedSeconds * 4);
    }
  }

  /** Frees the drawn day and the pointer listeners. */
  protected disposeResources(): void {
    this.clearDay();
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
  }

  /**
   * Groups the orders by type and by the minute they arrived in.
   * @param orders The day's orders.
   * @returns One cell per type and minute that had at least one order.
   */
  private buildCells(orders: OverviewOrder[]): SkylineCell[] {
    const cellsByKey = new Map<string, SkylineCell>();
    for (const order of orders) {
      if (order.received_at === null) {
        continue;
      }
      const type = order.synthetic_type ?? 'order';
      const bucketStart = Math.floor(order.received_at / BUCKET_SECONDS) * BUCKET_SECONDS;
      const key = `${type}@${bucketStart}`;
      let cell = cellsByKey.get(key);
      if (cell === undefined) {
        cell = {
          key,
          type,
          bucketStart,
          orders: [],
        };
        cellsByKey.set(key, cell);
      }
      cell.orders.push(order);
    }
    return [...cellsByKey.values()];
  }

  /**
   * Chooses the lane of each order type: the busiest type in the middle and quieter types further out on alternate sides.
   * @param orders The day's orders.
   * @returns The order types from left to right.
   */
  private laneOrder(orders: OverviewOrder[]): string[] {
    const counts = new Map<string, number>();
    for (const order of orders) {
      const type = order.synthetic_type ?? 'order';
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    const busiestFirst = [...counts.keys()].sort((first, second) => {
      const difference = (counts.get(second) ?? 0) - (counts.get(first) ?? 0);
      return difference !== 0 ? difference : first.localeCompare(second);
    });
    const left: string[] = [];
    const right: string[] = [];
    busiestFirst.forEach((type, index) => {
      if (index % 2 === 0) {
        right.push(type);
      } else {
        left.push(type);
      }
    });
    return [...left.reverse(), ...right];
  }

  /**
   * Counts a cell's orders by how they ended, finished outcomes first in a fixed order and orders still working last.
   * @param cell The cell.
   * @returns Each state with its count, bottom of the column first.
   */
  private outcomeCounts(cell: SkylineCell): [string, number][] {
    const counts = new Map<string, number>();
    for (const order of cell.orders) {
      const state = order.state ?? 'unknown';
      counts.set(state, (counts.get(state) ?? 0) + 1);
    }
    const ordered: [string, number][] = [];
    for (const state of OUTCOME_ORDER) {
      const count = counts.get(state);
      if (count !== undefined) {
        ordered.push([
          state,
          count,
        ]);
        counts.delete(state);
      }
    }
    for (const [state, count] of counts) {
      ordered.push([
        state,
        count,
      ]);
    }
    return ordered;
  }

  /**
   * Draws every column as stacked segments in one instanced mesh, one segment per outcome.
   * @param cells The cells.
   * @param across Turns an order type into a position across.
   * @param timeScale The day's broken time axis.
   * @param heightPerOrder How tall one order is.
   */
  private addColumns(cells: SkylineCell[], across: (type: string) => number, timeScale: TimeScale, heightPerOrder: number): void {
    const segments: {
      cell: SkylineCell;
      x: number;
      z: number;
      bottom: number;
      height: number;
      colour: string;
    }[] = [];
    const bucketDepth = BUCKET_SECONDS / SECONDS_PER_UNIT;
    for (const cell of cells) {
      const x = across(cell.type);
      const z = timeScale.depthOf(cell.bucketStart) - bucketDepth / 2;
      let bottom = 0;
      for (const [state, count] of this.outcomeCounts(cell)) {
        const height = Math.max(count * heightPerOrder, SHORTEST_SEGMENT);
        segments.push({
          cell,
          x,
          z,
          bottom,
          height,
          colour: StateColours.parent(state),
        });
        bottom += height;
      }
      const footprint = COLUMN_WIDTH * bucketDepth;
      this.columnBoxes.set(
        cell.key,
        new THREE.Box3(new THREE.Vector3(x - COLUMN_WIDTH / 2, 0, z - footprint / 2), new THREE.Vector3(x + COLUMN_WIDTH / 2, bottom, z + footprint / 2)),
      );
    }
    const mesh = new THREE.InstancedMesh(
      new RoundedBoxGeometry(1, 1, 1, 3, 0.12),
      new THREE.MeshPhysicalMaterial({
        roughness: 0.32,
        metalness: 0.05,
        clearcoat: 0.8,
        clearcoatRoughness: 0.3,
      }),
      segments.length,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();
    this.cellByInstance = [];
    this.baseColours = [];
    segments.forEach((segment, index) => {
      matrix.makeScale(COLUMN_WIDTH, segment.height, COLUMN_WIDTH * bucketDepth);
      matrix.setPosition(segment.x, segment.bottom + segment.height / 2, segment.z);
      mesh.setMatrixAt(index, matrix);
      colour.set(segment.colour);
      mesh.setColorAt(index, colour);
      this.baseColours.push(colour.clone());
      this.cellByInstance.push(segment.cell);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
    this.columns = mesh;
    this.dayGroup.add(mesh);
  }

  /**
   * Draws the floor under the lanes: a surface that catches the columns' shadows, with a faint stripe along each lane.
   * @param width The floor's width.
   * @param depth The floor's depth.
   */
  private addFloor(width: number, depth: number): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 6, depth + 6),
      new THREE.MeshStandardMaterial({
        color: this.theme.colours.surface,
        roughness: 0.9,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.02, -depth / 2);
    floor.receiveShadow = true;
    this.dayGroup.add(floor);
    const laneCount = Math.round(width / LANE_SPACING);
    for (let lane = 0; lane <= laneCount; lane += 1) {
      const x = (lane - laneCount / 2) * LANE_SPACING;
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.03, depth + 4),
        new THREE.MeshBasicMaterial({
          color: this.theme.colours.muted,
          transparent: true,
          opacity: 0.18,
        }),
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, 0, -depth / 2);
      this.dayGroup.add(stripe);
    }
  }

  /**
   * Draws the broken time axis to the left of the lanes: a clock time where each busy stretch starts, ticks at round intervals inside a stretch, and a gap marker with its length at each break.
   * @param timeScale The day's broken time axis.
   * @param across Where the axis sits across.
   */
  private addTimeAxis(timeScale: TimeScale, across: number): void {
    let lastLabelDepth = Infinity;
    const addTick = (time: number, strong: boolean): void => {
      const depth = timeScale.depthOf(time);
      this.addLine(new THREE.Vector3(across - 0.6, 0, depth), new THREE.Vector3(across + 0.6, 0, depth));
      if (Math.abs(depth - lastLabelDepth) < 3) {
        return;
      }
      lastLabelDepth = depth;
      const label = labelSprite.create(Formatter.clockTime(time).slice(0, 5), {
        colour: strong ? this.theme.colours.ink : this.theme.colours.muted,
        height: 0.8,
      });
      label.position.set(across - 4.2, 0, depth);
      this.dayGroup.add(label);
    };
    let step = TICK_STEPS_SECONDS[TICK_STEPS_SECONDS.length - 1];
    for (const candidate of TICK_STEPS_SECONDS) {
      if (candidate / SECONDS_PER_UNIT >= MINIMUM_TICK_DEPTH) {
        step = candidate;
        break;
      }
    }
    for (const stretch of timeScale.stretches) {
      this.addLine(new THREE.Vector3(across, 0, timeScale.depthOf(stretch.start)), new THREE.Vector3(across, 0, timeScale.depthOf(stretch.end)));
      addTick(stretch.start, true);
      for (let time = Math.ceil(stretch.start / step) * step; time < stretch.end; time += step) {
        if (time - stretch.start > step * 0.3) {
          addTick(time, false);
        }
      }
      const minorStep = step / this.minorDivisions(step);
      for (let time = Math.ceil(stretch.start / minorStep) * minorStep; time < stretch.end; time += minorStep) {
        const stepsFromMajor = time / step;
        if (Math.abs(stepsFromMajor - Math.round(stepsFromMajor)) < 1e-6) {
          continue;
        }
        const depth = timeScale.depthOf(time);
        const minorTick = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(across - 0.3, 0, depth),
            new THREE.Vector3(across + 0.3, 0, depth),
          ]),
          new THREE.LineBasicMaterial({
            color: this.theme.colours.muted,
            transparent: true,
            opacity: 0.5,
          }),
        );
        this.dayGroup.add(minorTick);
      }
    }
    for (const gap of timeScale.breaks()) {
      const marker = labelSprite.create(`≈ ${Formatter.duration(gap.gapSeconds)} quiet`, {
        colour: this.theme.colours.muted,
        height: 0.65,
        background: labelSprite.pill(this.theme.colours.surface, 0.7),
      });
      marker.position.set(across - 4.2, 0.9, gap.depth - BREAK_DEPTH / 2);
      this.dayGroup.add(marker);
      for (const offset of [
        0.5,
        BREAK_DEPTH - 0.5,
      ]) {
        const depth = gap.depth - offset;
        this.addLine(new THREE.Vector3(across - 0.8, 0, depth + 0.3), new THREE.Vector3(across + 0.8, 0, depth - 0.3));
      }
    }
  }

  /**
   * Chooses how many unlabelled divisions sit between two labelled ticks, so every minor tick falls on a round time.
   * @param step The seconds between labelled ticks.
   * @returns 5 when the step divides by 5, otherwise 4 when it divides by 4, otherwise 2.
   */
  private minorDivisions(step: number): number {
    if (step % 5 === 0) {
      return 5;
    }
    if (step % 4 === 0) {
      return 4;
    }
    return 2;
  }

  /**
   * Writes how many orders one unit of height stands for, beside the lanes.
   * @param heightPerOrder How tall one order is.
   * @param across Where the note sits across.
   */
  private addScaleNote(heightPerOrder: number, across: number): void {
    const ordersPerFiveUnits = Math.round(5 / heightPerOrder);
    this.addLine(new THREE.Vector3(across, 0, 0), new THREE.Vector3(across, 5, 0));
    const label = labelSprite.create(`${ordersPerFiveUnits} orders`, {
      colour: this.theme.colours.muted,
      height: 0.7,
    });
    label.position.set(across + 0.4, 5, 0);
    this.dayGroup.add(label);
  }

  /**
   * Draws a dashed straight line.
   * @param from One end.
   * @param to The other end.
   */
  private addLine(from: THREE.Vector3, to: THREE.Vector3): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      from,
      to,
    ]);
    const line = new THREE.LineSegments(
      geometry,
      new THREE.LineDashedMaterial({
        color: this.theme.colours.muted,
        dashSize: 0.5,
        gapSize: 0.4,
      }),
    );
    line.computeLineDistances();
    this.dayGroup.add(line);
  }

  /** Redraws the outline around the chosen column. */
  private drawSelection(): void {
    if (this.selection !== null) {
      this.dayGroup.remove(this.selection);
      this.selection.geometry.dispose();
      (this.selection.material as THREE.Material).dispose();
      this.selection = null;
    }
    if (this.selectedKey === null) {
      return;
    }
    const box = this.columnBoxes.get(this.selectedKey);
    if (box === undefined) {
      return;
    }
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + 0.25, size.y + 0.25, size.z + 0.25)),
      new THREE.LineBasicMaterial({
        color: this.theme.colours.accent,
        toneMapped: false,
        transparent: true,
      }),
    );
    outline.position.copy(centre);
    this.selection = outline;
    this.dayGroup.add(outline);
  }

  /** Brightens the segments of the column under the pointer and restores every other column's colours. */
  private applyHover(): void {
    if (this.columns === null) {
      return;
    }
    const colour = new THREE.Color();
    this.cellByInstance.forEach((cell, index) => {
      colour.copy(this.baseColours[index]);
      if (cell.key === this.hoveredKey) {
        colour.multiplyScalar(HOVER_BRIGHTENING);
      }
      this.columns?.setColorAt(index, colour);
    });
    if (this.columns.instanceColor !== null) {
      this.columns.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Finds the cell whose column is under the pointer.
   * @param clientX The pointer's position across the window.
   * @param clientY The pointer's position down the window.
   * @returns The cell, or null when the pointer is over no column.
   */
  private cellAt(clientX: number, clientY: number): SkylineCell | null {
    if (this.columns === null) {
      return null;
    }
    const box = this.canvas.getBoundingClientRect();
    this.pointer.set(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.columns);
    if (hits.length === 0 || hits[0].instanceId === undefined) {
      return null;
    }
    return this.cellByInstance[hits[0].instanceId] ?? null;
  }

  /** Removes the drawn day and frees its GPU resources. */
  private clearDay(): void {
    this.dayGroup.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
      if (object instanceof THREE.Sprite) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
    this.columns?.dispose();
    this.columns = null;
    this.selection = null;
    this.cellByInstance = [];
    this.baseColours = [];
    this.columnBoxes = new Map();
    this.scene.remove(this.dayGroup);
    this.dayGroup = new THREE.Group();
    this.scene.add(this.dayGroup);
  }

  /**
   * Tells the page which cell is under the pointer.
   * @param event The pointer event.
   */
  private readonly handlePointerMove = (event: PointerEvent): void => {
    const cell = this.cellAt(event.clientX, event.clientY);
    const key = cell === null ? null : cell.key;
    if (key !== this.hoveredKey) {
      this.hoveredKey = key;
      this.applyHover();
    }
    this.listener.onHover(cell, event.clientX, event.clientY);
  };

  /**
   * Remembers where a press started, so a drag that turns the camera is not taken for a click.
   * @param event The pointer event.
   */
  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerDownAt = new THREE.Vector2(event.clientX, event.clientY);
  };

  /**
   * Chooses the column under the pointer when the press ends where it started.
   * @param event The pointer event.
   */
  private readonly handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerDownAt;
    this.pointerDownAt = null;
    if (start === null || start.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > CLICK_TOLERANCE_PIXELS) {
      return;
    }
    const cell = this.cellAt(event.clientX, event.clientY);
    if (cell !== null) {
      this.listener.onPick(cell);
    }
  };

  /** Hides the hover card when the pointer leaves the canvas. */
  private readonly handlePointerLeave = (): void => {
    this.hoveredKey = null;
    this.applyHover();
    this.listener.onHover(null, 0, 0);
  };
}
