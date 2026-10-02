import * as THREE from 'three';

import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import type { Leg, MarketView, OrderDocument } from '../api/types';
import { Formatter } from '../utilities/formatter';
import { ladderPlacement } from '../utilities/ladderPlacement';
import type { LadderPlacementValue } from '../utilities/ladderPlacement';
import { StateColours } from '../utilities/stateColours';
import type { Theme } from '../utilities/themes';
import { labelSprite } from './labelSprite';
import { PlanLayout } from './planLayout';
import type { TreeNode } from './planLayout';
import { SceneController } from './sceneController';

const COLUMN_SPACING = 11;
const LEVEL_SPACING = 7;
const TIME_DEPTH = 36;
const LEG_SPACING = 1.25;
const LEG_RADIUS = 0.32;
const RAIL_RADIUS = 0.1;
const EDGE_RADIUS = 0.07;
const FINAL_CAP_LENGTH = 0.35;
const FINAL_CAP_SECONDS_SHARE = 0.02;
const PARTICLES_PER_LEG = 7;
const PARTICLE_SPEED = 0.35;
const DIMMED_OPACITY = 0.12;
const LADDER_ROW = 1.1;
const LADDER_SPREAD_GAP = 1;
const LADDER_PRICE_HALF_WIDTH = 1.7;
const LADDER_LONGEST_BAR = 7;
const LADDER_MARKER_COLUMN = 3.8;
const LADDER_PADDING = 1.6;
const LADDER_FLOOR_CLEARANCE = 1;
const LADDER_SMALLEST_SCALE = 0.4;
const LADDER_LARGEST_SCALE = 3;
const FINAL_LEG_STATES = new Set([
  'filled',
  'cancelled',
  'rejected',
]);
const ACTIVE_PART_STATES = new Set([
  'working',
  'waiting',
]);
const TICK_STEPS_SECONDS = [
  1,
  2,
  5,
  10,
  15,
  30,
  60,
  120,
  300,
  600,
  900,
  1800,
  3600,
  7200,
];

/** A run of time spent in one state. */
interface StateSpan {
  start: number;
  end: number;
  colour: string;
}

/** A stretch of a resting leg that particles flow along. */
interface ParticleTrack {
  x: number;
  y: number;
  nearDepth: number;
  farDepth: number;
  colour: string;
}

/** How the user can handle the order book: not at all, or by moving, turning or resizing it. */
export type LadderMode = 'off' | 'translate' | 'rotate' | 'scale';

/** A thread from a leg's tube to its marker on the order book. */
interface LadderThread {
  from: THREE.Vector3;
  marker: THREE.Object3D;
  colour: string;
}

/** What the chat or the page has asked to stand out; everything else is dimmed. */
export interface PlanHighlight {
  partPaths: string[];
  legIds: string[];
}

/**
 * Draws one order as a 3D tree: the plan's parts across and down, and time running away from the viewer.
 * Each leg is a glossy tube that starts when the engine asked for it and changes colour as it rests, fills or is cancelled. Resting legs glow and carry flowing particles.
 */
export class PlanTreeScene extends SceneController {
  private readonly layout = new PlanLayout();
  private orderGroup = new THREE.Group();
  private floorGroup = new THREE.Group();
  private particles: THREE.InstancedMesh | null = null;
  private particleTracks: ParticleTrack[] = [];
  private halos: THREE.Mesh[] = [];
  private fittedOrderId: string | null = null;
  private lastOrder: OrderDocument | null = null;
  private lastNow = 0;
  private highlight: PlanHighlight | null = null;
  private market: MarketView | null = null;
  private legPositions = new Map<string, THREE.Vector3>();
  private readonly ladderRoot = new THREE.Group();
  private readonly ladderContent = new THREE.Group();
  private threadGroup = new THREE.Group();
  private ladderThreads: LadderThread[] = [];
  private readonly ladderAnchor = new THREE.Vector3();
  private ladderFloor = 0;
  private ladderMode: LadderMode = 'off';
  private placement: LadderPlacementValue = ladderPlacement.load();
  private readonly gizmo: TransformControls;

  /**
   * Creates the scene on a canvas.
   * @param canvas The canvas to draw on.
   * @param theme The theme to draw in.
   * @throws Error when the browser cannot create a WebGL context.
   */
  constructor(canvas: HTMLCanvasElement, theme: Theme) {
    super(canvas, 42, theme);
    this.orderGroup.add(this.floorGroup);
    this.orderGroup.add(this.threadGroup);
    this.scene.add(this.orderGroup);
    this.ladderRoot.add(this.ladderContent);
    this.ladderRoot.visible = false;
    this.scene.add(this.ladderRoot);
    this.gizmo = new TransformControls(this.camera, canvas);
    this.gizmo.setSpace('local');
    this.gizmo.setSize(0.9);
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed', this.handleGizmoDragging);
    this.gizmo.addEventListener('objectChange', this.handleGizmoChange);
  }

  /**
   * Lets the user move, turn or resize the order book with a handle, or puts the handle away.
   * @param mode "translate", "rotate", "scale", or "off" to hide the handle.
   */
  setLadderMode(mode: LadderMode): void {
    this.ladderMode = mode;
    this.attachGizmo();
  }

  /** Puts the order book back where the scene places it by default, at normal size and facing forward. */
  resetLadder(): void {
    this.placement = ladderPlacement.neutral();
    ladderPlacement.save(this.placement);
    if (this.lastOrder !== null) {
      this.showOrder(this.lastOrder, this.lastNow);
    }
  }

