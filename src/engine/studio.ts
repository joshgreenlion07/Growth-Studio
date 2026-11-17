import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SitePlan } from '../siteplan/types';
import { bounds, distToEdge, pointInPolygon } from '../siteplan/geometry';
import { buildScene, hardscapeOnlyChange, type SceneBuild } from '../builder/build';
import { ModelAssets, type AssetKind } from '../builder/models';
import { WATER_LEVEL } from '../builder/ground';
import { setFlames } from '../builder/features';
import { disposeMaterialCache } from '../builder/materials';
import { GLOBAL } from './foliage';
import { PostPipeline, type LensSettings, type Quality } from './post';
import { SkyDome, dayOfYear, moodHour, skyState, type Mood, type SkyState } from './sky';
import { setMaxAnisotropy } from './textures';
import { MEASURE_MODES, Measurements, type MeasureMode } from './measure';
import { StageLabels } from './stagelabels';
import type { BuildStage, StageLabel } from '../builder/construction';
import { EYE_HEIGHT, Navigation, type NavMode } from './navigation';
import { materialById } from '../siteplan/catalog';

/** What the material pointer is on: the plan item, which part of it, and that part's catalog material. */
export interface PointHit {
  id: string;
  part: string;
  catalogId: string;
}
import { generateViews, type CameraView } from './views';
import { PlanarMirror, SHADOW_PASS_LAYER, WATER_LAYER_SKIP } from './water';

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

/** While leaves move in the wind, their shadows are redrawn this often (seconds of animation time). */
const SHADOW_STEP = 1 / 20;

/**
 * The quality a session starts at. Phones and tablets (a touch screen as the main pointer, or a
 * small screen) start at Light; anyone can pick a higher one.
 */
