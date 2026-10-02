import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { ValueNoise } from './valueNoise';

/** One tree shape: its wood and its foliage, each a single merged geometry with colours in its vertices. */
export interface TreeModel {
  wood: THREE.BufferGeometry;
  foliage: THREE.BufferGeometry;
}

const BARK = new THREE.Color('#5b4130');
const BIRCH_BARK = new THREE.Color('#e4e0d6');
const PINE_DARK = new THREE.Color('#1f4026');
const PINE_LIGHT = new THREE.Color('#3f6e3c');
const LEAF_DARK = new THREE.Color('#2f5a26');
const LEAF_LIGHT = new THREE.Color('#78a347');
const BIRCH_DARK = new THREE.Color('#4f7a2c');
const BIRCH_LIGHT = new THREE.Color('#a6c45a');

/**
 * Builds detailed low-poly tree shapes: pines with stacked jagged tiers, broadleaf trees with lumpy clustered crowns on limbed trunks, and white-barked birches.
 * Each shape is built from several pieces merged into one wood and one foliage geometry, faceted, and shaded darker inside the crown and lighter at the tips.
 */
export class TreeModels {
  private readonly noise = new ValueNoise(4711);

  /**
   * Builds a pine.
   * @param variant Picks one of several shapes.
   * @returns The pine's wood and foliage.
   */
  pine(variant: number): TreeModel {
    const random = new ValueNoise(100 + variant).sequence();
    const height = 8 + random() * 3;
    const tiers = 4 + Math.floor(random() * 2);
    const wood = this.trunk(0.18, 0.34, height * 0.9, BARK);
    const pieces: THREE.BufferGeometry[] = [];
    for (let tier = 0; tier < tiers; tier += 1) {
      const share = tier / (tiers - 1);
      const radius = 2.6 * (1 - share * 0.72) * (0.9 + random() * 0.2);
      const tierHeight = 3.2 * (1 - share * 0.35);
      const cone = new THREE.ConeGeometry(radius, tierHeight, 9, 2, true);
      cone.translate(0, 2.2 + share * (height - 4) + tierHeight / 2, 0);
      cone.rotateY(random() * Math.PI);
      this.roughen(cone, 0.35, variant * 13 + tier);
      pieces.push(cone);
    }
    const foliage = this.finish(pieces, PINE_DARK, PINE_LIGHT, height);
    return {
      wood,
      foliage,
    };
  }

  /**
   * Builds a broadleaf tree with a crown of several leafy clusters on a trunk with limbs.
   * @param variant Picks one of several shapes.
   * @returns The tree's wood and foliage.
   */
  broadleaf(variant: number): TreeModel {
    const random = new ValueNoise(200 + variant).sequence();
    const trunkHeight = 4 + random() * 1.5;
    const woodPieces = [
      this.trunk(0.26, 0.45, trunkHeight, BARK),
    ];
    const clusters: THREE.BufferGeometry[] = [];
    const clusterCount = 5 + Math.floor(random() * 3);
    for (let cluster = 0; cluster < clusterCount; cluster += 1) {
      const angle = (cluster / clusterCount) * Math.PI * 2 + random() * 0.6;
      const reach = cluster === 0 ? 0 : 1.2 + random() * 1.1;
      const lift = trunkHeight + 0.8 + random() * 2.2;
      const x = Math.cos(angle) * reach;
      const z = Math.sin(angle) * reach;
      if (cluster > 0) {
        woodPieces.push(this.limb(new THREE.Vector3(0, trunkHeight - 0.6, 0), new THREE.Vector3(x * 0.8, lift - 0.5, z * 0.8), 0.12, BARK));
      }
      const size = cluster === 0 ? 2.2 : 1.3 + random() * 0.7;
      const blob = new THREE.IcosahedronGeometry(size, 1);
      blob.scale(1, 0.8 + random() * 0.25, 1);
      blob.translate(x, lift, z);
      this.roughen(blob, 0.45, variant * 17 + cluster);
      clusters.push(blob);
    }
    return {
      wood: this.mergeColoured(woodPieces, BARK),
      foliage: this.finish(clusters, LEAF_DARK, LEAF_LIGHT, trunkHeight + 5),
    };
  }

  /**
   * Builds a birch: a slender white trunk with a light, airy crown of small clusters.
   * @param variant Picks one of several shapes.
   * @returns The birch's wood and foliage.
   */
  birch(variant: number): TreeModel {
    const random = new ValueNoise(300 + variant).sequence();
    const height = 7 + random() * 2.5;
    const lean = (random() - 0.5) * 0.15;
    const wood = this.trunk(0.11, 0.2, height, BIRCH_BARK);
    wood.rotateZ(lean);
    const clusters: THREE.BufferGeometry[] = [];
    const clusterCount = 6 + Math.floor(random() * 3);
    for (let cluster = 0; cluster < clusterCount; cluster += 1) {
      const lift = height * (0.5 + random() * 0.5);
      const angle = random() * Math.PI * 2;
      const reach = 0.4 + random() * 1.1 * (1 - (lift / height - 0.5));
      const blob = new THREE.IcosahedronGeometry(0.8 + random() * 0.5, 1);
      blob.scale(1, 1.3, 1);
      blob.translate(Math.cos(angle) * reach + lean * -lift, lift, Math.sin(angle) * reach);
      this.roughen(blob, 0.3, variant * 19 + cluster);
      clusters.push(blob);
    }
    return {
      wood,
      foliage: this.finish(clusters, BIRCH_DARK, BIRCH_LIGHT, height + 1),
    };
  }

