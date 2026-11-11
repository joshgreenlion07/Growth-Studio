import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SitePlan } from '../siteplan/types';
import { bounds } from '../siteplan/geometry';
import { buildScene, type SceneBuild } from '../builder/build';
import { WATER_LEVEL } from '../builder/ground';
import { setFlames } from '../builder/features';
import { disposeMaterialCache } from '../builder/materials';
import { GLOBAL } from './foliage';
import { PostPipeline, type LensSettings, type Quality } from './post';
import { SkyDome, dayOfYear, moodHour, skyState, type Mood, type SkyState } from './sky';
import { setMaxAnisotropy } from './textures';
import { generateViews, type CameraView } from './views';
import { PlanarMirror, WATER_LAYER_SKIP } from './water';

/**
 * The 3D runtime: renderer, lighting, sky, camera, post-processing, and the
 * yard built from the current SitePlan.
 */

export interface StudioState {
  years: number;
  mood: Mood | 'custom';
  /** Local solar hour when mood is custom. */
  hour: number;
  date: Date;
  quality: Quality;
  wind: number;
  motion: boolean;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Studio {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  readonly controls: OrbitControls;
  readonly post: PostPipeline;
  private sky = new SkyDome();
  private envSky = new SkyDome();
  private envScene = new THREE.Scene();
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private keyLight = new THREE.DirectionalLight(0xffffff, 3);
  private fillLight = new THREE.HemisphereLight(0xbfd4ea, 0x4a4030, 0.15);
  private pointLights: THREE.PointLight[] = [];
  private mirror: PlanarMirror;
  private build: SceneBuild | null = null;
  private plan: SitePlan | null = null;
  private skyNow: SkyState | null = null;
  private clock = new THREE.Clock();
  private raf = 0;
  private frame = 0;
  private focusTarget = 10;
  private manualFocus: THREE.Vector3 | null = null;
  private raycaster = new THREE.Raycaster();
  private tween: { from: { e: THREE.Vector3; t: THREE.Vector3; f: number }; to: CameraView; t0: number; dur: number } | null = null;
  private resizeObs: ResizeObserver;
  private disposed = false;
  views: CameraView[] = [];
  state: StudioState = { years: 3, mood: 'afternoon', hour: 15.5, date: new Date(new Date().getFullYear(), 5, 21), quality: 'balanced', wind: 0.55, motion: true };
  onViewsChanged: (views: CameraView[]) => void = () => {};
  onFrameStats: (fps: number) => void = () => {};
  private fpsAcc = 0;
  private fpsN = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('aria-label', '3D view of the yard');
    container.appendChild(this.renderer.domElement);
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    this.post = new PostPipeline(this.renderer);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envSky.uniforms.uEnvPass.value = 1;
    this.envScene.add(this.envSky.mesh);
    this.envSky.mesh.scale.setScalar(100);

    this.scene.add(this.sky.mesh);
    this.scene.fog = new THREE.FogExp2(0xc9d6e2, 0.004);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.bias = -0.0003;
    this.keyLight.shadow.normalBias = 0.025;
    this.scene.add(this.keyLight, this.keyLight.target, this.fillLight);
    for (let i = 0; i < 8; i++) {
      const p = new THREE.PointLight(0xffc98a, 0, 5, 2);
      p.visible = false;
      this.pointLights.push(p);
      this.scene.add(p);
    }
    this.mirror = new PlanarMirror(WATER_LEVEL, 0.5);

    this.camera.layers.enable(WATER_LAYER_SKIP);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 140;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener('start', () => {
      this.tween = null;
      this.manualFocus = null;
    });

    // Tap to focus.
    let down: { x: number; y: number } | null = null;
    this.renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) this.focusAt(e.clientX, e.clientY);
      down = null;
    });

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.applyQuality();
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  /* -------------------------------------------------------------- */

  setPlan(plan: SitePlan, keepCamera = false) {
    this.plan = plan;
    if (this.build) {
      this.scene.remove(this.build.root);
      this.build.dispose();
    }
    this.build = buildScene(plan, this.state.quality, this.mirror, this.sky.uniforms);
    this.scene.add(this.build.root);
    this.build.setYears(this.state.years);
    this.views = generateViews(plan, this.build.gm.height);
    this.onViewsChanged(this.views);
    this.updateSky(true);
    this.assignNightLights();
    if (!keepCamera && this.views.length) this.jumpTo(this.views[0]);
  }

  get currentPlan() {
    return this.plan;
  }

  get stats() {
    return { plants: this.build?.plantCount ?? 0 };
  }

  setYears(y: number) {
    this.state.years = y;
    this.build?.setYears(y);
  }

  setMood(m: Mood) {
    this.state.mood = m;
    this.updateSky(true);
  }

  setHour(h: number) {
    this.state.mood = 'custom';
    this.state.hour = h;
    this.updateSky(true);
  }

  setDate(d: Date) {
    this.state.date = d;
    this.updateSky(true);
  }

  setWind(w: number) {
    this.state.wind = w;
    GLOBAL.uWind.value = w;
  }

  setMotion(on: boolean) {
    this.state.motion = on;
  }

  setLens(l: Partial<LensSettings>) {
    Object.assign(this.post.lens, l);
  }

  setQuality(q: Quality) {
    if (q === this.state.quality) return;
    this.state.quality = q;
    this.applyQuality();
    if (this.plan) this.setPlan(this.plan, true);
  }

  currentHour(): number {
    if (!this.plan) return this.state.hour;
    if (this.state.mood === 'custom') return this.state.hour;
    return moodHour(this.state.mood, this.plan.site.latitude, dayOfYear(this.state.date));
  }

  private applyQuality() {
    const q = this.state.quality;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'draft' ? Math.min(dpr, 1) : q === 'balanced' ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
    const size = q === 'draft' ? 1024 : q === 'balanced' ? 2048 : 4096;
    this.keyLight.shadow.mapSize.set(size, size);
    this.keyLight.shadow.map?.dispose();
    this.keyLight.shadow.map = null;
    this.mirror.enabled = q !== 'draft';
    this.mirror.scale = q === 'max' ? 1 : 0.5;
    this.post.setQuality(q);
    this.resize();
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    this.post.setSize(Math.round(w * pr), Math.round(h * pr));
    this.mirror.setSize(w * pr, h * pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* -------------------------------------------------------------- */
  /* Sky and light                                                     */

  private updateSky(regenEnv: boolean) {
    if (!this.plan) return;
    const site = this.plan.site;
    const s = skyState(site.latitude, dayOfYear(this.state.date), this.currentHour(), site.northAngleDeg);
    this.skyNow = s;
    this.sky.apply(s);
    this.envSky.apply(s);
    GLOBAL.uSunDir.value.copy(s.keyDir);
    GLOBAL.uSunColor.value.copy(s.keyColor).multiplyScalar(s.keyIntensity / 3);
    this.keyLight.color.copy(s.keyColor);
    this.keyLight.intensity = s.keyIntensity;
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(s.horizon).lerp(s.zenith, 0.15);
    fog.density = s.fogDensity;
    this.fillLight.color.copy(s.zenith);
    this.fillLight.color.lerp(new THREE.Color(0xd8d4cc), 0.5);
    this.fillLight.groundColor.set(0x6a5a44).multiplyScalar(1 - s.night * 0.8);
    this.fillLight.intensity = s.sunElevation > 0 ? 0.55 : 0.12 + s.night * 0.05;
    this.post.exposure = s.exposure;
    this.post.lens.bloom = s.night > 0.3 ? 0.7 : s.sunElevation < 10 ? 0.45 : 0.3;
    this.fitShadow();
    if (regenEnv) this.regenEnv();
    // Night accents.
    if (this.build) {
      const n = s.night > 0 ? Math.min(1, 0.25 + s.night) : s.sunElevation < 2 ? 0.25 : 0;
      for (const m of this.build.glow) m.emissiveIntensity = n * (m.color.r > 0.5 ? 7 : 2.4);
      setFlames(this.build.features, s.sunElevation < 4 ? Math.min(1, 0.4 + s.night) : 0);
      this.pointLights.forEach((p) => (p.intensity = (p.userData.base ?? 0) * n));
    }
  }

  private regenEnv() {
    this.envRT?.dispose();
    this.envSky.mesh.position.set(0, 0, 0);
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 500);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = this.skyNow?.envIntensity ?? 1;
  }

  private fitShadow() {
    if (!this.plan || !this.skyNow) return;
    const b = bounds(this.plan.site.boundary);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minY + b.maxY) / 2;
    const R = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2 + 10;
    const dir = this.skyNow.keyDir.clone();
    if (dir.y < 0.08) dir.y = 0.08;
    dir.normalize();
    this.keyLight.position.set(cx + dir.x * 80, dir.y * 80, cz + dir.z * 80);
    this.keyLight.target.position.set(cx, 0, cz);
    const cam = this.keyLight.shadow.camera;
    cam.left = -R;
    cam.right = R;
    cam.top = R;
    cam.bottom = -R;
    cam.near = 1;
    cam.far = 220;
    cam.updateProjectionMatrix();
  }

  private assignNightLights() {
    const lights = this.build?.nightLights ?? [];
    this.pointLights.forEach((p, i) => {
      const l = lights[i];
      p.visible = !!l;
      if (!l) return;
      p.position.copy(l.position);
      p.color.set(l.color);
      p.distance = l.distance;
      p.userData.base = l.intensity;
      p.userData.flicker = l.flicker;
    });
    this.updateSky(false);
  }

  /* -------------------------------------------------------------- */
  /* Camera                                                            */

  jumpTo(v: CameraView) {
    this.tween = null;
    this.camera.position.copy(v.eye);
    this.controls.target.copy(v.target);
    this.camera.fov = v.fov;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.focusTarget = v.eye.distanceTo(v.target);
    this.post.focus = this.focusTarget;
  }

  goTo(id: string) {
    const v = this.views.find((x) => x.id === id);
    if (!v) return;
    this.manualFocus = null;
    this.tween = { from: { e: this.camera.position.clone(), t: this.controls.target.clone(), f: this.camera.fov }, to: v, t0: performance.now(), dur: 1400 };
  }

  private focusAt(cx: number, cy: number) {
    if (!this.build) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.build.surfaces, true)[0];
    if (hit) this.manualFocus = hit.point.clone();
  }

  private autofocus() {
    if (!this.build) return;
    if (this.manualFocus) {
      this.focusTarget = this.camera.position.distanceTo(this.manualFocus);
      return;
    }
    this.raycaster.setFromCamera(new THREE.Vector2(0, -0.1), this.camera);
    this.raycaster.far = 300;
    const hit = this.raycaster.intersectObjects(this.build.surfaces, true)[0];
    this.focusTarget = hit ? hit.distance : this.camera.position.distanceTo(this.controls.target);
  }

  private keepAboveGround() {
    if (!this.build) return;
    const p = this.camera.position;
    const g = this.build.gm.height([p.x, p.z]);
    const min = Math.max(g, 0) + 0.3;
    if (p.y < min) p.y = min;
    if (this.controls.target.y < -0.5) this.controls.target.y = -0.5;
  }

  /* -------------------------------------------------------------- */
  /* Frame loop                                                        */

  private loop() {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    this.renderFrame();
  }

  private renderFrame(dtOverride?: number) {
    const dt = dtOverride ?? Math.min(0.05, this.clock.getDelta());
    if (this.state.motion) GLOBAL.uTime.value += dt;
    this.sky.uniforms.uTime.value = GLOBAL.uTime.value;

    if (this.tween) {
      const k = Math.min(1, (performance.now() - this.tween.t0) / this.tween.dur);
      const e = ease(k);
      this.camera.position.lerpVectors(this.tween.from.e, this.tween.to.eye, e);
      this.controls.target.lerpVectors(this.tween.from.t, this.tween.to.target, e);
      this.camera.fov = this.tween.from.f + (this.tween.to.fov - this.tween.from.f) * e;
      this.camera.updateProjectionMatrix();
      if (k >= 1) this.tween = null;
    }
    this.controls.update();
    this.keepAboveGround();
    this.sky.mesh.position.copy(this.camera.position);

    if (this.frame++ % 4 === 0) this.autofocus();
    this.post.focus += (this.focusTarget - this.post.focus) * 0.15;

    // Fire flicker.
    const t = GLOBAL.uTime.value;
    for (const p of this.pointLights) {
      if (p.visible && p.userData.flicker && p.intensity > 0) {
        const n = this.skyNow ? Math.min(1, 0.25 + this.skyNow.night) : 1;
        p.intensity = (p.userData.base ?? 0) * n * (0.82 + 0.18 * Math.sin(t * 13.0) * Math.sin(t * 7.3 + 1.2));
      }
    }

    this.renderer.shadowMap.needsUpdate = true;
    if (this.build && this.build.water.surfaces.length && this.mirror.enabled) {
      this.camera.updateMatrixWorld();
      this.mirror.render(this.renderer, this.scene, this.camera, this.build.water.surfaces);
    }
    this.post.render(this.scene, this.camera, t);

    const fps = dt > 0 ? 1 / dt : 60;
    this.fpsAcc += fps;
    if (++this.fpsN >= 30) {
      this.onFrameStats(this.fpsAcc / this.fpsN);
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
  }

  /** Stop the frame loop (tests and background tabs). */
  pause() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  resume() {
    if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(this.loop);
  }

  /** Render one frame now and return it as a PNG data URL. */
  snapshot(dt = 1 / 60): string {
    this.renderFrame(dt);
    return this.renderer.domElement.toDataURL('image/png');
  }

  /** Render one high-resolution still with the full camera look. */
  async exportStill(width: number): Promise<Blob> {
    const el = this.renderer.domElement;
    const w0 = this.container.clientWidth, h0 = this.container.clientHeight;
    const aspect = w0 / h0;
    const W = Math.round(width), H = Math.round(width / aspect);
    const pr0 = this.renderer.getPixelRatio();
    const q0 = this.post.quality;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.post.setQuality('max');
    this.post.setSize(W, H);
    this.mirror.setSize(W, H);
    this.renderFrame(0);
    const blob = await new Promise<Blob>((res, rej) => el.toBlob((b) => (b ? res(b) : rej(new Error('The image could not be created.'))), 'image/png'));
    this.renderer.setPixelRatio(pr0);
    this.post.setQuality(q0);
    this.resize();
    return blob;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.build?.dispose();
    this.post.dispose();
    this.mirror.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.controls.dispose();
    disposeMaterialCache();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