  /**
   * Restyles the scene for a theme and redraws the order in its colours.
   * @param theme The theme.
   */
  applyTheme(theme: Theme): void {
    super.applyTheme(theme);
    if (this.lastOrder !== null) {
      this.showOrder(this.lastOrder, this.lastNow);
    }
  }

  /**
   * Makes some parts and legs stand out by dimming everything else, or clears that.
   * @param highlight The part paths and leg ids to keep bright, or null to show everything normally.
   */
  setHighlight(highlight: PlanHighlight | null): void {
    this.highlight = highlight;
    if (this.lastOrder !== null) {
      this.showOrder(this.lastOrder, this.lastNow);
    }
  }

  /**
   * Shows the order book beside the tree, or removes it.
   * @param market The market view of the order shown, or null to hide the ladder.
   */
  setMarket(market: MarketView | null): void {
    this.market = market;
    if (this.lastOrder !== null) {
      this.showOrder(this.lastOrder, this.lastNow);
    }
  }

  /**
   * Draws an order, replacing whatever was drawn before.
   * The camera glides to fit only when a different order is shown, so live updates keep the user's view.
   * @param order The order to draw.
   * @param now The current time in epoch seconds, where an unfinished order's open tubes end.
   */
  showOrder(order: OrderDocument, now: number): void {
    this.lastOrder = order;
    this.lastNow = now;
    this.clearOrder();
    const startTime = order.received_at ?? now;
    const endTime = order.finished && order.updated_at !== null ? order.updated_at : Math.max(now, order.updated_at ?? now);
    const span = Math.max(endTime - startTime, 1);
    const depthOf = (time: number): number => -((time - startTime) / span) * TIME_DEPTH;

    const nodes = this.layout.build(order);
    const positions = new Map<string, THREE.Vector3>();
    let widest = 0;
    let deepest = 0;
    for (const node of nodes) {
      widest = Math.max(widest, node.column);
      deepest = Math.max(deepest, node.depth);
    }
    const middle = (widest * COLUMN_SPACING) / 2;
    for (const node of nodes) {
      positions.set(node.path, new THREE.Vector3(node.column * COLUMN_SPACING - middle, -node.depth * LEVEL_SPACING, 0));
    }

    for (const node of nodes) {
      const position = positions.get(node.path) as THREE.Vector3;
      const nodeDepth = depthOf(node.part?.first_seen_at ?? startTime);
      const bright = this.isPartBright(node);
      if (node.parentPath !== null) {
        const parentPosition = positions.get(node.parentPath) as THREE.Vector3;
        this.addEdge(new THREE.Vector3(parentPosition.x, parentPosition.y, nodeDepth), new THREE.Vector3(position.x, position.y, nodeDepth), bright);
      }
      this.addNode(node, order, position, nodeDepth, bright);
      for (const span of this.partSpans(node, endTime)) {
        this.addTube(position.x, position.y, depthOf(span.start), depthOf(span.end), RAIL_RADIUS, span.colour, 0.25, bright ? 0.55 : DIMMED_OPACITY);
      }
      node.legs.forEach((leg, index) => {
        const legPosition = new THREE.Vector3(position.x + (index + 1) * LEG_SPACING, position.y, 0);
        this.addLeg(leg, legPosition, depthOf, endTime, this.isLegBright(leg));
      });
    }

    const floorHeight = -deepest * LEVEL_SPACING - 3;
    const market = this.market;
    if (market !== null && market.available && market.snapshot !== null && market.parent_order_id === order.parent_order_id) {
      const ladderDepth = Math.min(0, Math.max(-TIME_DEPTH, depthOf(market.snapshot.time)));
      this.addLadder(market, order, middle + LEG_SPACING * 4 + 9, -(deepest * LEVEL_SPACING) / 2, floorHeight, ladderDepth);
    }

    const width = widest * COLUMN_SPACING + 16;
    this.addFloor(width, floorHeight);
    this.addTimeAxis(startTime, endTime, depthOf, floorHeight + 0.05, -middle - 5);
    if (!order.finished) {
      this.addNowPlane(depthOf(endTime), width, deepest * LEVEL_SPACING + 8, floorHeight);
    }
    this.buildParticles();

    const bounds = new THREE.Box3();
    for (const child of this.orderGroup.children) {
      if (child !== this.floorGroup) {
        bounds.expandByObject(child);
      }
    }
    if (this.ladderRoot.visible) {
      bounds.expandByObject(this.ladderRoot);
    }
    this.attachGizmo();
    this.fitShadows(bounds);
    if (this.fittedOrderId !== order.parent_order_id) {
      const firstFit = this.fittedOrderId === null;
      this.fittedOrderId = order.parent_order_id;
      const view = this.framing(bounds, new THREE.Vector3(0.45, 0.38, 0.8), 1);
      this.flyTo(view.position, view.target, firstFit ? 0 : 0.9);
    }
  }