export function defaultQuality(): Quality {
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const small = Math.min(window.screen?.width ?? 1024, window.screen?.height ?? 1024) < 600;
    return coarse || small ? 'light' : 'balanced';
  } catch {
    return 'balanced';
  }
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
  /**
   * A copy of the plan as the yard was last built from it. Callers may edit their plan object in
   * place before handing it over again, so what a new plan changes is judged against this copy.
   */
  private builtPlan: SitePlan | null = null;
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
  /** Controller, keyboard and first-person movement; see navigation.ts for the controls. */
  readonly nav: Navigation;
  /** Lengths, areas and sizes drawn over the scene. */
  readonly measure: Measurements;
  private viewIndex = 0;
  private navMode: NavMode = 'orbit';
  onNavModeChanged: (mode: NavMode) => void = () => {};
  onMeasureChanged: (mode: MeasureMode) => void = () => {};
  state: StudioState = { years: 3, mood: 'afternoon', hour: 15.5, date: new Date(new Date().getFullYear(), 5, 21), quality: defaultQuality(), wind: 0.55, motion: true };
  onViewsChanged: (views: CameraView[]) => void = () => {};
  onFrameStats: (fps: number) => void = () => {};
  /** A click (not a drag) on the scene: the id of the plan item under it, or null for bare ground. */
  onPick: (id: string | null) => void = () => {};
  /** The material pointer was turned on or off (controller Y, the P key, or setPointer). */
  onPointer: (on: boolean) => void = () => {};
  /** The pointer moved onto another material, or onto nothing (null). */
  onPoint: (hit: PointHit | null) => void = () => {};
  private pointerOn = false;
  private pointLocked = false;
  /** The pointer's material was locked or let go (right stick click, L, or setPointLock). */
  onPointLock: (locked: boolean) => void = () => {};
  private pointKey = '';
  private pointT = 0;
  private reticle: HTMLDivElement | null = null;
  /** Uploaded-model files that have been handed over (see builder/models.ts). */
  private assets = new ModelAssets();
  /** The plan names an uploaded file that has not been handed over yet. */
  onNeedAsset: (id: string) => void = () => {};
  private fpsAcc = 0;
  private fpsN = 0;
  /** The build stage shown (see builder/construction.ts); 'finished' is the finished yard. */
  private stage: BuildStage = 'finished';
  private stageLabels!: StageLabels;
  /** Cut away: a vertical plane that clips the near side of the yard, and the slice face drawn on it. */
  private cutaway: { plane: THREE.Plane; face: THREE.Group | null } | null = null;
  private clipped = new Set<THREE.Material>();
  onCutawayChanged: (on: boolean) => void = () => {};
  /** The shadow map is redrawn only when something that casts or lights it changed. */
  private shadowDirty = true;
  private shadowTime = -Infinity;
  /** Sees only the shadow-pass layer and points away from the yard, so its own pass draws nothing. */
  private shadowPassCam = new THREE.PerspectiveCamera(10, 1, 1, 2);
  private shadowPassTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  /** While an exported still is drawn: how much larger than the view it is, so its plants get the detail its size needs. */
  private stillScale: number | null = null;

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
    this.shadowPassCam.layers.set(SHADOW_PASS_LAYER);
    // The shadow pass collects only the lights its camera sees.
    this.keyLight.layers.enable(SHADOW_PASS_LAYER);
    this.shadowPassCam.position.set(0, -1e6, 0);
    this.shadowPassCam.lookAt(0, -2e6, 0);
    this.shadowPassCam.updateMatrixWorld();
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

    this.nav = new Navigation({
      camera: this.camera,
      target: this.controls.target,
      canvas: this.renderer.domElement,
      mode: () => this.navMode,
      groundAt: (x, z) => this.groundAt(x, z),
      onTakeOver: () => {
        this.tween = null;
        this.manualFocus = null;
      },
      stepView: (d) => {
        if (!this.views.length) return;
        this.viewIndex = (this.viewIndex + d + this.views.length) % this.views.length;
        this.goTo(this.views[this.viewIndex].id);
        this.nav.pulse();
      },
      home: () => {
        if (this.navMode === 'orbit') {
          if (!this.views.length) return;
          this.viewIndex = 0;
          this.goTo(this.views[0].id);
        } else {
          this.placeWalker();
          this.setNavMode('walk');
        }
        this.nav.pulse();
      },
      toggleFly: () => {
        if (this.navMode === 'orbit') return;
        this.setNavMode(this.navMode === 'walk' ? 'fly' : 'walk');
        this.nav.pulse(80, 0.45);
      },
      // M or controller X steps through Off, Totals, Every edge.
      toggleMeasure: () => this.setMeasureMode(MEASURE_MODES[(MEASURE_MODES.indexOf(this.measure.mode) + 1) % MEASURE_MODES.length]),
      // P or controller Y: the material pointer.
      togglePointer: () => this.setPointer(!this.pointerOn),
      // Right stick click or L: hold the pointed material.
      togglePointLock: () => this.setPointLock(!this.pointLocked),
    });
    this.measure = new Measurements(container);
    this.stageLabels = new StageLabels(container);
    this.scene.add(this.measure.group);

    // Tap to focus.
    let down: { x: number; y: number } | null = null;
    this.renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) {
        this.focusAt(e.clientX, e.clientY);
        this.onPick(this.pickAt(e.clientX, e.clientY));
      }
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
    this.applyPlan(plan, keepCamera, true);
  }

  /** `restyle` false always rebuilds the whole yard (a new quality or uploaded file). */
  private applyPlan(plan: SitePlan, keepCamera: boolean, restyle: boolean) {
    const copy = JSON.parse(JSON.stringify(plan)) as SitePlan;
    // A new paving or wall material (the 3D material picker) rebuilds only the paving and lines.
    if (restyle && this.build && this.builtPlan && hardscapeOnlyChange(this.builtPlan, copy)) {
      this.plan = plan;
      this.build.restyleHardscape(plan);
      this.builtPlan = copy;
      this.build.root.getObjectByName('hardscape')?.traverse((o) => {
        if (o.castShadow) o.layers.enable(SHADOW_PASS_LAYER);
      });
      this.shadowDirty = true;
      this.refreshCutaway();
      if (this.measure.visible) this.measure.rebuild(plan, this.build, this.state.years);
      this.updateSky(false);
      if (!keepCamera && this.views.length) this.jumpTo(this.views[0]);
      return;
    }
    this.plan = plan;
    // Until the new yard is built, nothing may be restyled.
    this.builtPlan = null;
    if (this.build) {
      this.dropCutawayFace();
      this.scene.remove(this.build.root);
      this.build.dispose();
    }
    this.assets.prune(new Set((plan.models ?? []).map((m) => m.asset)));
    this.build = buildScene(plan, this.state.quality, this.mirror, this.sky.uniforms, this.assets);
    this.builtPlan = copy;
    // Every shadow caster joins the shadow pass (plants bring their own lower-detail casters).
    this.build.root.traverse((o) => {
      if (o.castShadow) o.layers.enable(SHADOW_PASS_LAYER);
    });
    this.shadowDirty = true;
    this.build.setStage(this.stage);
    this.scene.add(this.build.root);
    this.build.setYears(this.state.years);
    this.stageLabels.set(this.build.construction.labels, this.stage);
    this.refreshCutaway();
    this.views = generateViews(plan, this.build.gm.height);
    this.onViewsChanged(this.views);
    if (this.measure.visible) this.measure.rebuild(plan, this.build, this.state.years);
    this.updateSky(true);
    this.assignNightLights();
    if (!keepCamera && this.views.length) this.jumpTo(this.views[0]);
    for (const id of this.build.missingAssets) this.onNeedAsset(id);
  }

  /**
   * Hand over an uploaded file the plan names. The scene is rebuilt in place
   * (camera kept) when the current plan uses it. Rejects with a plain reason
   * when the file cannot be read.
   */
  async addAsset(id: string, kind: AssetKind, data: Blob): Promise<void> {
    await this.assets.add(id, kind, data);
    if (!this.disposed && this.plan?.models?.some((m) => m.asset === id)) this.applyPlan(this.plan, true, false);
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
    this.shadowDirty = true;
    if (this.plan && this.build && this.measure.visible) this.measure.rebuild(this.plan, this.build, y);
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
    this.shadowDirty = true;
  }

  setMotion(on: boolean) {
    this.state.motion = on;
    this.shadowDirty = true;
  }

  setLens(l: Partial<LensSettings>) {
    Object.assign(this.post.lens, l);
  }

  setQuality(q: Quality) {
    if (q === this.state.quality) return;
    this.state.quality = q;
    this.applyQuality();
    if (this.plan) this.applyPlan(this.plan, true, false);
  }

  currentHour(): number {
    if (!this.plan) return this.state.hour;
    if (this.state.mood === 'custom') return this.state.hour;
    return moodHour(this.state.mood, this.plan.site.latitude, dayOfYear(this.state.date));
  }

  private applyQuality() {
    const q = this.state.quality;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'draft' || q === 'light' ? Math.min(dpr, 1) : q === 'balanced' ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
    const size = q === 'draft' || q === 'light' ? 1024 : q === 'balanced' ? 2048 : 4096;
    this.keyLight.shadow.mapSize.set(size, size);
    this.keyLight.shadow.map?.dispose();
    this.keyLight.shadow.map = null;
    this.shadowDirty = true;
    this.mirror.enabled = q !== 'draft';
    this.mirror.scale = q === 'max' ? 1 : q === 'light' ? 0.25 : 0.5;
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
    this.shadowDirty = true;
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

  /* First person ------------------------------------------------- */

  get mode(): NavMode {
    return this.navMode;
  }

  /** orbit: the mouse orbit view. walk: first person at eye height. fly: first person, free height. */
  setNavMode(m: NavMode) {
    if (m === this.navMode) return;
    const from = this.navMode;
    this.navMode = m;
    this.tween = null;
    this.controls.enabled = m === 'orbit';
    if (from === 'orbit' && m !== 'orbit') {
      this.placeWalker();
    } else if (m === 'orbit') {
      // Give the orbit a sensible pivot a few meters ahead on the ground.
      const dir = this.controls.target.clone().sub(this.camera.position).normalize();
      const t = this.camera.position.clone().addScaledVector(dir, 8);
      t.y = Math.max(t.y, this.groundAt(t.x, t.z));
      this.controls.target.copy(t);
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
    }
    this.onNavModeChanged(m);
  }

  /** Stand at ground level at the edge of the yard, looking across it. */
  private placeWalker() {
    const low = this.views.find((v) => v.id === 'low') ?? this.views[0];
    const eye = low ? low.eye.clone() : this.camera.position.clone();
    const look = low ? low.target.clone().sub(low.eye) : this.controls.target.clone().sub(this.camera.position);
    look.y = 0;
    if (look.lengthSq() < 1e-6) look.set(0, 0, -1);
    look.normalize();
    // Never start inside a house or shed: step forward until clear of every structure.
    const blocked = (x: number, z: number) => (this.plan?.structures ?? []).some((st) => st.kind !== 'cover' && st.polygon.length > 2 && (pointInPolygon([x, z], st.polygon) || distToEdge([x, z], st.polygon) < 0.8));
    for (let i = 0; i < 200 && blocked(eye.x, eye.z); i++) eye.addScaledVector(look, 0.25);
    eye.y = this.groundAt(eye.x, eye.z) + EYE_HEIGHT;
    this.camera.position.copy(eye);
    this.controls.target.copy(eye).addScaledVector(look, 3);
    this.controls.target.y -= 0.35; // a slight downward glance
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.controls.target);
  }

  setMeasureMode(mode: MeasureMode) {
    if (mode === this.measure.mode) return;
    this.measure.setMode(mode);
    if (mode !== 'off' && this.plan && this.build) this.measure.rebuild(this.plan, this.build, this.state.years);
    this.onMeasureChanged(mode);
  }

  /** On shows the totals view. */
  /** Show a build stage: demo, excavation, open trenches with the pipes, backfill, base rock, bedding, or the finished yard. */
  setStage(stage: BuildStage) {
    if (stage === this.stage) return;
    this.stage = stage;
    if (!this.build) return;
    this.build.setStage(stage);
    // Plants built for the stage views join the shadow pass like everything else.
    this.build.root.traverse((o) => {
      if (o.castShadow) o.layers.enable(SHADOW_PASS_LAYER);
    });
    this.shadowDirty = true;
    this.stageLabels.set(this.build.construction.labels, stage);
    this.refreshCutaway();
  }

  get cutawayOn(): boolean {
    return !!this.cutaway;
  }

  /**
   * Cut away the near side of the yard: a vertical plane through the point the camera looks at, square to the view,
   * hides everything between it and the camera, and the slice face shows the ground there at the current stage
   * (trenches, pipes, backfill, base, bedding, surface). The plane stays put while the camera moves; turning it on
   * again aims it at the new view.
   */
  setCutaway(on: boolean) {
    if (!on) {
      if (!this.cutaway) return;
      this.dropCutawayFace();
      for (const m of this.clipped) {
        m.clippingPlanes = null;
        m.needsUpdate = true;
      }
      this.clipped.clear();
      this.cutaway = null;
      this.stageLabels.clip = null;
      if (this.build) this.stageLabels.set(this.build.construction.labels, this.stage);
      this.shadowDirty = true;
      this.onCutawayChanged(false);
      return;
    }
    const dir = new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
    dir.y = 0;
    // Looking straight down: cut along the bottom of the screen instead.
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0).applyQuaternion(this.camera.quaternion).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const plane = new THREE.Plane(dir, -dir.dot(this.controls.target));
    this.renderer.localClippingEnabled = true;
    this.dropCutawayFace();
    this.cutaway = { plane, face: null };
    this.stageLabels.clip = plane;
    this.refreshCutaway();
    this.onCutawayChanged(true);
  }

  private dropCutawayFace() {
    const face = this.cutaway?.face;
    if (!face) return;
    face.parent?.remove(face);
    (face.userData.dispose as (() => void) | undefined)?.();
    this.cutaway!.face = null;
  }

  /** Redraw the slice face for the current stage and clip every other material in the yard with the plane. */
  private refreshCutaway() {
    if (!this.cutaway || !this.build) return;
    this.dropCutawayFace();
    const planes = [this.cutaway.plane];
    this.build.root.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m || o.userData.noClip) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        if (mat.clippingPlanes?.[0] === planes[0]) continue;
        mat.clippingPlanes = planes;
        mat.needsUpdate = true;
        this.clipped.add(mat);
      }
    });
    const face = this.build.construction.section(this.stage, this.cutaway.plane);
    if (face) this.build.root.add(face);
    this.cutaway.face = face;
    this.stageLabels.set([...this.build.construction.labels, ...((face?.userData.labels as StageLabel[] | undefined) ?? [])], this.stage);
    this.shadowDirty = true;
  }

  get buildStage(): BuildStage {
    return this.stage;
  }

  /** What a stage shows in this plan, in a sentence or two. */
  stageNote(stage: BuildStage): string {
    return this.build?.construction.notes[stage] ?? '';
  }

  setMeasurements(on: boolean) {
    this.setMeasureMode(on ? 'totals' : 'off');
  }

  /** The current camera, to put it back later. */
  savePose() {
    return { eye: this.camera.position.clone(), target: this.controls.target.clone(), fov: this.camera.fov };
  }

  restorePose(p: { eye: THREE.Vector3; target: THREE.Vector3; fov: number }) {
    this.jumpTo({ id: 'saved', label: 'Saved', eye: p.eye, target: p.target, fov: p.fov });
  }

  private groundAt(x: number, z: number) {
    return this.build ? Math.max(0, this.build.gm.height([x, z])) : 0;
  }

  goTo(id: string) {
    if (this.navMode !== 'orbit') this.setNavMode('orbit');
    const v = this.views.find((x) => x.id === id);
    if (!v) return;
    this.viewIndex = this.views.indexOf(v);
    this.manualFocus = null;
    this.tween = { from: { e: this.camera.position.clone(), t: this.controls.target.clone(), f: this.camera.fov }, to: v, t0: performance.now(), dur: 1400 };
  }

  get pointer() {
    return this.pointerOn;
  }

  /** Show or hide the material pointer, a mark at the center of the view that reports what it is on. */
  setPointer(on: boolean) {
    if (on === this.pointerOn) return;
    this.pointerOn = on;
    if (!this.reticle) {
      const r = document.createElement('div');
      r.className = 'point-reticle';
      r.setAttribute('aria-hidden', 'true');
      r.append(document.createElement('i'), document.createElement('span'));
      this.container.appendChild(r);
      this.reticle = r;
    }
    this.reticle.hidden = !on;
    if (!on && this.pointLocked) this.setPointLock(false);
    this.pointKey = '';
    this.pointT = 0;
    this.onPointer(on);
    if (!on) this.onPoint(null);
    else this.nav.pulse(60, 0.3);
  }

  get pointLock() {
    return this.pointLocked;
  }

  /**
   * Hold the material the pointer is on: while locked nothing new is reported, so the panel keeps it as the view
   * moves; letting go reports what the pointer is on right away. Only while the pointer is shown.
   */
  setPointLock(locked: boolean) {
    if (locked && !this.pointerOn) return;
    if (locked === this.pointLocked) return;
    this.pointLocked = locked;
    this.reticle?.classList.toggle('locked', locked);
    const label = this.reticle?.querySelector('span');
    if (label) label.dataset.lock = locked ? 'Locked' : '';
    this.onPointLock(locked);
    this.nav.pulse(locked ? 90 : 50, locked ? 0.5 : 0.25);
    if (!locked) {
      this.pointKey = '';
      this.pointT = 0;
      this.updatePointer();
    }
  }

  /** The surface at the center of the view, at most about eight times a second; reports it when it changes. */
  private updatePointer() {
    if (this.pointLocked) return;
    const now = performance.now();
    if (now - this.pointT < 120) return;
    this.pointT = now;
    const hit = this.pointAtCenter();
    const key = hit ? `${hit.id}|${hit.part}|${hit.catalogId}` : '';
    if (key === this.pointKey) return;
    this.pointKey = key;
    const label = this.reticle?.querySelector('span');
    if (label) {
      const m = hit ? materialById.get(hit.catalogId) : undefined;
      label.textContent = m ? m.name : '';
    }
    this.reticle?.classList.toggle('on', !!hit);
    this.onPoint(hit);
  }

  private pointAtCenter(): PointHit | null {
    if (!this.build) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hard = this.build.root.getObjectByName('hardscape');
    const hit = this.raycaster.intersectObjects(hard ? [...this.build.surfaces, hard] : this.build.surfaces, true)[0];
    let part = '', catalogId = '';
    for (let o: THREE.Object3D | null = hit ? hit.object : null; o; o = o.parent) {
      if (!part && typeof o.userData?.part === 'string') { part = o.userData.part; catalogId = String(o.userData.catalogId ?? ''); }
      const id = o.userData?.itemId;
      if (typeof id === 'string') return part && catalogId ? { id, part, catalogId } : null;
    }
    return null;
  }

  private pickAt(cx: number, cy: number): string | null {
    if (!this.build) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // Walls and curbs are not focus surfaces, so the hardscape group is tested as well. Only the
    // nearest thing under the pointer counts: a click on the lawn must not pick a wall behind it.
    const hard = this.build.root.getObjectByName('hardscape');
    const hit = this.raycaster.intersectObjects(hard ? [...this.build.surfaces, hard] : this.build.surfaces, true)[0];
    for (let o: THREE.Object3D | null = hit ? hit.object : null; o; o = o.parent) {
      const id = o.userData?.itemId;
      if (typeof id === 'string') return id;
    }
    return null;
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

  /** Camera height above the ground right under it, in meters. */
  heightAboveGround(): number {
    const p = this.camera.position;
    const g = this.build ? Math.max(0, this.build.gm.height([p.x, p.z])) : 0;
    return Math.max(0, p.y - g);
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
    this.nav.update(dt);
    if (this.navMode === 'orbit') this.controls.update();
    else this.camera.lookAt(this.controls.target);
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

    // At the lighter settings plants switch to fewer leaves sooner (as if the view were smaller);
    // an exported still always gets the detail its own size needs.
    const lodScale = this.stillScale ?? (this.state.quality === 'light' || this.state.quality === 'draft' ? 0.6 : 1);
    // Plants are culled against this frame's view: the camera has just moved (controls, tween,
    // first person), and its world matrix is otherwise brought up to date only when it is drawn.
    this.camera.updateMatrixWorld();
    this.build?.plants.update?.(this.camera, this.container.clientHeight * lodScale);
    // Shadows are redrawn when the yard, the sun or the plants changed, and while the wind
    // moves the leaves at a steady rate rather than every frame.
    const swaying = this.state.motion && this.state.wind > 0.001;
    if (this.shadowDirty || (swaying && Math.abs(t - this.shadowTime) >= SHADOW_STEP)) this.renderShadows(t);
    if (this.build && this.build.water.surfaces.length && this.mirror.enabled) {
      this.camera.updateMatrixWorld();
      this.mirror.render(this.renderer, this.scene, this.camera, this.build.water.surfaces);
    }
    this.measure.update(this.camera, this.container.clientWidth, this.container.clientHeight);
    this.stageLabels.update(this.camera, this.container.clientWidth, this.container.clientHeight);
    if (this.pointerOn) this.updatePointer();
    this.post.render(this.scene, this.camera, t);

    const fps = dt > 0 ? 1 / dt : 60;
    this.fpsAcc += fps;
    if (++this.fpsN >= 30) {
      this.onFrameStats(this.fpsAcc / this.fpsN);
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
  }

  /**
   * Redraw the sun's shadow map. It is drawn in a pass of its own whose camera sees only the
   * shadow layer and looks away from the yard, so nothing else is drawn; that lets plants cast
   * shadows from lower-detail stand-ins the main view never draws.
   */
  private renderShadows(t: number) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(this.shadowPassTarget);
    r.render(this.scene, this.shadowPassCam);
    r.setRenderTarget(prev);
    r.shadowMap.needsUpdate = false;
    this.shadowDirty = false;
    this.shadowTime = t;
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
  async exportStill(width: number, type = 'image/png', quality?: number): Promise<Blob> {
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
    this.shadowDirty = true;
    this.stillScale = H / Math.max(1, h0);
    try {
      this.renderFrame(0);
    } finally {
      this.stillScale = null;
    }
    const blob = await new Promise<Blob>((res, rej) => el.toBlob((b) => (b ? res(b) : rej(new Error('The image could not be created.'))), type, quality));
    this.renderer.setPixelRatio(pr0);
    this.post.setQuality(q0);
    this.resize();
    return blob;
  }

  /**
   * A cover picture of the yard from its first generated view (the Overview), for a second screen, as a JPEG. The
   * camera goes straight back where it was, so whoever is looking around does not notice.
   */
  async coverImage(width = 1600): Promise<Blob> {
    const pose = this.savePose();
    if (this.views.length) this.jumpTo(this.views[0]);
    try {
      return await this.exportStill(width, 'image/jpeg', 0.88);
    } finally {
      this.restorePose(pose);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.build?.dispose();
    this.assets.dispose();
    this.post.dispose();
    this.mirror.dispose();
    this.shadowPassTarget.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.controls.dispose();
    this.measure.dispose();
    this.stageLabels.dispose();
    disposeMaterialCache();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
