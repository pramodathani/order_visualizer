import * as THREE from 'three';

import { Animal } from './animal';
import type { AnimalWorld } from './animal';

const FURS = [
  '#a0522d',
  '#8f8a83',
  '#7a4a2a',
];

/**
 * A squirrel that lives among the trees: it darts in quick hops to the foot of a tree, freezes, sometimes sits up, and dashes on, its bushy tail curled over its back.
 */
export class Squirrel extends Animal {
  private readonly legs: THREE.Group[] = [];
  private readonly tail = new THREE.Group();
  private readonly body = new THREE.Group();
  private sittingUp = false;

  /**
   * Creates a squirrel in red, grey or brown.
   * @param world The land it runs on.
   * @param random A repeatable random sequence.
   * @param start Where it starts, across and in depth.
   */
  constructor(world: AnimalWorld, random: () => number, start: THREE.Vector2) {
    super(world, random, start);
    const fur = this.coat(FURS[Math.floor(random() * FURS.length)]);
    const belly = this.coat('#e9dcc4');
    const dark = this.coat('#151010');
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), fur);
    torso.scale.set(0.9, 0.85, 1.4);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), belly);
    chest.position.set(0, -0.05, 0.12);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 9, 7), fur);
    head.position.set(0, 0.12, 0.26);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), dark);
    eye.position.set(0.075, 0.15, 0.33);
    const otherEye = eye.clone();
    otherEye.position.x = -0.075;
    this.body.add(torso, chest, head, eye, otherEye);
    for (const side of [
      -1,
      1,
    ]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 4), fur);
      ear.position.set(side * 0.06, 0.25, 0.23);
      this.body.add(ear);
    }
    for (const [x, z, length] of [
      [-0.08, 0.14, 0.14],
      [0.08, 0.14, 0.14],
      [-0.1, -0.12, 0.18],
      [0.1, -0.12, 0.18],
    ]) {
      const leg = new THREE.Group();
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, length, 5), fur);
      bone.position.y = -length / 2;
      leg.add(bone);
      leg.position.set(x, -0.08, z);
      this.body.add(leg);
      this.legs.push(leg);
    }
    const tufts = [
      [0, 0.02, -0.22, 0.1],
      [0, 0.16, -0.3, 0.13],
      [0, 0.34, -0.3, 0.15],
      [0, 0.48, -0.2, 0.14],
      [0, 0.52, -0.06, 0.11],
    ];
    for (const [x, y, z, radius] of tufts) {
      const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), fur);
      tuft.position.set(x, y, z);
      this.tail.add(tuft);
    }
    this.tail.position.set(0, 0.05, -0.05);
    this.body.add(this.tail);
    this.body.position.y = 0.24;
    this.model.add(this.body);
    this.model.scale.setScalar(1.1 + random() * 0.3);
  }

  /**
   * Heads for the foot of a nearby tree, or a short dash across open ground.
   * @returns The target.
   */
  protected chooseTarget(): THREE.Vector3 {
    const trees = this.world.treePositions;
    const position = this.model.position;
    if (trees.length > 0 && this.random() < 0.8) {
      let best = trees[Math.floor(this.random() * trees.length)];
      for (let tries = 0; tries < 6; tries += 1) {
        const candidate = trees[Math.floor(this.random() * trees.length)];
        if (candidate.distanceTo(position) < best.distanceTo(position)) {
          best = candidate;
        }
      }
      const angle = this.random() * Math.PI * 2;
      const x = best.x + Math.cos(angle) * 0.9;
      const z = best.z + Math.sin(angle) * 0.9;
      return new THREE.Vector3(x, this.world.groundHeightAt(x, z), z);
    }
    const angle = this.random() * Math.PI * 2;
    const reach = 4 + this.random() * 10;
    const x = position.x + Math.cos(angle) * reach;
    const z = position.z + Math.sin(angle) * reach;
    return new THREE.Vector3(x, this.world.groundHeightAt(x, z), z);
  }

  /**
   * Squirrels dart.
   * @returns Units per second.
   */
  protected chooseSpeed(): number {
    return 3.5 + this.random() * 3;
  }

  /**
   * Freezes for a moment, and sits up half the time.
   * @returns Seconds.
   */
  protected choosePause(): number {
    this.sittingUp = this.random() < 0.5;
    return 0.4 + this.random() * 2.6;
  }

  /**
   * Turns very quickly.
   * @returns Radians per second.
   */
  protected turnRate(): number {
    return 7;
  }

  /**
   * Many quick hops per unit.
   * @returns Radians per unit.
   */
  protected strideRate(): number {
    return 9;
  }

  /**
   * Hops the body, sweeps the legs together as squirrels bound, sways the tail, and sits up when paused.
   * @param moving Whether the squirrel is running.
   * @param deltaSeconds Seconds since the previous frame.
   */
  protected animate(moving: boolean, deltaSeconds: number): void {
    void deltaSeconds;
    const phase = this.gaitPhase;
    if (moving) {
      this.sittingUp = false;
      const hop = Math.abs(Math.sin(phase));
      this.body.position.y = 0.24 + hop * 0.22;
      this.body.rotation.x = Math.cos(phase) * 0.25;
      this.legs[0].rotation.x = Math.sin(phase) * 0.9;
      this.legs[1].rotation.x = Math.sin(phase) * 0.9;
      this.legs[2].rotation.x = -Math.sin(phase) * 0.9;
      this.legs[3].rotation.x = -Math.sin(phase) * 0.9;
      this.tail.rotation.x = -Math.cos(phase) * 0.3;
    } else {
      this.body.position.y = this.sittingUp ? 0.3 : 0.24;
      this.body.rotation.x = this.sittingUp ? -0.9 : 0;
      for (const leg of this.legs) {
        leg.rotation.x = 0;
      }
      this.tail.rotation.x = Math.sin(this.elapsedSeconds * 2.2) * 0.12;
    }
    this.tail.rotation.z = Math.sin(this.elapsedSeconds * 3.1) * 0.15;
  }
}