  /**
   * Moves the particles along resting legs and pulses the halos of working parts.
   * @param elapsedSeconds Seconds since the scene started.
   * @param deltaSeconds Seconds since the previous frame.
   */
  protected update(elapsedSeconds: number, deltaSeconds: number): void {
    void deltaSeconds;
    if (this.particles !== null) {
      const matrix = new THREE.Matrix4();
      let index = 0;
      for (const track of this.particleTracks) {
        for (let particle = 0; particle < PARTICLES_PER_LEG; particle += 1) {
          const share = (elapsedSeconds * PARTICLE_SPEED + particle / PARTICLES_PER_LEG) % 1;
          const depth = track.nearDepth + (track.farDepth - track.nearDepth) * share;
          matrix.makeTranslation(track.x, track.y, depth);
          this.particles.setMatrixAt(index, matrix);
          index += 1;
        }
      }
      this.particles.instanceMatrix.needsUpdate = true;
    }
    const pulse = 1 + 0.18 * Math.sin(elapsedSeconds * 3);
    for (const halo of this.halos) {
      halo.scale.setScalar(pulse);
      (halo.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.25 * Math.sin(elapsedSeconds * 3);
    }
  }

  /** Frees the drawn order and the order book's handle. */
  protected disposeResources(): void {
    this.gizmo.removeEventListener('dragging-changed', this.handleGizmoDragging);
    this.gizmo.removeEventListener('objectChange', this.handleGizmoChange);
    this.gizmo.detach();
    this.gizmo.dispose();
    this.clearOrder();
  }

  /**
   * Decides whether a node keeps its full brightness under the current highlight.
   * @param node The node.
   * @returns True when nothing is highlighted, or when the node or one of its legs is.
   */
  private isPartBright(node: TreeNode): boolean {
    if (this.highlight === null) {
      return true;
    }
    if (this.highlight.partPaths.includes(node.path)) {
      return true;
    }
    return node.legs.some((leg) => this.highlight?.legIds.includes(leg.leg_id) === true);
  }

  /**
   * Decides whether a leg keeps its full brightness under the current highlight.
   * @param leg The leg.
   * @returns True when nothing is highlighted, or when the leg or its part is.
   */
  private isLegBright(leg: Leg): boolean {
    if (this.highlight === null) {
      return true;
    }
    if (this.highlight.legIds.includes(leg.leg_id)) {
      return true;
    }
    return leg.role !== null && this.highlight.partPaths.includes(leg.role);
  }

  /**
   * Makes the glossy material every solid shape uses.
   * @param colour The base colour, as CSS.
   * @param glow How strongly it glows, where values near 1 or more catch the bloom.
   * @param opacity How opaque it is, from 0 to 1.
   * @returns The material.
   */
  private glossy(colour: string, glow: number, opacity: number): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: colour,
      roughness: 0.3,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.25,
      emissive: colour,
      emissiveIntensity: glow,
      transparent: opacity < 1,
      opacity,
    });
  }

  /**
   * Draws a node as a glossy sphere coloured by its part's state, a pulsing halo when the part is working, and a label.
   * @param node The node.
   * @param order The order, whose state colours the root.
   * @param position Where the node sits across and down.
   * @param depth Where the node sits in time.
   * @param bright Whether the node keeps full brightness.
   */
  private addNode(node: TreeNode, order: OrderDocument, position: THREE.Vector3, depth: number, bright: boolean): void {
    let colour = StateColours.part(null, null);
    let stateText = '';
    let active = false;
    if (node.parentPath === null) {
      colour = StateColours.parent(order.state);
      stateText = order.state ?? '';
      active = !order.finished;
    } else if (node.part !== null) {
      colour = StateColours.part(node.part.state, node.part.reason);
      stateText = node.part.reason !== null ? `${node.part.state} · ${node.part.reason}` : (node.part.state ?? '');
      active = ACTIVE_PART_STATES.has(node.part.state ?? '');
    }
    const radius = node.parentPath === null ? 1.25 : 0.9;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), this.glossy(colour, active ? 0.45 : 0.1, bright ? 1 : DIMMED_OPACITY));
    sphere.position.set(position.x, position.y, depth);
    sphere.castShadow = true;
    this.orderGroup.add(sphere);
    if (active && bright) {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 1.55, 0.05, 12, 64),
        new THREE.MeshBasicMaterial({
          color: colour,
          transparent: true,
          opacity: 0.5,
          toneMapped: false,
        }),
      );
      halo.position.copy(sphere.position);
      this.halos.push(halo);
      this.orderGroup.add(halo);
    }
    const label = labelSprite.create(`${node.label}\n${stateText}`, {
      colour: this.theme.colours.ink,
      height: 0.95,
      background: labelSprite.pill(this.theme.colours.surface, bright ? 0.82 : 0.3),
      bold: true,
    });
    label.position.set(position.x - radius, position.y + radius + 1.6, depth);
    if (!bright) {
      label.material.opacity = 0.35;
    }
    this.orderGroup.add(label);
  }

  /**
   * Draws a curved tube from a parent node down to a child.
   * @param from The parent's position.
   * @param to The child's position.
   * @param bright Whether the tube keeps full brightness.
   */
  private addEdge(from: THREE.Vector3, to: THREE.Vector3, bright: boolean): void {
    const bend = (from.y - to.y) * 0.55;
    const curve = new THREE.CubicBezierCurve3(from, new THREE.Vector3(from.x, from.y - bend, from.z), new THREE.Vector3(to.x, to.y + bend, to.z), to);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 40, EDGE_RADIUS, 10, false),
      new THREE.MeshStandardMaterial({
        color: this.theme.colours.muted,
        roughness: 0.6,
        transparent: true,
        opacity: bright ? 0.7 : DIMMED_OPACITY,
      }),
    );
    this.orderGroup.add(tube);
  }

  /**
   * Draws one leg as a glossy tube along time, one segment per state, with a burst where it filled, a ring where a cancel was asked for, flowing particles while it rests, and a label.
   * @param leg The leg.
   * @param position Where the leg sits across and down.
   * @param depthOf Turns a time into a depth.
   * @param endTime Where an open leg's last segment ends.
   * @param bright Whether the leg keeps full brightness.
   */
  private addLeg(leg: Leg, position: THREE.Vector3, depthOf: (time: number) => number, endTime: number, bright: boolean): void {
    const history = leg.state_history;
    if (history.length === 0) {
      return;
    }
    const opacity = bright ? 1 : DIMMED_OPACITY;
    this.legPositions.set(leg.leg_id, position.clone());
    for (let index = 0; index < history.length; index += 1) {
      const change = history[index];
      const isLast = index + 1 >= history.length;
      const startDepth = depthOf(change.time);
      let endDepth: number;
      if (!isLast) {
        endDepth = depthOf(history[index + 1].time);
      } else if (FINAL_LEG_STATES.has(change.state)) {
        endDepth = startDepth - FINAL_CAP_LENGTH;
      } else {
        endDepth = depthOf(endTime);
      }
      const open = isLast && !FINAL_LEG_STATES.has(change.state);
      const colour = StateColours.leg(change.state);
      this.addTube(position.x, position.y, startDepth, endDepth, LEG_RADIUS, colour, open ? 1.1 : 0.12, opacity);
      if (open && bright && Math.abs(endDepth - startDepth) > 0.5) {
        this.particleTracks.push({
          x: position.x,
          y: position.y,
          nearDepth: startDepth,
          farDepth: endDepth,
          colour,
        });
      }
      if (isLast && change.state === 'filled') {
        this.addBurst(position, startDepth, colour, opacity);
      }
    }
    if (leg.cancel_requested_at !== null) {
      this.addRing(position, depthOf(leg.cancel_requested_at), StateColours.leg('cancelled'), opacity);
    }
    const side = leg.transaction_type ?? '';
    const quantity = leg.quantity ?? '';
    const priceText = leg.trigger_price !== null ? `${Formatter.price(leg.price)} trig ${Formatter.price(leg.trigger_price)}` : Formatter.price(leg.price);
    const label = labelSprite.create(`${side} ${quantity} @ ${priceText}\n${leg.order_type ?? ''} · ${leg.state === 'acknowledged' ? 'resting' : (leg.state ?? '')}`, {
      colour: StateColours.leg(leg.state),
      height: 0.62,
      background: labelSprite.pill(this.theme.colours.surface, bright ? 0.75 : 0.25),
    });
    label.position.set(position.x + 0.7, position.y + 1.25, depthOf(history[0].time) - 3);
    if (!bright) {
      label.material.opacity = 0.35;
    }
    this.orderGroup.add(label);
  }

  /**
   * Draws a tube running along time with rounded ends.
   * @param x Where it sits across.
   * @param y Where it sits down.
   * @param startDepth The depth of its near end.
   * @param endDepth The depth of its far end.
   * @param radius Its radius.
   * @param colour Its colour, as CSS.
   * @param glow How strongly it glows.
   * @param opacity How opaque it is, from 0 to 1.
   */
  private addTube(x: number, y: number, startDepth: number, endDepth: number, radius: number, colour: string, glow: number, opacity: number): void {
    const length = Math.max(Math.abs(endDepth - startDepth) - radius * 2, 0.01);
    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, 20), this.glossy(colour, glow, opacity));
    capsule.rotation.x = Math.PI / 2;
    capsule.position.set(x, y, (startDepth + endDepth) / 2);
    capsule.castShadow = opacity >= 1;
    this.orderGroup.add(capsule);
  }

  /**
   * Draws a bright burst where a leg filled.
   * @param position Where the leg sits across and down.
   * @param depth The depth of the fill.
   * @param colour The fill colour, as CSS.
   * @param opacity How opaque it is, from 0 to 1.
   */
  private addBurst(position: THREE.Vector3, depth: number, colour: string, opacity: number): void {
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 32, 16),
      new THREE.MeshBasicMaterial({
        color: colour,
        toneMapped: false,
        transparent: opacity < 1,
        opacity,
      }),
    );
    core.position.set(position.x, position.y, depth);
    this.orderGroup.add(core);
    this.addRing(position, depth, colour, opacity * 0.9);
  }

  /**
   * Draws a ring around a leg at one moment, used for a cancel request or a fill.
   * @param position Where the leg sits across and down.
   * @param depth The depth of the moment.
   * @param colour The ring's colour, as CSS.
   * @param opacity How opaque it is, from 0 to 1.
   */
  private addRing(position: THREE.Vector3, depth: number, colour: string, opacity: number): void {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.06, 12, 48),
      new THREE.MeshBasicMaterial({
        color: colour,
        toneMapped: false,
        transparent: true,
        opacity,
      }),
    );
    ring.position.set(position.x, position.y, depth);
    this.orderGroup.add(ring);
  }

  /**
   * Works out the runs of time a node's part spent in each state.
   * @param node The node.
   * @param endTime Where the last run of an unfinished part ends.
   * @returns The runs, oldest first. The root and nodes without a part get no runs.
   */
  private partSpans(node: TreeNode, endTime: number): StateSpan[] {
    const spans: StateSpan[] = [];
    if (node.part === null) {
      return spans;
    }
    const history = node.part.state_history;
    for (let index = 0; index < history.length; index += 1) {
      const change = history[index];
      let end = endTime;
      if (index + 1 < history.length) {
        end = history[index + 1].time;
      } else if (change.state === 'done') {
        end = change.time + FINAL_CAP_SECONDS_SHARE * (endTime - change.time);
      }
      spans.push({
        start: change.time,
        end,
        colour: StateColours.part(change.state, change.reason),
      });
    }
    return spans;
  }

  /**
   * Draws the floor under the tree: a shadow catcher and a faint grid that fades into the fog.
   * @param width The floor's width.
   * @param height Where the floor sits down.
   */
  private addFloor(width: number, height: number): void {
    const size = Math.max(width, TIME_DEPTH) * 3;
    const shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.ShadowMaterial({
        opacity: this.theme.isLight ? 0.12 : 0.3,
      }),
    );
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.set(0, height, -TIME_DEPTH / 2);
    shadowCatcher.receiveShadow = true;
    this.floorGroup.add(shadowCatcher);
    const grid = new THREE.GridHelper(size, Math.round(size / 2), this.theme.colours.muted, this.theme.colours.muted);
    const gridMaterial = grid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = this.theme.isLight ? 0.14 : 0.07;
    grid.position.set(0, height - 0.01, -TIME_DEPTH / 2);
    this.floorGroup.add(grid);
  }

  /**
   * Draws the time axis on the floor beside the tree, with a tick and clock time at round intervals.
   * @param startTime When the order was received.
   * @param endTime Where the axis ends.
   * @param depthOf Turns a time into a depth.
   * @param height Where the axis sits down.
   * @param across Where the axis sits across.
   */
  private addTimeAxis(startTime: number, endTime: number, depthOf: (time: number) => number, height: number, across: number): void {
    const axisColour = this.theme.colours.muted;
    this.addFlatBar(across, height, 0, depthOf(endTime), 0.08, axisColour);
    const span = endTime - startTime;
    let step = TICK_STEPS_SECONDS[TICK_STEPS_SECONDS.length - 1];
    for (const candidate of TICK_STEPS_SECONDS) {
      if (span / candidate <= 8) {
        step = candidate;
        break;
      }
    }
    const times = [
      startTime,
    ];
    for (let time = Math.ceil(startTime / step) * step; time < endTime; time += step) {
      if (time - startTime > step * 0.3) {
        times.push(time);
      }
    }
    for (const time of times) {
      const depth = depthOf(time);
      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.05, 0.08),
        new THREE.MeshBasicMaterial({
          color: axisColour,
        }),
      );
      tick.position.set(across, height, depth);
      this.orderGroup.add(tick);
      const label = labelSprite.create(Formatter.clockTime(time), {
        colour: this.theme.colours.muted,
        height: 0.7,
      });
      label.position.set(across + 1, height + 0.4, depth);
      this.orderGroup.add(label);
    }
    const minorStep = step / this.minorDivisions(step);
    for (let time = Math.ceil(startTime / minorStep) * minorStep; time < endTime; time += minorStep) {
      const stepsFromMajor = time / step;
      if (Math.abs(stepsFromMajor - Math.round(stepsFromMajor)) < 1e-6) {
        continue;
      }
      const minorTick = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.04, 0.05),
        new THREE.MeshBasicMaterial({
          color: axisColour,
          transparent: true,
          opacity: 0.55,
        }),
      );
      minorTick.position.set(across, height, depthOf(time));
      this.orderGroup.add(minorTick);
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
   * Draws a thin bar lying on the floor along time.
   * @param x Where it sits across.
   * @param y Where it sits up.
   * @param startDepth The depth of its near end.
   * @param endDepth The depth of its far end.
   * @param thickness Its width.
   * @param colour Its colour, as CSS.
   */
  private addFlatBar(x: number, y: number, startDepth: number, endDepth: number, thickness: number, colour: string): void {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(thickness, 0.03, Math.abs(endDepth - startDepth)),
      new THREE.MeshBasicMaterial({
        color: colour,
      }),
    );
    bar.position.set(x, y, (startDepth + endDepth) / 2);
    this.orderGroup.add(bar);
  }

  /**
   * Draws a faint plane with a glowing edge across the tree at the current moment, for an order still working.
   * @param depth The depth of now.
   * @param width The plane's width.
   * @param height The plane's height.
   * @param floorHeight Where the floor sits.
   */
  private addNowPlane(depth: number, width: number, height: number, floorHeight: number): void {
    const accent = this.theme.colours.accent;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    plane.position.set(0, floorHeight + height / 2, depth);
    this.orderGroup.add(plane);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, height)),
      new THREE.LineBasicMaterial({
        color: accent,
        toneMapped: false,
      }),
    );
    edge.position.copy(plane.position);
    this.orderGroup.add(edge);
    const label = labelSprite.create('now', {
      colour: accent,
      height: 0.85,
      background: labelSprite.pill(this.theme.colours.surface, 0.8),
      bold: true,
    });
    label.position.set(-width / 2 + 0.6, floorHeight + height - 0.8, depth);
    this.orderGroup.add(label);
  }

  /**
   * Draws the order book as a price ladder standing beside the tree, laid out like a trading screen: prices in a centre column, asks above with bars running right, bids below with bars running left, and quantities at the bars' outer ends. The last traded price is outlined in the price column with an "LTP" tag in the empty half of its row. Each open leg gets a glowing marker at its price in a column to the left, joined to the leg by a thread, and levels queued ahead of a leg glow. The ladder is raised when it would otherwise reach the floor.
   * @param market The market view, whose snapshot is available.
   * @param order The order, for its legs' prices and sides.
   * @param across Where the ladder's left edge, its marker column, sits across.
   * @param preferredMiddle Where the ladder's middle would ideally sit down, level with the tree's middle.
   * @param floorHeight Where the floor is; the ladder stays above it.
   * @param depth Where the ladder stands in time.
   */
  private addLadder(market: MarketView, order: OrderDocument, across: number, preferredMiddle: number, floorHeight: number, depth: number): void {
    const snapshot = market.snapshot;
    if (snapshot === null) {
      return;
    }
    const rowCount = snapshot.asks.length + snapshot.bids.length;
    if (rowCount === 0) {
      return;
    }
    const totalHeight = rowCount * LADDER_ROW + LADDER_SPREAD_GAP;
    const plateHeight = totalHeight + LADDER_PADDING * 2 + 1.2;
    const lowestMiddle = floorHeight + LADDER_FLOOR_CLEARANCE + plateHeight / 2 - 0.6;
    const middleHeight = Math.max(preferredMiddle, lowestMiddle);
    const centre = across + LADDER_MARKER_COLUMN + LADDER_LONGEST_BAR + LADDER_PRICE_HALF_WIDTH + 1;
    this.placeLadder(new THREE.Vector3(centre, middleHeight, depth), floorHeight);

    const rows: {
      price: number;
      quantity: number;
      side: 'bid' | 'ask';
      y: number;
    }[] = [];
    let y = middleHeight + totalHeight / 2;
    for (const level of [...snapshot.asks].reverse()) {
      y -= LADDER_ROW;
      rows.push({
        price: level.price,
        quantity: level.quantity,
        side: 'ask',
        y,
      });
    }
    y -= LADDER_SPREAD_GAP;
    for (const level of snapshot.bids) {
      y -= LADDER_ROW;
      rows.push({
        price: level.price,
        quantity: level.quantity,
        side: 'bid',
        y,
      });
    }
    const ascending = [...rows].sort((first, second) => first.price - second.price);
    const heightOfPrice = (price: number): {
      y: number;
      beyond: boolean;
    } => {
      const lowest = ascending[0];
      const highest = ascending[ascending.length - 1];
      if (price < lowest.price) {
        return {
          y: lowest.y - LADDER_ROW,
          beyond: true,
        };
      }
      if (price > highest.price) {
        return {
          y: highest.y + LADDER_ROW,
          beyond: true,
        };
      }
      for (let index = 1; index < ascending.length; index += 1) {
        const below = ascending[index - 1];
        const above = ascending[index];
        if (price <= above.price) {
          const share = above.price === below.price ? 0 : (price - below.price) / (above.price - below.price);
          return {
            y: below.y + (above.y - below.y) * share,
            beyond: false,
          };
        }
      }
      return {
        y: highest.y,
        beyond: false,
      };
    };

    const aheadKeys = new Set<string>();
    for (const estimate of market.legs) {
      const leg = order.legs.find((candidate) => candidate.leg_id === estimate.leg_id);
      if (leg === undefined || estimate.kind !== 'limit' || leg.price === null) {
        continue;
      }
      for (const row of rows) {
        const sameSide = (leg.transaction_type === 'BUY' && row.side === 'bid') || (leg.transaction_type === 'SELL' && row.side === 'ask');
        const atOrBetter = leg.transaction_type === 'BUY' ? row.price >= leg.price : row.price <= leg.price;
        if (sameSide && atOrBetter) {
          aheadKeys.add(`${row.side}@${row.price}`);
        }
      }
    }

    const title = labelSprite.create(`order book · ${Formatter.clockTime(snapshot.time)}\nlast traded ${Formatter.price(snapshot.last_price)}`, {
      colour: this.theme.colours.ink,
      height: 0.7,
      bold: true,
      anchor: 'centre',
    });
    title.position.set(centre, middleHeight + totalHeight / 2 + 1.5, depth);
    this.ladderContent.add(title);

    let largest = 1;
    for (const row of rows) {
      largest = Math.max(largest, row.quantity);
    }
    for (const row of rows) {
      const colour = row.side === 'bid' ? StateColours.bid() : StateColours.ask();
      const ahead = aheadKeys.has(`${row.side}@${row.price}`);
      const length = 0.4 + (LADDER_LONGEST_BAR * Math.sqrt(row.quantity)) / Math.sqrt(largest);
      const direction = row.side === 'bid' ? -1 : 1;
      const innerEdge = centre + direction * LADDER_PRICE_HALF_WIDTH;
      const outerEdge = innerEdge + direction * length;
      const bar = new THREE.Mesh(new RoundedBoxGeometry(length, LADDER_ROW * 0.72, 0.5, 3, 0.12), this.glossy(colour, ahead ? 0.9 : 0.15, 1));
      bar.position.set((innerEdge + outerEdge) / 2, row.y, depth);
      bar.castShadow = true;
      this.ladderContent.add(bar);
      const price = labelSprite.create(Formatter.price(row.price), {
        colour,
        height: 0.58,
        bold: true,
        anchor: 'centre',
      });
      price.position.set(centre, row.y, depth + 0.3);
      this.ladderContent.add(price);
      const quantity = labelSprite.create(row.quantity.toLocaleString(), {
        colour: this.theme.colours.muted,
        height: 0.46,
      });
      if (row.side === 'bid') {
        quantity.center.set(1, 0.5);
      }
      quantity.position.set(outerEdge + direction * 0.3, row.y, depth + 0.3);
      this.ladderContent.add(quantity);
    }

    if (snapshot.last_price !== null) {
      const last = heightOfPrice(snapshot.last_price);
      const accent = this.theme.colours.accent;
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(LADDER_PRICE_HALF_WIDTH * 2 - 0.2, LADDER_ROW * 0.9)),
        new THREE.LineBasicMaterial({
          color: accent,
          toneMapped: false,
        }),
      );
      outline.position.set(centre, last.y, depth + 0.35);
      this.ladderContent.add(outline);
      const lastRow = rows.find((row) => row.price === snapshot.last_price);
      const tagOnRight = lastRow === undefined || lastRow.side === 'bid';
      const tag = labelSprite.create('LTP', {
        colour: accent,
        height: 0.46,
        bold: true,
        background: labelSprite.pill(this.theme.colours.surface, 0.9),
      });
      if (!tagOnRight) {
        tag.center.set(1, 0.5);
      }
      tag.position.set(centre + (tagOnRight ? 1 : -1) * (LADDER_PRICE_HALF_WIDTH + 0.3), last.y, depth + 0.35);
      this.ladderContent.add(tag);
    }

    for (const estimate of market.legs) {
      const leg = order.legs.find((candidate) => candidate.leg_id === estimate.leg_id);
      const legPosition = this.legPositions.get(estimate.leg_id);
      if (leg === undefined || legPosition === undefined || (estimate.kind !== 'limit' && estimate.kind !== 'stop')) {
        continue;
      }
      const markerPrice = estimate.kind === 'stop' ? leg.trigger_price : leg.price;
      if (markerPrice === null) {
        continue;
      }
      const place = heightOfPrice(markerPrice);
      const colour = StateColours.leg(leg.state);
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.38),
        new THREE.MeshBasicMaterial({
          color: colour,
          toneMapped: false,
        }),
      );
      marker.position.set(across + LADDER_MARKER_COLUMN / 2, place.y, depth);
      this.ladderContent.add(marker);
      const guide = new THREE.Mesh(
        new THREE.BoxGeometry(centre - LADDER_PRICE_HALF_WIDTH - marker.position.x, 0.03, 0.03),
        new THREE.MeshBasicMaterial({
          color: colour,
          transparent: true,
          opacity: 0.35,
        }),
      );
      guide.position.set((marker.position.x + centre - LADDER_PRICE_HALF_WIDTH) / 2, place.y, depth + 0.32);
      this.ladderContent.add(guide);
      this.ladderThreads.push({
        from: new THREE.Vector3(legPosition.x, legPosition.y, depth),
        marker,
        colour,
      });
      let reading = estimate.kind === 'stop' ? `stop ${Formatter.price(markerPrice)}` : `${leg.transaction_type} ${Formatter.price(markerPrice)}`;
      if (estimate.queue_ahead !== null) {
        reading += ` · ${estimate.queue_beyond_visible_depth ? '≥' : ''}${estimate.queue_ahead.toLocaleString()} ahead`;
      }
      if (estimate.minutes_to_front !== null) {
        reading += ` · ~${estimate.minutes_to_front} min`;
      }
      if (place.beyond) {
        reading += ' · beyond visible depth';
      }
      const label = labelSprite.create(reading, {
        colour,
        height: 0.5,
        background: labelSprite.pill(this.theme.colours.surface, 0.85),
      });
      label.center.set(1, 0.5);
      label.position.set(across - 0.2, place.y, depth + 0.2);
      label.userData.outsidePanel = true;
      this.ladderContent.add(label);
    }
      this.addLadderPanel(depth);
    this.ladderRoot.updateMatrixWorld(true);
    this.keepLadderAboveFloor();
    this.drawThreads();
  }

  /**
   * Draws the rounded panel behind the order book, sized to everything drawn on it so no bar, price or quantity spills over its edge. Leg readings marked as outside the panel are left out, because they sit by their threads.
   * @param depth Where the ladder stands in time.
   */
  private addLadderPanel(depth: number): void {
    let left = Infinity;
    let right = -Infinity;
    let bottom = Infinity;
    let top = -Infinity;
    for (const child of this.ladderContent.children) {
      if (child.userData.outsidePanel === true) {
        continue;
      }
      if (child instanceof THREE.Sprite) {
        const width = child.scale.x;
        const height = child.scale.y;
        const childLeft = child.position.x - child.center.x * width;
        const childBottom = child.position.y - child.center.y * height;
        left = Math.min(left, childLeft);
        right = Math.max(right, childLeft + width);
        bottom = Math.min(bottom, childBottom);
        top = Math.max(top, childBottom + height);
      } else if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.computeBoundingBox();
        const box = child.geometry.boundingBox;
        if (box === null) {
          continue;
        }
        left = Math.min(left, child.position.x + box.min.x);
        right = Math.max(right, child.position.x + box.max.x);
        bottom = Math.min(bottom, child.position.y + box.min.y);
        top = Math.max(top, child.position.y + box.max.y);
      }
    }
    if (!Number.isFinite(left)) {
      return;
    }
    const margin = 0.9;
    const width = right - left + margin * 2;
    const height = top - bottom + margin * 2;
    const radius = Math.min(1.2, width / 4, height / 4);
    const shape = new THREE.Shape();
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    shape.moveTo(-halfWidth + radius, -halfHeight);
    shape.lineTo(halfWidth - radius, -halfHeight);
    shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius);
    shape.lineTo(halfWidth, halfHeight - radius);
    shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight);
    shape.lineTo(-halfWidth + radius, halfHeight);
    shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - radius);
    shape.lineTo(-halfWidth, -halfHeight + radius);
    shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight);
    const centreX = (left + right) / 2;
    const centreY = (bottom + top) / 2;
    const panel = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.12,
        bevelEnabled: false,
        curveSegments: 16,
      }),
      new THREE.MeshPhysicalMaterial({
        color: this.theme.colours.surface,
        roughness: 0.4,
        transparent: true,
        opacity: 0.74,
        clearcoat: 0.6,
        depthWrite: false,
      }),
    );
    panel.position.set(centreX, centreY, depth - 0.62);
    panel.receiveShadow = true;
    this.ladderContent.add(panel);
    const border = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(shape.getPoints(16)),
      new THREE.LineBasicMaterial({
        color: this.theme.colours.muted,
        transparent: true,
        opacity: 0.45,
      }),
    );
    border.position.set(centreX, centreY, depth - 0.48);
    this.ladderContent.add(border);
  }

  /**
   * Stands the order book at its default place plus the user's saved move, turn and size, turning about its own middle.
   * @param pivot The ladder's middle where the scene would put it.
   * @param floorHeight Where the floor is.
   */
  private placeLadder(pivot: THREE.Vector3, floorHeight: number): void {
    this.ladderAnchor.copy(pivot);
    this.ladderFloor = floorHeight;
    this.ladderContent.position.copy(pivot).multiplyScalar(-1);
    this.ladderRoot.visible = true;
    if (this.gizmo.dragging) {
      return;
    }
    this.ladderRoot.position.set(pivot.x + this.placement.offset[0], pivot.y + this.placement.offset[1], pivot.z + this.placement.offset[2]);
    this.ladderRoot.rotation.set(this.placement.rotation[0], this.placement.rotation[1], this.placement.rotation[2]);
    this.ladderRoot.scale.setScalar(this.placement.scale);
  }

  /** Lifts the order book if any part of it has gone below the floor. */
  private keepLadderAboveFloor(): void {
    this.ladderRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.ladderContent);
    const lowestAllowed = this.ladderFloor + 0.2;
    if (box.min.y < lowestAllowed) {
      this.ladderRoot.position.y += lowestAllowed - box.min.y;
      this.ladderRoot.updateMatrixWorld(true);
    }
  }

  /** Redraws the threads from each leg to its marker, wherever the order book now stands. */
  private drawThreads(): void {
    for (const child of [...this.threadGroup.children]) {
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
      this.threadGroup.remove(child);
    }
    this.ladderRoot.updateMatrixWorld(true);
    for (const thread of this.ladderThreads) {
      const end = thread.marker.getWorldPosition(new THREE.Vector3());
      const line = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints([
          thread.from,
          end,
        ]),
        new THREE.LineDashedMaterial({
          color: thread.colour,
          dashSize: 0.35,
          gapSize: 0.25,
          transparent: true,
          opacity: 0.85,
        }),
      );
      line.computeLineDistances();
      this.threadGroup.add(line);
    }
  }

  /** Shows the handle on the order book in the chosen mode, or hides it. */
  private attachGizmo(): void {
    if (this.ladderMode === 'off' || !this.ladderRoot.visible) {
      this.gizmo.detach();
      return;
    }
    this.gizmo.attach(this.ladderRoot);
    this.gizmo.setMode(this.ladderMode);
  }

  /** Saves the user's move, turn and size as an adjustment from the default place. */
  private savePlacement(): void {
    this.placement = {
      offset: [
        this.ladderRoot.position.x - this.ladderAnchor.x,
        this.ladderRoot.position.y - this.ladderAnchor.y,
        this.ladderRoot.position.z - this.ladderAnchor.z,
      ],
      rotation: [
        this.ladderRoot.rotation.x,
        this.ladderRoot.rotation.y,
        this.ladderRoot.rotation.z,
      ],
      scale: this.ladderRoot.scale.x,
    };
    ladderPlacement.save(this.placement);
  }

  /**
   * Holds the camera still while the handle is dragged, and saves the placement when the drag ends.
   * @param event The handle's event, whose value is true while dragging.
   */
  private readonly handleGizmoDragging = (event: { value: unknown }): void => {
    this.controls.enabled = event.value !== true;
    if (event.value !== true) {
      this.savePlacement();
    }
  };

  /** Keeps a resize even and within limits, keeps the order book above the floor, and moves the threads with it. */
  private readonly handleGizmoChange = (): void => {
    if (this.ladderMode === 'scale') {
      const previous = this.placement.scale;
      const scale = this.ladderRoot.scale;
      let chosen = scale.x;
      for (const component of [
        scale.y,
        scale.z,
      ]) {
        if (Math.abs(component - previous) > Math.abs(chosen - previous)) {
          chosen = component;
        }
      }
      const even = Math.min(LADDER_LARGEST_SCALE, Math.max(LADDER_SMALLEST_SCALE, chosen));
      scale.setScalar(even);
    }
    this.keepLadderAboveFloor();
    this.drawThreads();
  };

  /** Makes the instanced particles for every resting leg drawn in this pass. */
  private buildParticles(): void {
    if (this.particleTracks.length === 0) {
      return;
    }
    const mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.11, 12, 8),
      new THREE.MeshBasicMaterial({
        toneMapped: false,
      }),
      this.particleTracks.length * PARTICLES_PER_LEG,
    );
    const colour = new THREE.Color();
    let index = 0;
    for (const track of this.particleTracks) {
      colour.set(track.colour).multiplyScalar(1.6);
      for (let particle = 0; particle < PARTICLES_PER_LEG; particle += 1) {
        mesh.setColorAt(index, colour);
        index += 1;
      }
    }
    mesh.frustumCulled = false;
    this.particles = mesh;
    this.orderGroup.add(mesh);
  }

  /** Removes the drawn order and frees its GPU resources. */
  private clearOrder(): void {
    this.orderGroup.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
      if (object instanceof THREE.Sprite) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
    this.particles = null;
    this.particleTracks = [];
    this.halos = [];
    this.legPositions = new Map();
    this.ladderContent.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
      if (object instanceof THREE.Sprite) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
    this.ladderContent.clear();
    this.ladderThreads = [];
    this.ladderRoot.visible = false;
    this.scene.remove(this.orderGroup);
    this.orderGroup = new THREE.Group();
    this.floorGroup = new THREE.Group();
    this.threadGroup = new THREE.Group();
    this.orderGroup.add(this.floorGroup);
    this.orderGroup.add(this.threadGroup);
    this.scene.add(this.orderGroup);
  }
}
