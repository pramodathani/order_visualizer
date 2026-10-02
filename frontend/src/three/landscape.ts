import * as THREE from 'three';

import type { Animal, AnimalWorld } from './animal';
import { Dog } from './dog';
import { Squirrel } from './squirrel';
import { TreeModels } from './treeModels';
import type { TreeModel } from './treeModels';
import { ValueNoise } from './valueNoise';

const GROUND_SIZE = 16000;
const GROUND_SEGMENTS = 220;
const TREE_COUNT = 900;
const DOG_COUNT = 4;
const SQUIRREL_COUNT = 12;
const MOUNTAIN_STEPS = 540;
const GRASS_COLOURS = [
  new THREE.Color('#3f6b32'),
  new THREE.Color('#557f3c'),
  new THREE.Color('#6b8f45'),
];
const MUD_COLOUR = new THREE.Color('#6e5436');
const DRY_MUD_COLOUR = new THREE.Color('#8a6f4b');
const NEAR_MOUNTAIN_COLOUR = new THREE.Color('#4a5a6a');
const FAR_MOUNTAIN_COLOUR = new THREE.Color('#7f90a3');
const SNOW_COLOUR = new THREE.Color('#e8eef5');

/** One ring of mountains on the horizon. */
interface MountainRing {
  mesh: THREE.Mesh;
  baseColour: THREE.Color;
  haze: number;
}

/**
 * The land around the arena: rolling ground of grass and mud, clumps of pine and broadleaf trees, and two rings of mountains on the horizon.
 * The arena itself stays flat and clear, with more worn mud around its edge, like a site.
 */
export class Landscape {
  readonly group = new THREE.Group();
  private readonly noise = new ValueNoise(20261002);
  private ground: THREE.Mesh | null = null;
  private treeModels: TreeModel[] | null = null;
  readonly treePositions: THREE.Vector3[] = [];
  private animals: Animal[] = [];
  private mountains: MountainRing[] = [];
  private builtFor = '';
  private floorHeight = 0;
  private arenaCentre = new THREE.Vector2();
  private arenaRadius = 50;

  /**
   * Builds the land for an arena, unless it is already built for one of about the same place and size.
   * @param floorHeight The arena floor's height.
   * @param centre The arena's middle across and in depth.
   * @param radius How far the arena reaches from its middle.
   */
  build(floorHeight: number, centre: THREE.Vector2, radius: number): void {
    const key = `${Math.round(floorHeight)}|${Math.round(centre.x / 10)}|${Math.round(centre.y / 10)}|${Math.round(radius / 10)}`;
    if (key === this.builtFor) {
      return;
    }
    this.builtFor = key;
    this.floorHeight = floorHeight;
    this.arenaCentre.copy(centre);
    this.arenaRadius = Math.max(radius, 20);
    this.clear();
    this.buildGround();
    this.buildTrees();
    this.buildMountains();
    this.releaseAnimals();
  }

  /**
   * Moves every animal on by one frame.
   * @param deltaSeconds Seconds since the previous frame.
   */
  update(deltaSeconds: number): void {
    const step = Math.min(deltaSeconds, 0.1);
    for (const animal of this.animals) {
      animal.update(step);
    }
  }

  /**
   * Tints the mountains towards the sky's haze by day, more for the farther ring, and dims them at night. The material colour multiplies the rock and snow colours stored in the mountains' vertices.
   * @param haze The fog colour of the moment.
   * @param daylight From 0 at night to 1 in full day.
   */
  setAtmosphere(haze: THREE.Color, daylight: number): void {
    for (const ring of this.mountains) {
      const material = ring.mesh.material as THREE.MeshBasicMaterial;
      material.color.setScalar(0.3 + 0.7 * daylight).lerp(haze.clone().multiplyScalar(1 / Math.max(ring.baseColour.r, 0.2)), ring.haze * daylight);
    }
  }

  /** Frees every GPU resource the landscape holds. */
  dispose(): void {
    this.clear();
    for (const model of this.treeModels ?? []) {
      model.wood.dispose();
      model.foliage.dispose();
    }
    this.treeModels = null;
  }

