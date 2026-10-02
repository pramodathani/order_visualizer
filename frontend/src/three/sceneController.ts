import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { solarPosition } from '../utilities/solarPosition';
import type { SunPlace } from '../utilities/solarPosition';
import type { Theme } from '../utilities/themes';
import { Landscape } from './landscape';
import { SkyDome } from './skyDome';

/** What a plain left-drag does: turn the view, or slide the arena along the ground. */
export type DragMode = 'rotate' | 'pan';

const DOUBLE_CLICK_ZOOM = 0.45;
const SKY_REFRESH_SECONDS = 0.4;
const SKY_TIME_STEP_SECONDS = 20;
const ENVIRONMENT_REFRESH_DEGREES = 2;
const PLAIN_EXPOSURE = 1.05;
const DEFAULT_LIGHT_DIRECTION = new THREE.Vector3(0.4, 1, 0.5).normalize();

/** Told whenever the sky moves to another time. */
export type SkyListener = (epochSeconds: number, sun: SunPlace) => void;
const NEAREST_DISTANCE = 3;

/** A camera move in progress. */
interface CameraFlight {
  fromPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPosition: THREE.Vector3;
  toTarget: THREE.Vector3;
  startedAt: number;
  seconds: number;
}

/**
 * The shared mechanism of every scene: the renderer, studio lighting, soft shadows, glow, fog, the orbiting camera and its smooth flights, the animation loop, theming, resizing and cleanup.
 */
export abstract class SceneController {
  protected readonly renderer: THREE.WebGLRenderer;
  protected readonly scene: THREE.Scene;
  protected readonly camera: THREE.PerspectiveCamera;
  protected readonly controls: OrbitControls;
  protected readonly keyLight: THREE.DirectionalLight;
  protected theme: Theme;
  protected elapsedSeconds = 0;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly hemisphere: THREE.HemisphereLight;
  private environment: THREE.Texture;
  private readonly roomEnvironment: THREE.Texture;
  private readonly environmentGenerator: THREE.PMREMGenerator;
  private skyDome: SkyDome | null = null;
  private landscape: Landscape | null = null;
  private environmentSky: SkyDome | null = null;
  private readonly environmentScene = new THREE.Scene();
  private lastEnvironmentDirection: THREE.Vector3 | null = null;
  private skyTime: number | null = null;
  private skyListener: SkyListener | null = null;
  private secondsSinceSkyCheck = 0;
  private readonly lightDirection = DEFAULT_LIGHT_DIRECTION.clone();
  private lastShadowBounds: THREE.Box3 | null = null;
  private fogColour = new THREE.Color();
  private groundHeight = 0;
  private flight: CameraFlight | null = null;
  private home: {
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null = null;
  private readonly canvasElement: HTMLCanvasElement;
  private readonly doubleClickRaycaster = new THREE.Raycaster();
  private frameRequest = 0;
  private running = false;
  private previousTime = 0;

  /**
   * Creates the renderer on a canvas, with lighting, glow and an orbiting perspective camera.
   * @param canvas The canvas to draw on.
   * @param fieldOfView The camera's vertical field of view, in degrees.
   * @param theme The theme to draw in.
   * @throws Error when the browser cannot create a WebGL context.
   */
  constructor(canvas: HTMLCanvasElement, fieldOfView: number, theme: Theme) {
    this.theme = theme;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = PLAIN_EXPOSURE;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(fieldOfView, 1, 0.1, 40000);

    this.environmentGenerator = new THREE.PMREMGenerator(this.renderer);
    this.roomEnvironment = this.environmentGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.environment = this.roomEnvironment;
    this.scene.environment = this.environment;

    this.hemisphere = new THREE.HemisphereLight(0xffffff, 0x222233, 0.6);
    this.scene.add(this.hemisphere);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    this.keyLight.position.set(40, 80, 30);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.radius = 4;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
      samples: 4,
      type: THREE.HalfFloatType,
    });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = NEAREST_DISTANCE;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.maxDistance = 3000;
    this.controls.addEventListener('start', this.cancelFlight);
    this.canvasElement = canvas;
    canvas.addEventListener('dblclick', this.handleDoubleClick);

