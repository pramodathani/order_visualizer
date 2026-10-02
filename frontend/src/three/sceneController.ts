import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import type { Theme } from '../utilities/themes';

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
  private readonly environment: THREE.Texture;
  private flight: CameraFlight | null = null;
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
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(fieldOfView, 1, 0.1, 6000);

    const environmentGenerator = new THREE.PMREMGenerator(this.renderer);
    this.environment = environmentGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    environmentGenerator.dispose();
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
    this.controls.addEventListener('start', this.cancelFlight);

    this.styleForTheme(theme);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
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
    this.bloom.strength = 0.65;
    this.bloom.threshold = 0.78;
    this.renderer.toneMapping = theme.isLight ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
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
    this.environment.dispose();
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
    const fogStart = this.theme.isLight ? 2.2 : 1.5;
    this.scene.fog = new THREE.Fog(new THREE.Color(this.theme.colours.background), distance * fogStart, distance * (fogStart + 2.5));
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
    this.keyLight.target.position.copy(sphere.center);
    this.keyLight.position.copy(sphere.center).add(new THREE.Vector3(0.4, 1, 0.5).normalize().multiplyScalar(sphere.radius * 2));
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
    this.composer.render();
    this.frameRequest = requestAnimationFrame(this.frame);
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
