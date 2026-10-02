import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

const SKY_SIZE = 15000;
const NIGHT_FOG = new THREE.Color('#0b1222');
const DAY_FOG = new THREE.Color('#b9cde3');
const DUSK_FOG = new THREE.Color('#d9a07a');
const WARM_LIGHT = new THREE.Color('#ffb27a');
const WHITE_LIGHT = new THREE.Color('#ffffff');
const NIGHT_LIGHT = new THREE.Color('#9fb3d9');

/** How the scene should be lit for one position of the sun. */
export interface SkyLighting {
  keyColour: THREE.Color;
  keyIntensity: number;
  fillIntensity: number;
  fogColour: THREE.Color;
  environmentIntensity: number;
  exposure: number;
  daylight: number;
}

/**
 * The sky around the scene: a physically based atmosphere with its sun disc and drifting clouds, which follows the camera so it always surrounds it.
 */
export class SkyDome {
  readonly sky: Sky;
  readonly sunDirection = new THREE.Vector3(0, 1, 0);
  private elevationDegrees = 90;

  /** Creates the sky with clear-afternoon settings and broken clouds. */
  constructor() {
    this.sky = new Sky();
    this.sky.scale.setScalar(SKY_SIZE);
    this.sky.frustumCulled = false;
    const uniforms = this.sky.material.uniforms;
    uniforms.turbidity.value = 5;
    uniforms.rayleigh.value = 1.4;
    uniforms.mieCoefficient.value = 0.004;
    uniforms.mieDirectionalG.value = 0.8;
    uniforms.cloudCoverage.value = 0.42;
    uniforms.cloudDensity.value = 0.45;
    uniforms.cloudScale.value = 0.0002;
    uniforms.cloudSpeed.value = 0.00002;
    uniforms.cloudElevation.value = 0.5;
  }

  /**
   * Places the sun.
   * @param elevationDegrees Height above the horizon; negative is below it.
   * @param azimuthDegrees Clockwise from north. The scene's north is away from the viewer (negative z) and east is to the right (positive x).
   */
  setSun(elevationDegrees: number, azimuthDegrees: number): void {
    this.elevationDegrees = elevationDegrees;
    const elevation = THREE.MathUtils.degToRad(elevationDegrees);
    const azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
    this.sunDirection.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation));
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDirection);
  }

  /**
   * Keeps the sky centred on the camera and moves the clouds along.
   * @param elapsedSeconds Seconds since the scene started.
   * @param camera The camera.
   */
  update(elapsedSeconds: number, camera: THREE.Camera): void {
    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.time.value = elapsedSeconds;
  }

  /**
   * Works out the light for the sun's height: white and strong by day, warm near sunrise and sunset, and a dim cool light at night that keeps the scene readable.
   * @returns The key light's colour and strength, the fill light's strength, the fog colour, how strongly reflections show, and the camera exposure, which opens up at night as eyes adjust.
   */
  lighting(): SkyLighting {
    const daylight = THREE.MathUtils.smoothstep(this.elevationDegrees, -6, 10);
    const warmth = (1 - THREE.MathUtils.smoothstep(this.elevationDegrees, 4, 25)) * daylight;
    const keyColour = NIGHT_LIGHT.clone().lerp(WHITE_LIGHT, daylight).lerp(WARM_LIGHT, warmth * 0.8);
    const fogColour = NIGHT_FOG.clone().lerp(DAY_FOG, daylight).lerp(DUSK_FOG, warmth * 0.55);
    return {
      keyColour,
      keyIntensity: 0.7 + 1.1 * daylight,
      fillIntensity: 0.8 + 0.1 * daylight,
      fogColour,
      environmentIntensity: 0.15 + 0.3 * daylight,
      exposure: 1 - 0.5 * daylight,
      daylight,
    };
  }

  /**
   * Says whether the sun is high enough to cast the scene's shadows.
   * @returns True when it is more than 3 degrees above the horizon.
   */
  isSunUp(): boolean {
    return this.elevationDegrees > 3;
  }

  /** Frees the sky's GPU resources. */
  dispose(): void {
    this.sky.geometry.dispose();
    this.sky.material.dispose();
  }
}
