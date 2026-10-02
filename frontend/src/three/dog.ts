import * as THREE from 'three';

import { Animal } from './animal';
import type { AnimalWorld } from './animal';

const COATS = [
  '#a0642c',
  '#d9a75a',
  '#2b2b2b',
  '#e8e2d6',
];

/**
 * A dog that roams the meadow between the arena and the trees: it trots or sprints to a spot, sniffs about for a moment, and sets off again, legs swinging in diagonal pairs and tail wagging.
 */
export class Dog extends Animal {
  private readonly legs: THREE.Group[] = [];
  private readonly tail = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly body = new THREE.Group();

  /**
   * Creates a dog with a coat chosen from a few common colours.
   * @param world The land it runs on.
   * @param random A repeatable random sequence.
   * @param start Where it starts, across and in depth.
   */
  constructor(world: AnimalWorld, random: () => number, start: THREE.Vector2) {
    super(world, random, start);
    const coatColour = COATS[Math.floor(random() * COATS.length)];
    const fur = this.coat(coatColour);
    const dark = this.coat('#1a1410');
    const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.72, 4, 10), fur);
    trunk.rotation.x = Math.PI / 2;
    this.body.add(trunk);
    this.body.position.y = 0.78;
    this.model.add(this.body);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), fur);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.26), fur);
    snout.position.set(0, -0.05, 0.24);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), dark);
    nose.position.set(0, -0.02, 0.38);
    this.head.add(skull, snout, nose);
    for (const side of [
      -1,
      1,
    ]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), fur);
      ear.position.set(side * 0.12, 0.2, -0.03);
      ear.rotation.z = -side * 0.35;
      this.head.add(ear);
    }
    this.head.position.set(0, 0.28, 0.6);
    this.body.add(this.head);

    for (const [x, z] of [
      [-0.15, 0.4],
      [0.15, 0.4],
      [-0.15, -0.4],
      [0.15, -0.4],
    ]) {
      const leg = new THREE.Group();
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.56, 6), fur);
      bone.position.y = -0.28;
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), fur);
      paw.position.set(0, -0.56, 0.03);
      leg.add(bone, paw);
      leg.position.set(x, -0.08, z);
      this.body.add(leg);
      this.legs.push(leg);
    }

    const tailBone = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.48, 6), fur);
    tailBone.position.y = 0.24;
    this.tail.add(tailBone);
    this.tail.position.set(0, 0.12, -0.6);
    this.tail.rotation.x = -0.9;
    this.body.add(this.tail);
    const size = 0.85 + random() * 0.35;
    this.model.scale.setScalar(size);
  }

  /**
   * Picks a spot in the meadow ring between the arena and the trees.
   * @returns The target.
   */
  protected chooseTarget(): THREE.Vector3 {
    return this.pointInRing(1.25, 2, 25);
  }

  /**
   * Trots most of the time and sometimes sprints.
   * @returns Units per second.
   */
  protected chooseSpeed(): number {
    return this.random() < 0.35 ? 7 + this.random() * 2 : 2.6 + this.random();
  }

  /**
   * Sniffs about for a moment.
   * @returns Seconds.
   */
  protected choosePause(): number {
    return 0.8 + this.random() * 3.5;
  }

  /**
   * Turns fairly quickly.
   * @returns Radians per second.
   */
  protected turnRate(): number {
    return 3.2;
  }

  /**
   * Legs cycle about twice a unit.
   * @returns Radians per unit.
   */
  protected strideRate(): number {
    return 4.2;
  }

  /**
   * Swings the legs in diagonal pairs, bobs the body and head, and wags the tail, faster when running.
   * @param moving Whether the dog is running.
   * @param deltaSeconds Seconds since the previous frame.
   */
  protected animate(moving: boolean, deltaSeconds: number): void {
    void deltaSeconds;
    const swing = moving ? Math.min(0.9, 0.35 + this.speed * 0.08) : 0;
    const phase = this.gaitPhase;
    this.legs[0].rotation.x = Math.sin(phase) * swing;
    this.legs[3].rotation.x = Math.sin(phase) * swing;
    this.legs[1].rotation.x = Math.sin(phase + Math.PI) * swing;
    this.legs[2].rotation.x = Math.sin(phase + Math.PI) * swing;
    this.body.position.y = 0.78 + (moving ? Math.abs(Math.sin(phase)) * 0.06 * Math.min(1, this.speed / 4) : 0);
    this.body.rotation.x = moving ? Math.sin(phase * 2) * 0.04 : 0;
    this.head.rotation.x = moving ? Math.sin(phase * 2) * 0.08 : Math.sin(this.elapsedSeconds * 1.7) * 0.25 + 0.3;
    this.head.rotation.y = moving ? 0 : Math.sin(this.elapsedSeconds * 0.9) * 0.5;
    this.tail.rotation.z = Math.sin(this.elapsedSeconds * (moving ? 14 : 9)) * 0.55;
  }
}