  /**
   * Builds a tapering trunk standing on the ground, with flecks of darker bark.
   * @param topRadius Its radius at the top.
   * @param bottomRadius Its radius at the ground.
   * @param height Its height.
   * @param colour Its bark colour.
   * @returns The trunk, coloured in its vertices.
   */
  private trunk(topRadius: number, bottomRadius: number, height: number, colour: THREE.Color): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 7, 4);
    geometry.translate(0, height / 2, 0);
    this.roughen(geometry, 0.04, Math.round(height * 10));
    return this.mergeColoured(
      [
        geometry,
      ],
      colour,
      true,
    );
  }

  /**
   * Builds a limb from one point to another.
   * @param from Where it leaves the trunk.
   * @param to Where it ends inside the crown.
   * @param radius Its thickness.
   * @param colour Its bark colour.
   * @returns The limb.
   */
  private limb(from: THREE.Vector3, to: THREE.Vector3, radius: number, colour: THREE.Color): THREE.BufferGeometry {
    const length = from.distanceTo(to);
    const geometry = new THREE.CylinderGeometry(radius * 0.6, radius, length, 5);
    geometry.translate(0, length / 2, 0);
    const direction = to.clone().sub(from).normalize();
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction));
    geometry.translate(from.x, from.y, from.z);
    return this.mergeColoured(
      [
        geometry,
      ],
      colour,
      true,
    );
  }

  /**
   * Pushes each point of a shape in or out a little by noise, so leaves and bark look ragged rather than geometric.
   * @param geometry The shape, changed in place.
   * @param amount How far a point may move.
   * @param seed Makes each piece different.
   */
  private roughen(geometry: THREE.BufferGeometry, amount: number, seed: number): void {
    const positions = geometry.attributes.position;
    const point = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index);
      const push = (this.noise.sample(point.x * 1.7 + seed, point.z * 1.7 + point.y) - 0.5) * 2 * amount;
      const outward = new THREE.Vector3(point.x, 0, point.z);
      if (outward.lengthSq() > 0.0001) {
        outward.normalize();
      }
      point.addScaledVector(outward, push);
      point.y += (this.noise.sample(point.y * 2 + seed, point.x * 2) - 0.5) * amount * 0.6;
      positions.setXYZ(index, point.x, point.y, point.z);
    }
  }

  /**
   * Merges foliage pieces into one faceted geometry, shaded from dark low and inside to light at the top and outer tips.
   * @param pieces The pieces.
   * @param dark The colour deep in the crown.
   * @param light The colour at the sunlit tips.
   * @param height The tree's height, for shading by height.
   * @returns The merged foliage.
   */
  private finish(pieces: THREE.BufferGeometry[], dark: THREE.Color, light: THREE.Color, height: number): THREE.BufferGeometry {
    const prepared: THREE.BufferGeometry[] = [];
    for (const piece of pieces) {
      const flat = piece.toNonIndexed();
      flat.deleteAttribute('uv');
      flat.computeVertexNormals();
      const positions = flat.attributes.position;
      const colours = new Float32Array(positions.count * 3);
      const colour = new THREE.Color();
      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index);
        const y = positions.getY(index);
        const z = positions.getZ(index);
        const heightShare = THREE.MathUtils.clamp(y / height, 0, 1);
        const outward = THREE.MathUtils.clamp(Math.hypot(x, z) / 3, 0, 1);
        const speckle = this.noise.sample(x * 3 + y, z * 3) * 0.25;
        colour.copy(dark).lerp(light, THREE.MathUtils.clamp(heightShare * 0.55 + outward * 0.35 + speckle, 0, 1));
        colours[index * 3] = colour.r;
        colours[index * 3 + 1] = colour.g;
        colours[index * 3 + 2] = colour.b;
      }
      flat.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      prepared.push(flat);
      piece.dispose();
    }
    const merged = mergeGeometries(prepared) ?? new THREE.BufferGeometry();
    for (const piece of prepared) {
      piece.dispose();
    }
    return merged;
  }

  /**
   * Merges pieces into one geometry in one colour, with optional darker flecks.
   * @param pieces The pieces.
   * @param colour Their colour.
   * @param flecked Whether to add darker flecks, as bark has.
   * @returns The merged geometry with position, normal and colour attributes.
   */
  private mergeColoured(pieces: THREE.BufferGeometry[], colour: THREE.Color, flecked = false): THREE.BufferGeometry {
    const prepared: THREE.BufferGeometry[] = [];
    for (const piece of pieces) {
      const flat = piece.index === null ? piece : piece.toNonIndexed();
      if (flat.attributes.uv !== undefined) {
        flat.deleteAttribute('uv');
      }
      flat.computeVertexNormals();
      if (flat.attributes.color === undefined) {
        const positions = flat.attributes.position;
        const colours = new Float32Array(positions.count * 3);
        const shade = new THREE.Color();
        for (let index = 0; index < positions.count; index += 1) {
          const fleck = flecked ? this.noise.sample(positions.getY(index) * 4, positions.getX(index) * 9 + positions.getZ(index) * 9) : 0.5;
          shade.copy(colour).multiplyScalar(flecked ? 0.75 + fleck * 0.45 : 1);
          colours[index * 3] = shade.r;
          colours[index * 3 + 1] = shade.g;
          colours[index * 3 + 2] = shade.b;
        }
        flat.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      }
      prepared.push(flat);
    }
    return mergeGeometries(prepared) ?? new THREE.BufferGeometry();
  }
}