    this.styleForTheme(theme);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  /**
   * Chooses what a plain left-drag does. Shift-drag and right-drag always do the other.
   * @param mode "rotate" to turn the view, or "pan" to slide the arena along the ground.
   */
  setDragMode(mode: DragMode): void {
    if (mode === 'pan') {
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };
      this.controls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_ROTATE,
      };
    } else {
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      this.controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };
    }
  }

  /**
   * Glides the camera around the point it looks at, about the vertical axis.
   * @param degrees How far to turn; positive turns the view to the left.
   */
  turnView(degrees: number): void {
    const target = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(degrees));
    this.flyTo(target.clone().add(offset), target, 0.45);
  }

  /**
   * Glides the camera towards or away from the point it looks at.
   * @param factor Below 1 moves closer (0.7 is a 30% step in); above 1 moves away.
   */
  zoomView(factor: number): void {
    const target = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(target);
    const distance = Math.max(offset.length() * factor, NEAREST_DISTANCE);
    offset.setLength(distance);
    this.flyTo(target.clone().add(offset), target, 0.35);
  }

  /** Glides back to the whole-scene view the scene last fitted. */
  fitView(): void {
    if (this.home !== null) {
      this.flyTo(this.home.position, this.home.target, 0.8);
    }
  }

  /**
   * Shows or hides the sky, sun and clouds. With the sky hidden the theme's plain background and lighting return.
   * @param enabled Whether to show the sky.
   */
  setSkyEnabled(enabled: boolean): void {
    if (enabled && this.skyDome === null) {
      this.skyDome = new SkyDome();
      this.scene.add(this.skyDome.sky);
      this.landscape = new Landscape();
      this.scene.add(this.landscape.group);
      this.buildLandscape();
      this.skyTime = null;
      this.lastEnvironmentDirection = null;
      this.secondsSinceSkyCheck = SKY_REFRESH_SECONDS;
    } else if (!enabled && this.skyDome !== null) {
      this.scene.remove(this.skyDome.sky);
      this.skyDome.dispose();
      this.skyDome = null;
      if (this.landscape !== null) {
        this.scene.remove(this.landscape.group);
        this.landscape.dispose();
        this.landscape = null;
      }
      this.useEnvironment(this.roomEnvironment);
      this.lightDirection.copy(DEFAULT_LIGHT_DIRECTION);
      this.styleForTheme(this.theme);
      this.placeKeyLight();
    }
  }

  /**
   * Registers what to tell when the sky moves to another time, such as the page's readout.
   * @param listener Called with the time and the sun's place, or null to stop.
   */
  setSkyListener(listener: SkyListener | null): void {
    this.skyListener = listener;
    if (listener !== null && this.skyTime !== null) {
      listener(this.skyTime, solarPosition.at(this.skyTime));
    }
  }

  /** Starts the animation loop. */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.requestFrame();
  }

  /** Stops the animation loop, leaving the last frame on the canvas. */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameRequest);
  }

  /**
   * Restyles the background, fog, lighting and glow for a theme. Subclasses redraw their contents afterwards so every colour follows.
   * @param theme The theme.
   */
  applyTheme(theme: Theme): void {
    this.styleForTheme(theme);
  }

  /**
   * Restyles the background, fog, lighting and glow for a theme, without touching anything a subclass draws. The constructor calls this rather than applyTheme, because a subclass's own fields do not exist yet while the base constructor runs.
   * @param theme The theme.
   */
  private styleForTheme(theme: Theme): void {
    this.theme = theme;
    this.fogColour = new THREE.Color(theme.colours.background);
    const background = new THREE.Color(theme.colours.background);
    this.scene.background = background;
    const fogNear = this.scene.fog instanceof THREE.Fog ? this.scene.fog.near : 200;
    const fogFar = this.scene.fog instanceof THREE.Fog ? this.scene.fog.far : 900;
    this.scene.fog = new THREE.Fog(background, fogNear, fogFar);
    this.hemisphere.color.set(theme.isLight ? 0xffffff : 0xdfe6ff);
    this.hemisphere.groundColor.set(theme.colours.background);
    this.hemisphere.intensity = theme.isLight ? 1.1 : 0.55;
    this.keyLight.intensity = theme.isLight ? 1.8 : 1.5;
    this.scene.environmentIntensity = theme.isLight ? 0.9 : 0.45;
    this.bloom.enabled = !theme.isLight;
    this.renderer.toneMappingExposure = PLAIN_EXPOSURE;
    this.bloom.strength = 0.65;
    this.bloom.threshold = 0.78;
    this.renderer.toneMapping = theme.isLight ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    if (this.skyDome !== null) {
      this.styleForSky();
    }
  }

  /**
   * Tells the sky where the scene's floor is, so its ground meets the floor.
   * @param height The floor's height.
   */
  protected setGroundHeight(height: number): void {
    this.groundHeight = height;
  }

  /** Builds the land, trees and mountains around the area last given to fitShadows, keeping that area flat and clear. */
  private buildLandscape(): void {
    if (this.landscape === null || this.lastShadowBounds === null) {
      return;
    }
    const centre = this.lastShadowBounds.getCenter(new THREE.Vector3());
    const size = this.lastShadowBounds.getSize(new THREE.Vector3());
    this.landscape.build(this.groundHeight, new THREE.Vector2(centre.x, centre.z), Math.max(size.x, size.z) / 2);
    if (this.skyDome !== null) {
      const lighting = this.skyDome.lighting();
      this.landscape.setAtmosphere(lighting.fogColour, lighting.daylight);
    }
  }

  /**
   * The time at the point the camera looks at, which the sky follows. Scenes whose depth is time override this.
   * @returns The epoch time, or null when the scene has no time to show.
   */
  protected focusTime(): number | null {
    return null;
  }

  /** Lights the scene from the sky: the sun's colour and strength, a dim fill, sky-coloured fog and reflections of the sky, with the bloom calmed so the bright sky does not glow. */
  private styleForSky(): void {
    if (this.skyDome === null) {
      return;
    }
    const lighting = this.skyDome.lighting();
    this.scene.background = null;
    this.landscape?.setAtmosphere(lighting.fogColour, lighting.daylight);
    this.keyLight.color.copy(lighting.keyColour);
    this.keyLight.intensity = lighting.keyIntensity;
    this.hemisphere.color.set(0xdfe9ff);
    this.hemisphere.intensity = lighting.fillIntensity;
    this.scene.environmentIntensity = lighting.environmentIntensity;
    this.fogColour = lighting.fogColour;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.fogColour);
    }
    this.bloom.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = lighting.exposure;
  }

  /** Moves the sky to the time at the camera's focus when that time has moved far enough. */
  private followFocusTime(): void {
    if (this.skyDome === null) {
      return;
    }
    const time = this.focusTime();
    if (time === null) {
      return;
    }
    if (this.skyTime !== null && Math.abs(time - this.skyTime) < SKY_TIME_STEP_SECONDS) {
      return;
    }
    this.skyTime = time;
    const sun = solarPosition.at(time);
    this.skyDome.setSun(sun.elevationDegrees, sun.azimuthDegrees);
    if (this.skyDome.isSunUp()) {
      this.lightDirection.copy(this.skyDome.sunDirection);
    } else {
      this.lightDirection.copy(DEFAULT_LIGHT_DIRECTION);
    }
    this.styleForSky();
    this.refreshSkyEnvironment();
    this.placeKeyLight();
    if (this.skyListener !== null) {
      this.skyListener(time, sun);
    }
  }

  /** Rebuilds the reflections from the sky, without its sun disc, when the sun has moved more than a couple of degrees. */
  private refreshSkyEnvironment(): void {
    if (this.skyDome === null) {
      return;
    }
    const direction = this.skyDome.sunDirection;
    if (this.lastEnvironmentDirection !== null && this.lastEnvironmentDirection.angleTo(direction) < THREE.MathUtils.degToRad(ENVIRONMENT_REFRESH_DEGREES)) {
      return;
    }
    if (this.environmentSky === null) {
      this.environmentSky = new SkyDome();
      this.environmentSky.sky.scale.setScalar(50);
      this.environmentSky.sky.material.uniforms.showSunDisc.value = 0;
      this.environmentScene.add(this.environmentSky.sky);
    }
    this.environmentSky.sky.material.uniforms.sunPosition.value.copy(direction);
    const texture = this.environmentGenerator.fromScene(this.environmentScene).texture;
    this.useEnvironment(texture);
    this.lastEnvironmentDirection = direction.clone();
  }

  /**
   * Swaps the texture the scene reflects, freeing the previous one unless it is the studio room.
   * @param texture The new environment.
   */
  private useEnvironment(texture: THREE.Texture): void {
    if (this.environment !== this.roomEnvironment && this.environment !== texture) {
      this.environment.dispose();
    }
    this.environment = texture;
    this.scene.environment = texture;
  }

  /** Points the shadow-casting light from the current light direction at the area last given to fitShadows. */
  private placeKeyLight(): void {
    if (this.lastShadowBounds === null) {
      return;
    }
    const sphere = this.lastShadowBounds.getBoundingSphere(new THREE.Sphere());
    this.keyLight.target.position.copy(sphere.center);
    this.keyLight.position.copy(sphere.center).addScaledVector(this.lightDirection, sphere.radius * 2);
  }

  /**
   * Matches the drawing size and camera to the canvas's size on the page.
   * @param width The width in CSS pixels.
   * @param height The height in CSS pixels.
   */
  resize(width: number, height: number): void {
    if (width === 0 || height === 0) {
      return;
    }
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.bloom.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.composer.render();
  }

  /** Stops the loop and frees every GPU resource the scene holds. */
  dispose(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.controls.removeEventListener('start', this.cancelFlight);
    this.canvasElement.removeEventListener('dblclick', this.handleDoubleClick);
    this.disposeResources();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          material.dispose();
        }
      }
    });
    this.controls.dispose();
    if (this.skyDome !== null) {
      this.skyDome.dispose();
    }
    this.landscape?.dispose();
    if (this.environmentSky !== null) {
      this.environmentSky.dispose();
    }
    if (this.environment !== this.roomEnvironment) {
      this.environment.dispose();
    }
    this.roomEnvironment.dispose();
    this.environmentGenerator.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }

  /**
   * Glides the camera to a new position and point of interest.
   * @param position Where the camera ends up.
   * @param target What it ends up looking at.
   * @param seconds How long the glide takes; 0 jumps at once.
   */
  protected flyTo(position: THREE.Vector3, target: THREE.Vector3, seconds: number): void {
    if (seconds <= 0) {
      this.flight = null;
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }
    this.flight = {
      fromPosition: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPosition: position.clone(),
      toTarget: target.clone(),
      startedAt: this.elapsedSeconds,
      seconds,
    };
  }

  /**
   * Remembers the whole-scene view that the Fit button returns to.
   * @param position The camera position.
   * @param target The point it looks at.
   */
  protected setHome(position: THREE.Vector3, target: THREE.Vector3): void {
    this.home = {
      position: position.clone(),
      target: target.clone(),
    };
  }

  /**
   * The objects a double-click can land on. Subclasses list their drawn content, so handles and helpers are ignored.
   * @returns The objects to test, searched with their children.
   */
  protected focusRoots(): THREE.Object3D[] {
    return [];
  }

  /**
   * Works out where the camera should stand to see a box from a direction, filling the view without empty bands.
   * The box's eight corners are projected onto the screen, and the camera is moved in or out and its point of interest shifted until the corners span about 90% of the view's width or height, centred. A few rounds settle the perspective.
   * @param bounds The box to fit.
   * @param direction The direction from the box's centre to the camera.
   * @param tightness 1 fills about 90% of the view; below 1 moves closer, above 1 leaves more margin.
   * @returns The camera position and the point it looks at.
   */
  protected framing(bounds: THREE.Box3, direction: THREE.Vector3, tightness: number): {
    position: THREE.Vector3;
    target: THREE.Vector3;
  } {
    const unit = direction.clone().normalize();
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const halfFieldOfView = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const target = sphere.center.clone();
    let distance = sphere.radius / Math.sin(halfFieldOfView);
    const probe = new THREE.PerspectiveCamera(this.camera.fov, this.camera.aspect, this.camera.near, this.camera.far);
    const corners: THREE.Vector3[] = [];
    for (const x of [
      bounds.min.x,
      bounds.max.x,
    ]) {
      for (const y of [
        bounds.min.y,
        bounds.max.y,
      ]) {
        for (const z of [
          bounds.min.z,
          bounds.max.z,
        ]) {
          corners.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    for (let round = 0; round < 5; round += 1) {
      probe.position.copy(target).addScaledVector(unit, distance);
      probe.lookAt(target);
      probe.updateMatrixWorld(true);
      let left = Infinity;
      let right = -Infinity;
      let bottom = Infinity;
      let top = -Infinity;
      for (const corner of corners) {
        const projected = corner.clone().project(probe);
        left = Math.min(left, projected.x);
        right = Math.max(right, projected.x);
        bottom = Math.min(bottom, projected.y);
        top = Math.max(top, projected.y);
      }
      const halfHeight = distance * Math.tan(halfFieldOfView);
      const halfWidth = halfHeight * probe.aspect;
      const cameraRight = new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 0);
      const cameraUp = new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 1);
      target.addScaledVector(cameraRight, ((left + right) / 2) * halfWidth);
      target.addScaledVector(cameraUp, ((bottom + top) / 2) * halfHeight);
      const spread = Math.max((right - left) / 2, (top - bottom) / 2);
      distance *= Math.max(spread / 0.9, 0.05);
    }
    distance *= tightness;
    const position = target.clone().addScaledVector(unit, distance);
    const fogStart = this.theme.isLight || this.skyDome !== null ? 2.2 : 1.5;
    this.scene.fog = new THREE.Fog(this.fogColour.clone(), distance * fogStart, distance * (fogStart + 2.5));
    return {
      position,
      target,
    };
  }

  /**
   * Points the shadow-casting light at a box and sizes its shadow to cover it.
   * @param bounds The area whose objects cast shadows.
   */
  protected fitShadows(bounds: THREE.Box3): void {
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const shadowCamera = this.keyLight.shadow.camera;
    shadowCamera.left = -sphere.radius;
    shadowCamera.right = sphere.radius;
    shadowCamera.top = sphere.radius;
    shadowCamera.bottom = -sphere.radius;
    shadowCamera.near = 1;
    shadowCamera.far = sphere.radius * 4;
    shadowCamera.updateProjectionMatrix();
    this.lastShadowBounds = bounds.clone();
    this.placeKeyLight();
    this.buildLandscape();
  }

  /**
   * Moves the scene forward by one frame.
   * @param elapsedSeconds Seconds since the scene started, not counting paused time.
   * @param deltaSeconds Seconds since the previous frame.
   */
  protected abstract update(elapsedSeconds: number, deltaSeconds: number): void;

  /** Frees resources that are not part of the scene graph, such as textures and event listeners. */
  protected disposeResources(): void {
    return;
  }

  /** Advances a camera glide, easing in and out. */
  private advanceFlight(): void {
    if (this.flight === null) {
      return;
    }
    const progress = Math.min((this.elapsedSeconds - this.flight.startedAt) / this.flight.seconds, 1);
    const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    this.camera.position.lerpVectors(this.flight.fromPosition, this.flight.toPosition, eased);
    this.controls.target.lerpVectors(this.flight.fromTarget, this.flight.toTarget, eased);
    if (progress >= 1) {
      this.flight = null;
    }
  }

  /** Asks the browser for the next frame, restarting the frame clock. */
  private requestFrame(): void {
    this.previousTime = performance.now();
    this.frameRequest = requestAnimationFrame(this.frame);
  }

  /**
   * Draws one frame and asks for the next.
   * @param time The browser's frame timestamp, in milliseconds.
   */
  private readonly frame = (time: number): void => {
    if (!this.running) {
      return;
    }
    const deltaSeconds = Math.min((time - this.previousTime) / 1000, 0.1);
    this.previousTime = time;
    this.elapsedSeconds += deltaSeconds;
    this.advanceFlight();
    this.controls.update();
    this.update(this.elapsedSeconds, deltaSeconds);
    if (this.skyDome !== null) {
      this.secondsSinceSkyCheck += deltaSeconds;
      if (this.secondsSinceSkyCheck >= SKY_REFRESH_SECONDS) {
        this.secondsSinceSkyCheck = 0;
        this.followFocusTime();
      }
      this.skyDome.update(this.elapsedSeconds, this.camera);
      this.landscape?.update(deltaSeconds);
    }
    this.composer.render();
    this.frameRequest = requestAnimationFrame(this.frame);
  };

  /**
   * Glides the camera in on the spot under a double-click, keeping the current viewing angle.
   * @param event The double-click.
   */
  private readonly handleDoubleClick = (event: MouseEvent): void => {
    const box = this.canvasElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    for (const root of this.focusRoots()) {
      root.updateMatrixWorld(true);
    }
    this.doubleClickRaycaster.setFromCamera(pointer, this.camera);
    const hits = this.doubleClickRaycaster.intersectObjects(this.focusRoots(), true);
    let point: THREE.Vector3 | null = null;
    for (const hit of hits) {
      if (hit.object.visible && !(hit.object instanceof THREE.Sprite)) {
        point = hit.point.clone();
        break;
      }
    }
    if (point === null) {
      return;
    }
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(Math.max(offset.length() * DOUBLE_CLICK_ZOOM, NEAREST_DISTANCE * 2));
    this.flyTo(point.clone().add(offset), point, 0.7);
  };

  /** Stops a camera glide when the user grabs the camera. */
  private readonly cancelFlight = (): void => {
    this.flight = null;
  };

  /** Pauses drawing while the tab is hidden and resumes when it is shown again. */
  private readonly handleVisibilityChange = (): void => {
    if (!this.running) {
      return;
    }
    cancelAnimationFrame(this.frameRequest);
    if (document.visibilityState === 'visible') {
      this.requestFrame();
    }
  };
}
