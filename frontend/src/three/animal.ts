import * as THREE from 'three';

/** What an animal needs to know about the land it runs on. */
export interface AnimalWorld {
  groundHeightAt: (x: number, z: number) => number;
  arenaCentre: THREE.Vector2;
  arenaRadius: number;
  treePositions: THREE.Vector3[];
}

/**
 * The shared mechanism of every animal: wandering to a target, turning smoothly, pausing, and keeping its feet on the ground.
 * Each kind of animal builds its own model, chooses its own targets and speeds, and animates its own gait.
 */
export abstract class Animal {
  readonly model = new THREE.Group();
  protected readonly world: AnimalWorld;
  protected readonly random: () => number;
  protected heading = 0;
  protected speed = 0;
  protected gaitPhase = 0;
  protected pauseSeconds = 0;
  protected elapsedSeconds = 0;
  private target: THREE.Vector3 | null = null;

  /**
   * Creates the animal at a starting point.
   * @param world The land it runs on.
   * @param random A repeatable random sequence.
   * @param start Where it starts, across and in depth.
   */
  constructor(world: AnimalWorld, random: () => number, start: THREE.Vector2) {
    this.world = world;
    this.random = random;
    this.heading = random() * Math.PI * 2;
    this.model.position.set(start.x, world.groundHeightAt(start.x, start.y), start.y);
  }

  /**
   * Moves the animal on by one frame: pausing, choosing a new target, turning towards it and running, then animating its gait.
   * @param deltaSeconds Seconds since the previous frame.
   */
  update(deltaSeconds: number): void {
    this.elapsedSeconds += deltaSeconds;
    let moving = false;
    if (this.pauseSeconds > 0) {
      this.pauseSeconds -= deltaSeconds;
      this.speed = Math.max(0, this.speed - deltaSeconds * 8);
    } else {
      if (this.target === null) {
        this.target = this.chooseTarget();
        this.speed = this.chooseSpeed();
      }
      const position = this.model.position;
      const toTarget = new THREE.Vector2(this.target.x - position.x, this.target.z - position.z);
      if (toTarget.length() < 0.6) {
        this.target = null;
        this.pauseSeconds = this.choosePause();
      } else {
        const wanted = Math.atan2(toTarget.x, toTarget.y);
        let difference = wanted - this.heading;
        difference = Math.atan2(Math.sin(difference), Math.cos(difference));
        const turn = Math.sign(difference) * Math.min(Math.abs(difference), this.turnRate() * deltaSeconds);
        this.heading += turn;
        const slowdown = 1 - (Math.abs(difference) / Math.PI) * 0.7;
        const step = this.speed * slowdown * deltaSeconds;
        position.x += Math.sin(this.heading) * step;
        position.z += Math.cos(this.heading) * step;
        moving = true;
      }
    }
    this.model.position.y = this.world.groundHeightAt(this.model.position.x, this.model.position.z);
    this.model.rotation.y = this.heading;
    this.gaitPhase += deltaSeconds * this.speed * this.strideRate();
    this.animate(moving, deltaSeconds);
  }

  /** Frees the model's geometries and materials. */
  dispose(): void {
    this.model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
  }

  /**
   * Picks a random point in a ring around the arena.
   * @param innerShare The ring's inner edge as a multiple of the arena radius.
   * @param outerShare The ring's outer edge as a multiple of the arena radius.
   * @param extra Units added to the outer edge.
   * @returns The point on the ground.
   */
  protected pointInRing(innerShare: number, outerShare: number, extra: number): THREE.Vector3 {
    const angle = this.random() * Math.PI * 2;
    const inner = this.world.arenaRadius * innerShare;
    const outer = this.world.arenaRadius * outerShare + extra;
    const distance = inner + this.random() * (outer - inner);
    const x = this.world.arenaCentre.x + Math.cos(angle) * distance;
    const z = this.world.arenaCentre.y + Math.sin(angle) * distance;
    return new THREE.Vector3(x, this.world.groundHeightAt(x, z), z);
  }

  /**
   * Makes a shaded material for a body part.
   * @param colour The colour.
   * @returns A matte, faceted material.
   */
  protected coat(colour: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: colour,
      roughness: 0.85,
      flatShading: true,
    });
  }

  /**
   * Chooses where to go next.
   * @returns The target on the ground.
   */
  protected abstract chooseTarget(): THREE.Vector3;

  /**
   * Chooses how fast to go to the next target.
   * @returns Units per second.
   */
  protected abstract chooseSpeed(): number;

  /**
   * Chooses how long to stay still on arriving.
   * @returns Seconds.
   */
  protected abstract choosePause(): number;

  /**
   * How quickly the animal can turn.
   * @returns Radians per second.
   */
  protected abstract turnRate(): number;

  /**
   * How quickly the legs cycle for each unit of speed.
   * @returns Gait cycles in radians per unit travelled.
   */
  protected abstract strideRate(): number;

  /**
   * Poses the model for this frame: legs, tail, head and body.
   * @param moving Whether the animal is running towards a target.
   * @param deltaSeconds Seconds since the previous frame.
   */
  protected abstract animate(moving: boolean, deltaSeconds: number): void;
}
