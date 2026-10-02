import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { Leg, OrderDocument } from '../api/types';
import { Formatter } from '../utilities/formatter';
import { StateColours } from '../utilities/stateColours';
import { labelSprite } from './labelSprite';
import { PlanLayout } from './planLayout';
import type { TreeNode } from './planLayout';
import { SceneController } from './sceneController';

const COLUMN_SPACING = 11;
const LEVEL_SPACING = 7;
const TIME_DEPTH = 36;
const LEG_SPACING = 1.1;
const LEG_THICKNESS = 0.55;
const FINAL_CAP_LENGTH = 0.35;
const FINAL_CAP_SECONDS_SHARE = 0.02;
const FINAL_LEG_STATES = new Set([
  'filled',
  'cancelled',
  'rejected',
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
const TEXT_COLOUR = '#e8eaed';
const MUTED_COLOUR = '#9aa0a6';
const WIRE_COLOUR = 0x9aa0a6;

/** A run of time spent in one state. */
interface StateSpan {
  start: number;
  end: number;
  colour: string;
}

/**
 * Draws one order as a 3D tree: the plan's parts across and down, and time running away from the viewer.
 * Each leg is a bar that starts when the engine asked for it and changes colour as it rests, fills or is cancelled.
 */
export class PlanTreeScene extends SceneController {
  private readonly controls: OrbitControls;
  private readonly layout = new PlanLayout();
  private orderGroup = new THREE.Group();
  private fittedOrderId: string | null = null;

  /**
   * Creates the scene on a canvas.
   * @param canvas The canvas to draw on.
   * @throws Error when the browser cannot create a WebGL context.
   */
  constructor(canvas: HTMLCanvasElement) {
    super(canvas, 45);
    this.scene.background = new THREE.Color('#1e2129');
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const light = new THREE.DirectionalLight(0xffffff, 1.6);
    light.position.set(20, 40, 30);
    this.scene.add(light);
    this.scene.add(this.orderGroup);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
  }

  /**
   * Draws an order, replacing whatever was drawn before.
   * The camera is moved to fit the order only when a different order is shown, so live updates keep the user's view.
   * @param order The order to draw.
   * @param now The current time in epoch seconds, where an unfinished order's open bars end.
   */
  showOrder(order: OrderDocument, now: number): void {
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
      const appearedAt = node.part?.first_seen_at ?? startTime;
      const nodeDepth = depthOf(appearedAt);
      if (node.parentPath !== null) {
        const parentPosition = positions.get(node.parentPath) as THREE.Vector3;
        this.addLine(
          new THREE.Vector3(parentPosition.x, parentPosition.y, nodeDepth),
          new THREE.Vector3(position.x, position.y, nodeDepth),
          WIRE_COLOUR,
        );
      }
      this.addNode(node, order, position, nodeDepth);
      this.addRail(this.partSpans(node, endTime), position, depthOf);
      node.legs.forEach((leg, index) => {
        const legPosition = new THREE.Vector3(position.x + (index + 1) * LEG_SPACING, position.y, 0);
        this.addLeg(leg, legPosition, depthOf, endTime);
      });
    }

    const floor = -deepest * LEVEL_SPACING - 3;
    this.addTimeAxis(startTime, endTime, depthOf, floor, -middle - 4);
    if (!order.finished) {
      this.addNowPlane(depthOf(endTime), widest * COLUMN_SPACING + 12, deepest * LEVEL_SPACING + 8, -deepest * LEVEL_SPACING / 2);
    }

    if (this.fittedOrderId !== order.parent_order_id) {
      this.fittedOrderId = order.parent_order_id;
      this.fitCamera();
    }
  }

  /** Points the camera at the drawn order from the front, above and to the right, close enough that it fills the canvas's height. */
  private fitCamera(): void {
    const bounds = new THREE.Box3().setFromObject(this.orderGroup);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const halfFieldOfView = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const distance = (sphere.radius / Math.sin(halfFieldOfView)) * 0.85;
    const direction = new THREE.Vector3(0.55, 0.3, 0.75).normalize();
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.controls.update();
  }

  /**
   * Turns the camera with damping on every frame.
   * @param elapsedSeconds Seconds since the scene started.
   * @param deltaSeconds Seconds since the previous frame.
   */
  protected update(elapsedSeconds: number, deltaSeconds: number): void {
    void elapsedSeconds;
    void deltaSeconds;
    this.controls.update();
  }

  /** Frees the drawn order and the camera controls. */
  protected disposeResources(): void {
    this.clearOrder();
    this.controls.dispose();
  }

  /**
   * Draws a node as a sphere coloured by its part's state, with its label.
   * @param node The node.
   * @param order The order, whose state colours the root.
   * @param position Where the node sits across and down.
   * @param depth Where the node sits in time.
   */
  private addNode(node: TreeNode, order: OrderDocument, position: THREE.Vector3, depth: number): void {
    let colour = StateColours.UNKNOWN;
    let stateText = '';
    if (node.parentPath === null) {
      colour = StateColours.parent(order.state);
      stateText = order.state ?? '';
    } else if (node.part !== null) {
      colour = StateColours.part(node.part.state, node.part.reason);
      stateText = node.part.reason !== null ? `${node.part.state} (${node.part.reason})` : (node.part.state ?? '');
    }
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(node.parentPath === null ? 1.1 : 0.8, 24, 16),
      new THREE.MeshStandardMaterial({
        color: colour,
        roughness: 0.5,
      }),
    );
    sphere.position.set(position.x, position.y, depth);
    this.orderGroup.add(sphere);
    const label = labelSprite.create(`${node.label}\n${stateText}`, TEXT_COLOUR, 1.3);
    label.position.set(position.x - 1, position.y + 2.6, depth);
    this.orderGroup.add(label);
  }

  /**
   * Draws a thin rail along time behind a node, coloured by each state the part was in.
   * @param spans The part's state spans.
   * @param position Where the node sits across and down.
   * @param depthOf Turns a time into a depth.
   */
  private addRail(spans: StateSpan[], position: THREE.Vector3, depthOf: (time: number) => number): void {
    for (const span of spans) {
      this.addBar(position, depthOf(span.start), depthOf(span.end), 0.18, span.colour, 0.55);
    }
  }

  /**
   * Draws one leg as a bar along time, one segment per state, with a label at its start.
   * @param leg The leg.
   * @param position Where the leg sits across and down.
   * @param depthOf Turns a time into a depth.
   * @param endTime Where an open leg's last segment ends.
   */
  private addLeg(leg: Leg, position: THREE.Vector3, depthOf: (time: number) => number, endTime: number): void {
    const history = leg.state_history;
    if (history.length === 0) {
      return;
    }
    for (let index = 0; index < history.length; index += 1) {
      const change = history[index];
      const startDepth = depthOf(change.time);
      let endDepth: number;
      if (index + 1 < history.length) {
        endDepth = depthOf(history[index + 1].time);
      } else if (FINAL_LEG_STATES.has(change.state)) {
        endDepth = startDepth - FINAL_CAP_LENGTH;
      } else {
        endDepth = depthOf(endTime);
      }
      this.addBar(position, startDepth, endDepth, LEG_THICKNESS, StateColours.leg(change.state), 1);
    }
    if (leg.cancel_requested_at !== null) {
      this.addRing(position, depthOf(leg.cancel_requested_at), StateColours.LEG.cancelled);
    }
    const side = leg.transaction_type ?? '';
    const quantity = leg.quantity ?? '';
    const priceText = leg.trigger_price !== null ? `${Formatter.price(leg.price)} trig ${Formatter.price(leg.trigger_price)}` : Formatter.price(leg.price);
    const label = labelSprite.create(`${side} ${quantity} @ ${priceText}\n${leg.order_type ?? ''} ${leg.state ?? ''}`.trim(), MUTED_COLOUR, 0.9);
    label.position.set(position.x + 0.7, position.y + 1.2, depthOf(history[0].time) - 3);
    this.orderGroup.add(label);
  }

  /**
   * Works out the runs of time a node's part spent in each state.
   * @param node The node.
   * @param endTime Where the last run ends.
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
   * Draws a box running along time.
   * @param position Where the box sits across and down.
   * @param startDepth The depth of its near end.
   * @param endDepth The depth of its far end.
   * @param thickness Its width and height.
   * @param colour Its colour, as CSS.
   * @param opacity How opaque it is, from 0 to 1.
   */
  private addBar(position: THREE.Vector3, startDepth: number, endDepth: number, thickness: number, colour: string, opacity: number): void {
    const length = Math.max(Math.abs(endDepth - startDepth), 0.05);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(thickness, thickness, length),
      new THREE.MeshStandardMaterial({
        color: colour,
        roughness: 0.6,
        transparent: opacity < 1,
        opacity,
      }),
    );
    box.position.set(position.x, position.y, (startDepth + endDepth) / 2);
    this.orderGroup.add(box);
  }

  /**
   * Draws a ring around a leg where the engine asked for it to be cancelled.
   * @param position Where the leg sits across and down.
   * @param depth The depth of the cancel request.
   * @param colour The ring's colour, as CSS.
   */
  private addRing(position: THREE.Vector3, depth: number, colour: string): void {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.07, 8, 32),
      new THREE.MeshStandardMaterial({
        color: colour,
      }),
    );
    ring.position.set(position.x, position.y, depth);
    this.orderGroup.add(ring);
  }

  /**
   * Draws a dashed straight line.
   * @param from One end.
   * @param to The other end.
   * @param colour The line's colour.
   */
  private addLine(from: THREE.Vector3, to: THREE.Vector3, colour: number): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      from,
      to,
    ]);
    const line = new THREE.LineSegments(
      geometry,
      new THREE.LineDashedMaterial({
        color: colour,
        dashSize: 0.5,
        gapSize: 0.4,
      }),
    );
    line.computeLineDistances();
    this.orderGroup.add(line);
  }

  /**
   * Draws the time axis below the tree, with a tick and clock time at round intervals.
   * @param startTime When the order was received.
   * @param endTime Where the axis ends.
   * @param depthOf Turns a time into a depth.
   * @param height Where the axis sits down.
   * @param across Where the axis sits across.
   */
  private addTimeAxis(startTime: number, endTime: number, depthOf: (time: number) => number, height: number, across: number): void {
    this.addLine(new THREE.Vector3(across, height, 0), new THREE.Vector3(across, height, depthOf(endTime)), WIRE_COLOUR);
    const span = endTime - startTime;
    let step = TICK_STEPS_SECONDS[TICK_STEPS_SECONDS.length - 1];
    for (const candidate of TICK_STEPS_SECONDS) {
      if (span / candidate <= 8) {
        step = candidate;
        break;
      }
    }
    const firstTick = Math.ceil(startTime / step) * step;
    const times = [
      startTime,
    ];
    for (let time = firstTick; time < endTime; time += step) {
      if (time - startTime > step * 0.3) {
        times.push(time);
      }
    }
    for (const time of times) {
      const depth = depthOf(time);
      this.addLine(new THREE.Vector3(across - 0.6, height, depth), new THREE.Vector3(across + 0.6, height, depth), WIRE_COLOUR);
      const label = labelSprite.create(Formatter.clockTime(time), MUTED_COLOUR, 1.0);
      label.position.set(across + 0.9, height, depth);
      this.orderGroup.add(label);
    }
  }

  /**
   * Draws a faint plane across the tree at the current moment, for an order still working.
   * @param depth The depth of now.
   * @param width The plane's width.
   * @param height The plane's height.
   * @param middleHeight Where the plane's middle sits down.
   */
  private addNowPlane(depth: number, width: number, height: number, middleHeight: number): void {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        color: '#ff8a65',
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    plane.position.set(0, middleHeight, depth);
    this.orderGroup.add(plane);
    const label = labelSprite.create('now', '#ff8a65', 0.8);
    label.position.set(-width / 2 + 1, middleHeight + height / 2 - 1, depth);
    this.orderGroup.add(label);
  }

  /** Removes the drawn order and frees its GPU resources. */
  private clearOrder(): void {
    this.orderGroup.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        object.material.dispose();
      }
      if (object instanceof THREE.Sprite) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
    this.scene.remove(this.orderGroup);
    this.orderGroup = new THREE.Group();
    this.scene.add(this.orderGroup);
  }
}