  /** Lays the ground: gentle hills away from the arena, coloured grass and mud by noise. */
  private buildGround(): void {
    const geometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGMENTS, GROUND_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colours = new Float32Array(positions.count * 3);
    const colour = new THREE.Color();
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index) + this.arenaCentre.x;
      const z = positions.getZ(index) + this.arenaCentre.y;
      positions.setX(index, x);
      positions.setZ(index, z);
      positions.setY(index, this.groundHeightAt(x, z));
      this.groundColour(x, z, colour);
      colours[index * 3] = colour.r;
      colours[index * 3 + 1] = colour.g;
      colours[index * 3 + 2] = colour.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      map: this.grassDetailTexture(),
    });
    this.ground = new THREE.Mesh(geometry, material);
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
  }

  /**
   * The ground's height: flat at the arena and rising into gentle hills further out.
   * @param x Across.
   * @param z In depth.
   * @returns The height.
   */
  groundHeightAt(x: number, z: number): number {
    const distance = Math.hypot(x - this.arenaCentre.x, z - this.arenaCentre.y);
    const hilliness = THREE.MathUtils.smoothstep(distance, this.arenaRadius * 2, this.arenaRadius * 5 + 300);
    const hills = this.noise.fractal(x / 260, z / 260, 4) - 0.35;
    return this.floorHeight - 0.15 + Math.max(hills, -0.1) * 70 * hilliness;
  }

  /**
   * The ground's colour at a point: grass in three greens, with mud in patches and worn into a ring round the arena.
   * @param x Across.
   * @param z In depth.
   * @param target Where to write the colour.
   */
  private groundColour(x: number, z: number, target: THREE.Color): void {
    const distance = Math.hypot(x - this.arenaCentre.x, z - this.arenaCentre.y);
    const grassTone = this.noise.fractal(x / 40, z / 40, 3);
    if (grassTone < 0.45) {
      target.copy(GRASS_COLOURS[0]).lerp(GRASS_COLOURS[1], grassTone / 0.45);
    } else {
      target.copy(GRASS_COLOURS[1]).lerp(GRASS_COLOURS[2], (grassTone - 0.45) / 0.55);
    }
    const wornSite = 1 - THREE.MathUtils.smoothstep(distance, this.arenaRadius * 1.1, this.arenaRadius * 1.8);
    const mudPatches = THREE.MathUtils.smoothstep(this.noise.fractal(x / 90 + 50, z / 90 - 20, 4), 0.58, 0.7);
    const mud = Math.max(wornSite * 0.75, mudPatches);
    const mudColour = MUD_COLOUR.clone().lerp(DRY_MUD_COLOUR, this.noise.sample(x / 15, z / 15));
    target.lerp(mudColour, mud);
  }

  /**
   * Draws a small repeating texture of grass blades and specks, laid over the ground's colours for close-up detail.
   * @returns The texture, repeating every 6 units.
   */
  private grassDetailTexture(): THREE.Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const random = new ValueNoise(7).sequence();
    if (context !== null) {
      context.fillStyle = '#d8d8d8';
      context.fillRect(0, 0, size, size);
      for (let blade = 0; blade < 2600; blade += 1) {
        const shade = Math.round(150 + random() * 105);
        context.strokeStyle = `rgb(${shade}, ${shade}, ${shade})`;
        context.lineWidth = 1;
        const x = random() * size;
        const y = random() * size;
        const lean = (random() - 0.5) * 4;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + lean, y - 3 - random() * 6);
        context.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(GROUND_SIZE / 6, GROUND_SIZE / 6);
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /** Plants detailed pines, broadleaf trees and birches in clumps outside the arena, each on the ground's surface, turned, sized and tinted differently. */
  private buildTrees(): void {
    const models = this.models();
    const species: number[] = [];
    for (let variant = 0; variant < models.length; variant += 1) {
      species.push(variant);
    }
    const random = this.noise.sequence();
    const chosen: {
      variant: number;
      matrix: THREE.Matrix4;
      tint: THREE.Color;
    }[] = [];
    const clearance = this.arenaRadius * 2 + 40;
    const reach = clearance + 1100;
    let attempts = 0;
    while (chosen.length < TREE_COUNT && attempts < TREE_COUNT * 12) {
      attempts += 1;
      const angle = random() * Math.PI * 2;
      const distance = clearance + Math.pow(random(), 1.2) * (reach - clearance);
      const x = this.arenaCentre.x + Math.cos(angle) * distance;
      const z = this.arenaCentre.y + Math.sin(angle) * distance;
      if (this.noise.fractal(x / 120 + 7, z / 120 + 3, 3) < 0.5 && random() > 0.15) {
        continue;
      }
      const pick = random();
      let variant: number;
      if (pick < 0.45) {
        variant = Math.floor(random() * 3);
      } else if (pick < 0.85) {
        variant = 3 + Math.floor(random() * 3);
      } else {
        variant = 6 + Math.floor(random() * 2);
      }
      const size = 0.7 + random() * 0.7;
      const position = new THREE.Vector3(x, this.groundHeightAt(x, z) - 0.15, z);
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2);
      const scale = new THREE.Vector3(size, size * (0.9 + random() * 0.25), size);
      const shade = 0.82 + random() * 0.3;
      chosen.push({
        variant,
        matrix: new THREE.Matrix4().compose(position, rotation, scale),
        tint: new THREE.Color(shade, shade * (0.97 + random() * 0.06), shade),
      });
      this.treePositions.push(position);
    }
    for (const variant of species) {
      const planted = chosen.filter((tree) => tree.variant === variant);
      if (planted.length === 0) {
        continue;
      }
      const model = models[variant];
      const wood = new THREE.InstancedMesh(model.wood, new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        flatShading: true,
      }), planted.length);
      const foliage = new THREE.InstancedMesh(model.foliage, new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        flatShading: true,
      }), planted.length);
      planted.forEach((tree, index) => {
        wood.setMatrixAt(index, tree.matrix);
        foliage.setMatrixAt(index, tree.matrix);
        foliage.setColorAt(index, tree.tint);
      });
      for (const mesh of [
        wood,
        foliage,
      ]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor !== null) {
          mesh.instanceColor.needsUpdate = true;
        }
        mesh.computeBoundingSphere();
        this.group.add(mesh);
      }
    }
  }

  /**
   * The tree shapes, built once and shared by every rebuild: three pines, three broadleaf trees and two birches.
   * @returns The models, in that order.
   */
  private models(): TreeModel[] {
    if (this.treeModels === null) {
      const builder = new TreeModels();
      this.treeModels = [
        builder.pine(0),
        builder.pine(1),
        builder.pine(2),
        builder.broadleaf(0),
        builder.broadleaf(1),
        builder.broadleaf(2),
        builder.birch(0),
        builder.birch(1),
      ];
    }
    return this.treeModels;
  }

  /** Lets dogs loose in the meadow round the arena and squirrels at the feet of trees. */
  private releaseAnimals(): void {
    const random = new ValueNoise(99).sequence();
    const world: AnimalWorld = {
      groundHeightAt: (x, z) => this.groundHeightAt(x, z),
      arenaCentre: this.arenaCentre.clone(),
      arenaRadius: this.arenaRadius,
      treePositions: this.treePositions,
    };
    for (let index = 0; index < DOG_COUNT; index += 1) {
      const angle = random() * Math.PI * 2;
      const distance = this.arenaRadius * (1.3 + random() * 0.6);
      const start = new THREE.Vector2(this.arenaCentre.x + Math.cos(angle) * distance, this.arenaCentre.y + Math.sin(angle) * distance);
      this.addAnimal(new Dog(world, random, start));
    }
    for (let index = 0; index < SQUIRREL_COUNT && this.treePositions.length > 0; index += 1) {
      const tree = this.treePositions[Math.floor(random() * Math.min(this.treePositions.length, 200))];
      this.addAnimal(new Squirrel(world, random, new THREE.Vector2(tree.x + 1, tree.z + 1)));
    }
  }

  /**
   * Adds an animal to the land.
   * @param animal The animal.
   */
  private addAnimal(animal: Animal): void {
    this.animals.push(animal);
    this.group.add(animal.model);
  }

  /** Raises two rings of mountains on the horizon, the farther one paler as distant hills look, with snow on the highest peaks. */
  private buildMountains(): void {
    this.mountains.push(this.mountainRing(5200, 520, 1, NEAR_MOUNTAIN_COLOUR, 0.45));
    this.mountains.push(this.mountainRing(6800, 900, 2, FAR_MOUNTAIN_COLOUR, 0.62));
  }

  /**
   * Builds one ring of mountains as a strip of ridges.
   * @param radius How far the ring stands from the arena.
   * @param height The tallest peaks' height.
   * @param seedOffset Shifts the noise so the two rings differ.
   * @param baseColour The rock colour.
   * @param haze How much of the sky's haze the ring takes on, from 0 to 1.
   * @returns The ring.
   */
  private mountainRing(radius: number, height: number, seedOffset: number, baseColour: THREE.Color, haze: number): MountainRing {
    const positions: number[] = [];
    const colours: number[] = [];
    const indices: number[] = [];
    const base = this.floorHeight - 40;
    for (let step = 0; step <= MOUNTAIN_STEPS; step += 1) {
      const angle = (step / MOUNTAIN_STEPS) * Math.PI * 2;
      const ridge = this.noise.fractal(Math.cos(angle) * 4 + seedOffset * 10, Math.sin(angle) * 4 - seedOffset * 10, 5);
      const peak = base + Math.pow(ridge, 1.6) * height * 1.8 + height * 0.15;
      const x = this.arenaCentre.x + Math.cos(angle) * radius;
      const z = this.arenaCentre.y + Math.sin(angle) * radius;
      const outward = 1 + 0.04 * (ridge - 0.5);
      const shoulder = base + (peak - base) * 0.7;
      positions.push(x, base, z);
      positions.push(this.arenaCentre.x + Math.cos(angle) * radius * (1 + (outward - 1) * 0.7), shoulder, this.arenaCentre.y + Math.sin(angle) * radius * (1 + (outward - 1) * 0.7));
      positions.push(this.arenaCentre.x + Math.cos(angle) * radius * outward, peak, this.arenaCentre.y + Math.sin(angle) * radius * outward);
      const foot = baseColour.clone().multiplyScalar(0.7);
      colours.push(foot.r, foot.g, foot.b);
      colours.push(baseColour.r, baseColour.g, baseColour.b);
      const snow = THREE.MathUtils.smoothstep(peak - base, height * 1.1, height * 1.5);
      const top = baseColour.clone().lerp(SNOW_COLOUR, snow);
      colours.push(top.r, top.g, top.b);
      if (step < MOUNTAIN_STEPS) {
        const here = step * 3;
        const next = here + 3;
        indices.push(here, next, here + 1, here + 1, next, next + 1);
        indices.push(here + 1, next + 1, here + 2, here + 2, next + 1, next + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    mesh.renderOrder = -1;
    this.group.add(mesh);
    return {
      mesh,
      baseColour: baseColour.clone(),
      haze,
    };
  }

  /** Removes and frees everything built so far, keeping the shared tree shapes for the next build. */
  private clear(): void {
    const shared = new Set<THREE.BufferGeometry>();
    for (const model of this.treeModels ?? []) {
      shared.add(model.wood);
      shared.add(model.foliage);
    }
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (!shared.has(object.geometry)) {
          object.geometry.dispose();
        }
        const material = object.material as THREE.MeshStandardMaterial;
        material.map?.dispose();
        material.dispose();
      }
    });
    this.group.clear();
    this.ground = null;
    this.treePositions.length = 0;
    this.mountains = [];
    for (const animal of this.animals) {
      animal.dispose();
    }
    this.animals = [];
  }
}
