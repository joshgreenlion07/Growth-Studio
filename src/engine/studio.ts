import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SitePlan } from '../siteplan/types';
import { bounds, distToEdge, pointInPolygon } from '../siteplan/geometry';
import { buildScene, hardscapeOnlyChange, type SceneBuild } from '../builder/build';
import { ModelAssets, type AssetKind } from '../builder/models';
import { WATER_LEVEL, setGroundTextureUnits } from '../builder/ground';
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
import { pointName } from '../siteplan/material-info';

/**
 * What the material pointer is on: the plan item, which part of it, and that part's catalog material. Parts: main,
 * border, edge, wall, cap, curb, fence, steps, stone (catalog materials), turf and bed (a lawn or bed zone on the
 * ground, its material), plant, water, structure, feature and model (catalogId `<kind>:<id>`, see pointKind).
 */
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

/** The longest step any motion takes in one frame (seconds): a hitch is not turned into a jump. */
const MAX_DT = 1 / 20;
/** Resizes closer together than this (ms) are one continuous resize: the canvas is stretched until it ends. */
const RESIZE_SETTLE_MS = 160;
/** Frames still drawn after the view stops changing, before drawing pauses (nothing on screen would differ). */
const SETTLE_FRAMES = 4;

// Soft shadow edges sample the shadow map in a pattern turned per pixel by screen-space noise, which crawls as
// the view moves. A fixed pattern (each tap still filtered by the hardware) is as soft and holds still.
THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace(
  /float phi = interleavedGradientNoise\( gl_FragCoord\.xy \) \* PI2;/g,
  'float phi = 0.0;',
);

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
  /** The yard being warmed up (its shaders compiled) before it replaces the one on screen. */
  private pending: SceneBuild | null = null;
  private buildToken = 0;
  private whenBuilt: (() => void)[] = [];
  /** Replaced yards, released after the next drawn frame (their shader programs are shared by the new one until then). */
  private retired: SceneBuild[] = [];
  /** The sky the lighting environment was last made for; it is remade only when that changes. */
  private envKey = '';
  /** Autofocus targets: solid surfaces only, not the invisible plant spheres. */
  private focusSurfaces: THREE.Object3D[] = [];
  private lastTs = -1;
  /** Height of the tallest thing in the yard (m). */
  private yardTop = 0;
  /** The view moved since the material pointer last reported: keep drawing until it has. */
  private pointDue = false;
  private raf = 0;
  private frame = 0;
  private focusTarget = 10;
  /** Focus eases in diopters (1 / distance), the way a lens racks. */
  private focusInv = 0.1;
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
  /** Something other than the camera changed since the last drawn frame. */
  private dirty = true;
  private stillFrames = 0;
  private lastView = new THREE.Matrix4();
  private lastProj = new THREE.Matrix4();
  private camMoved = true;
  private v2 = new THREE.Vector2();
  /** Size the drawing buffers were last made for (CSS px and pixel ratio). */
  private size = { w: 0, h: 0, pr: 0 };
  private lastResize = 0;
  private resizeTimer = 0;
  private dprQuery: MediaQueryList | null = null;
  private contextLost = false;
  private lossNote: HTMLDivElement | null = null;
  private stillPost: PostPipeline | null = null;
  /** Optional frame-rate readout (?fps=1, or F9). */
  private fpsEl: HTMLDivElement | null = null;
  private fpsWin: number[] = [];
  private fpsShownAt = 0;
  private drawnInWin = 0;
  /**
   * Diagnostics (the readout's longer form): how often each thing that can make the picture jump happened in the last
   * second, and the latest of them with times, to line up with a flicker on screen. Two switches hold one suspect still.
   */
  private diag = { counts: new Map<string, number>(), log: [] as string[], el: null as HTMLDivElement | null };
  /** Diagnostics switch: keep the near and far planes where they are instead of following the camera. */
  holdClip = false;
  /** Diagnostics switch: draw every frame instead of pausing while nothing on screen changes. */
  alwaysDraw = false;

  /** Count one event for the diagnostics readout (and log it with its time). Cheap when the readout is off. */
  noteEvent(name: string, detail = '') {
    if (!this.diag.el) return;
    this.diag.counts.set(name, (this.diag.counts.get(name) ?? 0) + 1);
    const d = new Date();
    const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0').slice(0, 1)}`;
    const line = `${t}  ${name}${detail ? ` ${detail}` : ''}`;
    // Repeats of the same event collapse into one line with a count.
    const last = this.diag.log[0];
    if (last && last.slice(12).replace(/ ×\d+$/, '') === line.slice(12)) {
      const n = /×(\d+)$/.exec(last);
      this.diag.log[0] = `${line} ×${n ? +n[1] + 1 : 2}`;
    } else this.diag.log.unshift(line);
    this.diag.log.length = Math.min(this.diag.log.length, 10);
  }
  /** The build stage shown (see builder/construction.ts); 'finished' is the finished yard. */
  private stage: BuildStage = 'finished';
  private stageLabels!: StageLabels;
  /** Cut away: a vertical plane that clips the near side of the yard, and the slice face drawn on it. */
  private cutaway: { plane: THREE.Plane; face: THREE.Group | null } | null = null;
  private clipped = new Set<THREE.Material>();
  onCutawayChanged: (on: boolean) => void = () => {};
  /** The shadow map is redrawn only when something that casts or lights it changed. */
  private shadowDirty = true;
  /** Sees only the shadow-pass layer and points away from the yard, so its own pass draws nothing. */
  private shadowPassCam = new THREE.PerspectiveCamera(10, 1, 1, 2);
  private shadowPassTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    // PCF with hardware filtering (PCFSoftShadowMap is gone from three); see the fixed pattern above.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('aria-label', '3D view of the yard');
    container.appendChild(this.renderer.domElement);
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    setGroundTextureUnits(this.renderer.capabilities.maxTextures);

    this.post = new PostPipeline(this.renderer);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envSky.uniforms.uEnvPass.value = 1;
    this.envScene.add(this.envSky.mesh);
    this.envSky.mesh.scale.setScalar(100);

    this.scene.add(this.sky.mesh);
    this.scene.fog = new THREE.FogExp2(0xc9d6e2, 0.004);
    this.keyLight.castShadow = true;
    // Bias and softness follow the shadow texel size (fitShadow).
    this.keyLight.shadow.bias = -0.0002;
    this.scene.add(this.keyLight, this.keyLight.target, this.fillLight);
    // A fixed set of night lights, always present: lit materials are compiled for the number of lights, so a plan
    // that gains or loses a light only changes intensities, never recompiles every shader.
    for (let i = 0; i < 8; i++) {
      const p = new THREE.PointLight(0xffc98a, 0, 5, 2);
      p.userData.base = 0;
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
    this.controls.addEventListener('change', () => this.invalidate());

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
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
      this.invalidate();
    });
    this.renderer.domElement.addEventListener('wheel', () => this.invalidate(), { passive: true });
    window.addEventListener('keydown', this.onKey);
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) {
        this.focusAt(e.clientX, e.clientY);
        this.onPick(this.pickAt(e.clientX, e.clientY));
      }
      down = null;
    });

    // WebGL can be taken away (Safari under memory pressure, GPU resets): say so, and rebuild when it comes back.
    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);

    this.resizeObs = new ResizeObserver(() => this.onResize());
    this.resizeObs.observe(container);
    this.watchPixelRatio();
    this.applyQuality();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    try {
      if (new URLSearchParams(location.search).get('fps') === '1') this.showFps(true);
    } catch {
      /* no query string */
    }
  }

  /** Something changed that the camera check cannot see: draw the next frame. */
  invalidate() {
    this.dirty = true;
  }

  private onKey = (e: KeyboardEvent) => {
    this.invalidate();
    if (e.key === 'F9') {
      e.preventDefault();
      this.showFps(!this.fpsEl);
    }
  };

  /**
   * Show or hide the diagnostics readout: frame rate, canvas size, and a live count of everything that can make the
   * picture jump (resizes, depth range changes, shadow redraws, rebuilds, texture swaps, pauses), with the latest
   * events and their times, and two switches that hold a suspect still.
   */
  showDiagnostics(on: boolean) {
    if (!on) {
      this.diag.el?.remove();
      this.diag.el = null;
      this.holdClip = false;
      this.alwaysDraw = false;
      return;
    }
    if (this.diag.el) return;
    const el = document.createElement('div');
    el.className = 'diag-readout';
    Object.assign(el.style, {
      position: 'absolute', left: '8px', bottom: '8px', zIndex: '7', padding: '6px 8px', font: '11px/1.4 ui-monospace, Menlo, monospace', maxWidth: 'min(420px, calc(100% - 16px))',
      color: '#e8ece6', background: 'rgba(16,20,18,0.82)', borderRadius: '4px', whiteSpace: 'pre-wrap',
    } as CSSStyleDeclaration);
    el.innerHTML = `<div data-k="text">Diagnostics starting…</div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
      <label><input type="checkbox" data-k="hold"> Hold depth range</label>
      <label><input type="checkbox" data-k="always"> Draw every frame</label></div>`;
    el.querySelector<HTMLInputElement>('[data-k="hold"]')!.addEventListener('change', (e) => { this.holdClip = (e.target as HTMLInputElement).checked; this.noteEvent('switch', `hold depth range ${this.holdClip ? 'on' : 'off'}`); });
    el.querySelector<HTMLInputElement>('[data-k="always"]')!.addEventListener('change', (e) => { this.alwaysDraw = (e.target as HTMLInputElement).checked; this.noteEvent('switch', `draw every frame ${this.alwaysDraw ? 'on' : 'off'}`); });
    if (getComputedStyle(this.container).position === 'static') this.container.style.position = 'relative';
    this.container.appendChild(el);
    this.diag.el = el;
    this.diag.counts.clear();
    this.diag.log = [];
    this.fpsWin = [];
  }

  get diagnosticsOn() {
    return !!this.diag.el;
  }

  /** Show or hide a small frame-rate readout (frames per second, and the slowest frame of the last second). */
  showFps(on: boolean) {
    if (!on) {
      this.fpsEl?.remove();
      this.fpsEl = null;
      return;
    }
    if (this.fpsEl) return;
    const el = document.createElement('div');
    el.className = 'fps-readout';
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position: 'absolute', left: '8px', bottom: '8px', zIndex: '5', padding: '3px 6px', font: '11px/1.35 ui-monospace, Menlo, monospace',
      color: '#e8ece6', background: 'rgba(16,20,18,0.72)', borderRadius: '3px', pointerEvents: 'none', whiteSpace: 'pre',
    } as CSSStyleDeclaration);
    el.textContent = '-- fps';
    if (getComputedStyle(this.container).position === 'static') this.container.style.position = 'relative';
    this.container.appendChild(el);
    this.fpsEl = el;
    this.fpsWin = [];
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.noteEvent('WebGL context lost');
    this.contextLost = true;
    if (!this.lossNote) {
      const n = document.createElement('div');
      n.className = 'context-note';
      n.setAttribute('role', 'status');
      n.textContent = 'Restoring the 3D view…';
      Object.assign(n.style, {
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: '5', padding: '8px 12px',
        font: '13px/1.4 system-ui, sans-serif', color: '#e8ece6', background: 'rgba(16,20,18,0.85)', borderRadius: '4px',
      } as CSSStyleDeclaration);
      if (getComputedStyle(this.container).position === 'static') this.container.style.position = 'relative';
      this.container.appendChild(n);
      this.lossNote = n;
    }
  };

  private onContextRestored = () => {
    // three restores its own state; everything drawn into textures (lighting environment, shadow map) is redone,
    // and the yard is rebuilt so every buffer and texture is uploaded again.
    this.contextLost = false;
    // The old generator's GPU objects died with the old context; a new one starts clean.
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = null;
    this.envKey = '';
    this.keyLight.shadow.map?.dispose();
    this.keyLight.shadow.map = null;
    this.shadowDirty = true;
    this.size.w = 0;
    this.resize();
    if (this.plan) this.applyPlan(this.plan, true, false);
    else this.updateSky(true);
    this.lossNote?.remove();
    this.lossNote = null;
    this.invalidate();
  };

  /** Moving the window to a screen with another pixel density changes the drawing size. */
  private watchPixelRatio() {
    this.dprQuery?.removeEventListener('change', this.onDprChange);
    try {
      this.dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      this.dprQuery.addEventListener('change', this.onDprChange);
    } catch {
      this.dprQuery = null;
    }
  }

  private onDprChange = () => {
    this.watchPixelRatio();
    this.renderer.setPixelRatio(this.pixelRatioFor(this.state.quality));
    this.resize();
  };

  /* -------------------------------------------------------------- */

  /**
   * Show a plan. Building happens now (a plan that cannot be built throws here); the returned promise resolves
   * once the new yard is on screen, after its shaders are warmed (or at once for a paving-only restyle).
   */
  setPlan(plan: SitePlan, keepCamera = false): Promise<void> {
    this.applyPlan(plan, keepCamera, true);
    return this.built();
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
      this.invalidate();
      return;
    }
    this.plan = plan;
    // Until the new yard is built, nothing may be restyled.
    this.builtPlan = null;
    // A yard still warming up from an earlier plan is dropped: only the newest is shown.
    if (this.pending) {
      this.pending.dispose();
      this.pending = null;
    }
    const token = ++this.buildToken;
    const next = buildScene(plan, this.state.quality, this.mirror, this.sky.uniforms, this.assets);
    // Every shadow caster joins the shadow pass (plants bring their own lower-detail casters).
    next.root.traverse((o) => {
      if (o.castShadow) o.layers.enable(SHADOW_PASS_LAYER);
    });
    next.setYears(this.state.years);
    next.setStage(this.stage);
    this.pending = next;
    // Compile the new yard's shaders while the old one stays on screen (in the background where the browser can),
    // then swap. The old yard is released only after that, so every shader both share is kept, not rebuilt.
    const swap = () => {
      if (token !== this.buildToken || this.disposed || this.pending !== next) return;
      this.pending = null;
      this.swapIn(next, plan, copy, keepCamera);
    };
    let warm: Promise<unknown> | null = null;
    // Programs are compiled for the current render target's color space: the yard is drawn into the post
    // pipeline's linear HDR target (and the mirror's), not the canvas, so warm that variant.
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    try {
      r.setRenderTarget(this.post.sceneRT);
      warm = r.compileAsync(next.root, this.camera, this.scene);
    } catch {
      warm = null;
    } finally {
      r.setRenderTarget(prevTarget);
    }
    if (warm) warm.then(swap, swap);
    else swap();
  }

  private swapIn(next: SceneBuild, plan: SitePlan, copy: SitePlan, keepCamera: boolean) {
    this.noteEvent('rebuild', 'new yard swapped in');
    this.dropCutawayFace();
    const old = this.build;
    if (old) {
      this.scene.remove(old.root);
      this.retired.push(old);
    }
    // Uploaded files the new plan no longer uses go only now: the old yard showed them until this swap.
    this.assets.prune(new Set((plan.models ?? []).map((m) => m.asset)));
    // The top of everything built (mature plant sizes, structures, the neighborhood), for the near plane.
    try {
      const box = new THREE.Box3().setFromObject(next.root);
      this.yardTop = box.isEmpty() ? 0 : box.max.y;
    } catch {
      this.yardTop = 20;
    }
    this.build = next;
    this.builtPlan = copy;
    this.focusSurfaces = next.surfaces.filter((o) => !o.userData?.plantId);
    this.shadowDirty = true;
    this.scene.add(next.root);
    this.stageLabels.set(next.construction.labels, this.stage);
    this.refreshCutaway();
    this.views = generateViews(plan, next.gm.height);
    this.onViewsChanged(this.views);
    if (this.measure.visible) this.measure.rebuild(plan, next, this.state.years);
    this.updateSky(true);
    this.assignNightLights();
    if (!keepCamera && this.views.length) this.jumpTo(this.views[0]);
    this.invalidate();
    for (const id of next.missingAssets) this.onNeedAsset(id);
    const waiting = this.whenBuilt;
    this.whenBuilt = [];
    for (const f of waiting) f();
  }

  /** Resolves once the newest plan's yard is on screen. */
  private built(): Promise<void> {
    if (!this.pending) return Promise.resolve();
    return new Promise((res) => this.whenBuilt.push(res));
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
    this.pending?.setYears(y);
    this.shadowDirty = true;
    this.invalidate();
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
    this.invalidate();
  }

  setMotion(on: boolean) {
    this.state.motion = on;
    this.invalidate();
  }

  setLens(l: Partial<LensSettings>) {
    Object.assign(this.post.lens, l);
    this.invalidate();
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

  private pixelRatioFor(q: Quality) {
    const dpr = window.devicePixelRatio || 1;
    return q === 'draft' || q === 'light' ? Math.min(dpr, 1) : q === 'balanced' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  }

  private applyQuality() {
    const q = this.state.quality;
    this.renderer.setPixelRatio(this.pixelRatioFor(q));
    const size = q === 'draft' || q === 'light' ? 1024 : q === 'balanced' ? 2048 : 4096;
    this.keyLight.shadow.mapSize.set(size, size);
    this.keyLight.shadow.map?.dispose();
    this.keyLight.shadow.map = null;
    this.fitShadow();
    this.shadowDirty = true;
    this.mirror.enabled = q !== 'draft';
    this.mirror.scale = q === 'max' ? 1 : q === 'light' ? 0.25 : 0.5;
    this.post.setQuality(q);
    this.size.w = 0;
    this.resize();
  }

  /**
   * The container changed size. A single change is applied at once and drawn before the browser paints, so no
   * blank frame shows. During a continuous resize (a dragged split, a panel animating, full screen opening) the
   * picture is stretched to fit and the buffers are remade once it settles. A hidden container (size 0) keeps
   * everything as it was.
   */
  private onResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w < 2 || h < 2) return;
    if (w === this.size.w && h === this.size.h && this.renderer.getPixelRatio() === this.size.pr) return;
    this.noteEvent('resize', `${this.size.w}×${this.size.h} → ${w}×${h}`);
    const now = performance.now();
    const burst = now - this.lastResize < RESIZE_SETTLE_MS;
    this.lastResize = now;
    clearTimeout(this.resizeTimer);
    if (burst && this.size.w) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.draw(0);
      this.resizeTimer = window.setTimeout(() => this.resize(), RESIZE_SETTLE_MS);
      return;
    }
    this.resize();
  }

  /** Make the drawing buffers for the container's size, and draw a frame now. */
  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w < 2 || h < 2) return;
    const pr = this.renderer.getPixelRatio();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (w !== this.size.w || h !== this.size.h || pr !== this.size.pr) {
      this.size = { w, h, pr };
      this.renderer.setSize(w, h, false);
      this.post.setSize(Math.round(w * pr), Math.round(h * pr));
      this.mirror.setSize(w * pr, h * pr);
    }
    // Setting the size cleared the canvas; fill it before the browser shows it.
    this.draw(0);
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
    // The lighting environment depends only on the sky, so a new yard under the same sky keeps it.
    const key = `${site.latitude}|${site.northAngleDeg}|${dayOfYear(this.state.date)}|${this.currentHour()}`;
    if (regenEnv && key !== this.envKey) this.regenEnv(key);
    // Night accents.
    if (this.build) {
      const n = s.night > 0 ? Math.min(1, 0.25 + s.night) : s.sunElevation < 2 ? 0.25 : 0;
      for (const m of this.build.glow) m.emissiveIntensity = n * (m.color.r > 0.5 ? 7 : 2.4);
      setFlames(this.build.features, s.sunElevation < 4 ? Math.min(1, 0.4 + s.night) : 0);
      this.pointLights.forEach((p) => (p.intensity = (p.userData.base ?? 0) * n));
    }
    this.invalidate();
  }

  private regenEnv(key: string) {
    this.envKey = key;
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
    // Snap the shadow camera's center to whole shadow texels across the sun's view, so the shadow map's grid
    // stays put in the world (edges never shimmer as the framing is redone).
    const sh = this.keyLight.shadow;
    const texel = (2 * R) / sh.mapSize.x;
    const rot = new THREE.Matrix4().lookAt(dir, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    const inv = rot.clone().transpose();
    const c = new THREE.Vector3(cx, 0, cz).applyMatrix4(inv);
    c.x = Math.round(c.x / texel) * texel;
    c.y = Math.round(c.y / texel) * texel;
    c.applyMatrix4(rot);
    this.keyLight.position.copy(c).addScaledVector(dir, 80);
    this.keyLight.target.position.copy(c);
    // Normal offset of about half a texel keeps lit surfaces free of acne at every map size (Light's coarse map
    // too) and at low sun, without shadows floating off their casters.
    sh.normalBias = texel * 0.6;
    sh.radius = sh.mapSize.x <= 1024 ? 1.25 : 1.75;
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
      // Unused lights stay in the scene, dark (see the constructor).
      if (!l) {
        p.userData.base = 0;
        p.userData.flicker = false;
        p.intensity = 0;
        return;
      }
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
    this.focusInv = 1 / Math.max(0.3, this.focusTarget);
    this.invalidate();
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
    this.invalidate();
  }

  /** On shows the totals view. */
  /** Show a build stage: demo, excavation, open trenches with the pipes, backfill, base rock, bedding, or the finished yard. */
  setStage(stage: BuildStage) {
    if (stage === this.stage) return;
    this.stage = stage;
    this.pending?.setStage(stage);
    this.invalidate();
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
      this.invalidate();
      this.onCutawayChanged(false);
      return;
    }
    // Where the cut goes: the point the orbit view is centered on. In first person that is the ground point
    // straight ahead (2 to 20 m away), since the view there is not centered on the yard.
    const cam = this.camera.position;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const at = this.controls.target.clone();
    if (this.navMode !== 'orbit') {
      const d = fwd.y < -0.05 ? (cam.y - this.groundAt(cam.x, cam.z)) / -fwd.y : 6;
      at.copy(cam).addScaledVector(fwd, Math.min(20, Math.max(2, d)));
    }
    const g = this.groundAt(at.x, at.z);
    at.y = g;
    const dir = new THREE.Vector3(at.x - cam.x, 0, at.z - cam.z);
    // Looking straight down: cut along the bottom of the screen instead.
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0).applyQuaternion(this.camera.quaternion).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const plane = new THREE.Plane(dir, -dir.dot(at));
    this.renderer.localClippingEnabled = true;
    this.dropCutawayFace();
    this.cutaway = { plane, face: null };
    this.stageLabels.clip = plane;
    this.refreshCutaway();
    // Face the cut: step back from it, a little above the ground, looking at the ground just below grade there,
    // so the slice fills the view instead of the empty space where the near side of the yard was.
    const height = this.navMode === 'walk' ? EYE_HEIGHT : 1.2;
    this.jumpTo({
      id: 'cutaway',
      label: 'Cut away',
      eye: new THREE.Vector3(at.x - dir.x * 3.6, g + height, at.z - dir.z * 3.6),
      target: new THREE.Vector3(at.x, g - 0.35, at.z),
      fov: this.camera.fov,
    });
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
    this.invalidate();
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
    this.tween = { from: { e: this.camera.position.clone(), t: this.controls.target.clone(), f: this.camera.fov }, to: v, t0: -1, dur: 1400 };
    this.invalidate();
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
    if (this.pointLocked) {
      this.pointDue = false;
      return;
    }
    const now = performance.now();
    if (now - this.pointT < 120) return;
    // This report sees the view as it is now; drawing may pause after it (see tick).
    this.pointDue = this.camMoved;
    this.pointT = now;
    const hit = this.pointAtCenter();
    const key = hit ? `${hit.id}|${hit.part}|${hit.catalogId}` : '';
    if (key === this.pointKey) return;
    this.pointKey = key;
    const label = this.reticle?.querySelector('span');
    if (label) {
      label.textContent = hit ? pointName(hit.catalogId) : '';
    }
    this.reticle?.classList.toggle('on', !!hit);
    this.onPoint(hit);
  }

  private pointAtCenter(): PointHit | null {
    if (!this.build) return null;
    this.raycaster.setFromCamera(this.v2.set(0, 0), this.camera);
    const hard = this.build.root.getObjectByName('hardscape');
    // Water is tested too: a pool or pond is something to point at, though it is not a focus surface.
    const hits = this.raycaster.intersectObjects([...this.build.surfaces, ...(hard ? [hard] : []), ...this.build.water.surfaces], true);
    let hit = hits[0];
    if (!hit) return null;
    // Lawn, beds, rock and DG are painted on the one site ground mesh: the zone on top at the hit point is the item.
    // The ground stays level over a pool and is only opened there in the shader, so a hit on it over water goes on
    // to what is below (the pool's water).
    const pools = (this.plan?.water ?? []).filter((w) => w.kind === 'pool' && w.polygon && w.polygon.length > 2);
    for (let i = 0; hit?.object.userData?.pointGround; hit = hits[++i]) {
      const p: [number, number] = [hit.point.x, hit.point.z];
      // Over a pool first: a pool drawn inside a lawn or bed is the pool, not the lawn.
      if (pools.some((w) => pointInPolygon(p, w.polygon!))) continue;
      const z = this.build.gm.zoneAt(p);
      if (z && z.catalogId) return { id: z.id, part: z.kind === 'hardscape' ? 'main' : z.kind, catalogId: z.catalogId };
      return null;
    }
    if (!hit) return null;
    let part = '', catalogId = '';
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      if (!part && typeof o.userData?.part === 'string') { part = o.userData.part; catalogId = String(o.userData.catalogId ?? ''); }
      // A plant's proxy names its placement; a mass-planted bed's plants (<bed id>-fill-<n>) report the bed.
      const plant = o.userData?.plantId;
      if (typeof plant === 'string') return part && catalogId ? { id: plant.replace(/-fill-\d+$/, ''), part, catalogId } : null;
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
    this.invalidate();
  }

  private autofocus() {
    if (!this.build) return;
    if (this.manualFocus) {
      this.focusTarget = this.camera.position.distanceTo(this.manualFocus);
      return;
    }
    this.raycaster.setFromCamera(this.v2.set(0, -0.1), this.camera);
    this.raycaster.far = 300;
    // Solid surfaces only: the plants' invisible spheres flip the focus between a shrub and the ground behind it.
    const hit = this.raycaster.intersectObjects(this.focusSurfaces, true)[0];
    this.raycaster.far = Infinity;
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

  private loop(ts: number) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden || this.contextLost) {
      this.lastTs = -1;
      return;
    }
    // Steps follow the display's own frame times (not when this code happened to run), never larger than MAX_DT.
    const dt = this.lastTs < 0 ? 1 / 60 : Math.min(MAX_DT, Math.max(0, (ts - this.lastTs) / 1000));
    this.lastTs = ts;
    this.tick(dt, ts);
  }

  /** Anything on screen that moves by itself (leaves in the wind, water, flames) while Motion is on. */
  private animating(): boolean {
    if (!this.state.motion || !this.build) return false;
    if (this.state.wind > 0.001 && (this.build.plantCount > 0 || this.build.root.getObjectByName('turf'))) return true;
    if (this.build.water.surfaces.length || this.build.fallMats.length) return true;
    return this.pointLights.some((p) => p.userData.flicker && p.intensity > 0) || this.build.features.flames.some((f) => f.visible);
  }

  /**
   * One display frame: move the camera, then draw only if something on screen can have changed. While nothing
   * moves (Motion off or nothing animated, camera at rest) drawing pauses to save power; the loop keeps running
   * so the next input is drawn in the very next frame.
   */
  private tick(dt: number, now: number) {
    const animate = this.animating();
    if (this.state.motion) GLOBAL.uTime.value += dt;
    this.moveCamera(dt, now);
    const focusing = Math.abs(1 / Math.max(0.3, this.focusTarget) - this.focusInv) > this.focusInv * 0.002;
    if (this.camMoved && this.pointerOn) this.pointDue = true;
    if (this.camMoved || this.dirty || animate || this.tween || focusing || this.shadowDirty || this.pending || (this.pointerOn && this.pointDue)) this.stillFrames = 0;
    else this.stillFrames++;
    if (this.stillFrames === SETTLE_FRAMES + 1) this.noteEvent('pause', '(view still, drawing stops)');
    if (this.stillFrames > SETTLE_FRAMES && !this.alwaysDraw) {
      this.frameStats(dt, false);
      return;
    }
    this.draw(dt);
    this.frameStats(dt, true);
  }

  private moveCamera(dt: number, now: number) {
    if (this.tween) {
      if (this.tween.t0 < 0) this.tween.t0 = now;
      const k = Math.min(1, (now - this.tween.t0) / this.tween.dur);
      const e = ease(k);
      this.camera.position.lerpVectors(this.tween.from.e, this.tween.to.eye, e);
      this.controls.target.lerpVectors(this.tween.from.t, this.tween.to.target, e);
      this.camera.fov = this.tween.from.f + (this.tween.to.fov - this.tween.from.f) * e;
      this.camera.updateProjectionMatrix();
      if (k >= 1) this.tween = null;
    }
    this.nav.update(dt);
    if (this.navMode === 'orbit') {
      // The same glide per second at any frame rate (60, 120 Hz, or throttled to 30).
      this.controls.dampingFactor = 1 - Math.pow(1 - 0.08, dt * 60);
      if (dt > 0) this.controls.update(dt);
    } else this.camera.lookAt(this.controls.target);
    this.keepAboveGround();
    this.fitClipPlanes(this.camera, this.controls.target);
    this.camera.updateMatrixWorld();
    this.camMoved = !this.camera.matrixWorld.equals(this.lastView) || !this.camera.projectionMatrix.equals(this.lastProj);
    if (this.camMoved) {
      this.lastView.copy(this.camera.matrixWorld);
      this.lastProj.copy(this.camera.projectionMatrix);
    }
  }

  /**
   * Near and far planes that follow the camera: the depth buffer's precision goes where the eye is, so paving
   * layers millimeters apart do not shimmer into each other from the overview, and nothing near is clipped up close.
   */
  private fitClipPlanes(cam: THREE.PerspectiveCamera, target: THREE.Vector3) {
    const g = this.build ? Math.max(0, this.build.gm.height([cam.position.x, cam.position.z])) : 0;
    const h = Math.max(0, cam.position.y - g);
    const d = cam.position.distanceTo(target);
    // Flying above the yard, the nearest thing can be a tree top or roof well above the ground under the
    // camera: below the tallest thing allow no more than 6 m of clear space, above it the height over it.
    const clear = Math.max(cam.position.y - this.yardTop, 6);
    const near = THREE.MathUtils.clamp(Math.min(h, d, clear) * 0.08, 0.05, 2);
    const far = 900;
    if (this.holdClip && cam === this.camera) return;
    if (Math.abs(near - cam.near) > cam.near * 0.02 || cam.far !== far) {
      if (cam === this.camera) this.noteEvent('depth range', `near ${cam.near.toFixed(2)} → ${near.toFixed(2)} m`);
      cam.near = near;
      cam.far = far;
      cam.updateProjectionMatrix();
    }
  }

  /**
   * Lawn blades fade out only where they would be drawn about a third of a pixel wide or less (see foliage.ts):
   * there they are pure sparkle, and the lawn's ground texture carries the color.
   */
  private fitTurfFade(cam: THREE.PerspectiveCamera, viewPx: number) {
    const pxPerM = viewPx / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const end = THREE.MathUtils.clamp((0.013 * pxPerM) / 0.35, 18, 90);
    GLOBAL.uTurfFade.value.set(end * 0.6, end);
  }

  /** Draw a frame of the live view. */
  private draw(dt: number) {
    if (this.contextLost) return;
    this.dirty = false;
    this.sky.uniforms.uTime.value = GLOBAL.uTime.value;
    this.sky.mesh.position.copy(this.camera.position);

    if (this.camMoved && this.post.lens.dof && this.frame % 4 === 0) this.autofocus();
    this.frame++;
    // Ease the focus in diopters, at the same rate at any frame rate.
    const goal = 1 / Math.max(0.3, this.focusTarget);
    this.focusInv += (goal - this.focusInv) * (1 - Math.exp(-dt * 5));
    this.post.focus = 1 / this.focusInv;

    // Fire flicker.
    const t = GLOBAL.uTime.value;
    for (const p of this.pointLights) {
      if (p.userData.flicker && p.userData.base > 0 && p.intensity > 0) {
        const n = this.skyNow ? Math.min(1, 0.25 + this.skyNow.night) : 1;
        p.intensity = (p.userData.base ?? 0) * n * (0.82 + 0.18 * Math.sin(t * 13.0) * Math.sin(t * 7.3 + 1.2));
      }
    }

    // At the lighter settings plants switch to fewer leaves sooner (as if the view were smaller).
    const lodScale = this.state.quality === 'light' || this.state.quality === 'draft' ? 0.6 : 1;
    this.camera.updateMatrixWorld();
    this.drawScene(this.camera, this.container.clientHeight * lodScale, this.size.h * this.size.pr, this.post, null, t);
    this.measure.update(this.camera, this.container.clientWidth, this.container.clientHeight);
    this.stageLabels.update(this.camera, this.container.clientWidth, this.container.clientHeight);
    if (this.pointerOn) this.updatePointer();
    // Yards replaced by a new one are released now that the new one has been drawn (shadow pass included).
    if (this.retired.length) {
      for (const b of this.retired) b.dispose();
      this.retired.length = 0;
    }
  }

  /** The yard as `cam` sees it, through `post`, into `target` (null: the canvas). Shared by the view and stills. */
  private drawScene(cam: THREE.PerspectiveCamera, lodPx: number, devicePx: number, post: PostPipeline, target: THREE.WebGLRenderTarget | null, t: number) {
    // Plants are culled against this view: the camera has just moved, and its world matrix is otherwise
    // brought up to date only when it is drawn.
    this.build?.plants.update?.(cam, lodPx);
    this.build?.pebbles.update(cam);
    // The soil fills' relief comes in over a few frames once its painted maps arrive.
    if (this.build?.humus.update(cam)) this.invalidate();
    this.fitTurfFade(cam, devicePx);
    // The shadow map is cast from the plants' still pose, so it is redrawn only when the yard, the sun or the
    // plants' size changed, never on a timer while leaves sway.
    if (this.shadowDirty) this.renderShadows();
    if (this.build && this.build.water.surfaces.length && this.mirror.enabled) {
      this.mirror.render(this.renderer, this.scene, cam, this.build.water.surfaces);
    }
    post.render(this.scene, cam, t, target);
  }

  private frameStats(dt: number, drawn: boolean) {
    const fps = dt > 0 ? 1 / dt : 60;
    if (drawn) {
      this.fpsAcc += fps;
      if (++this.fpsN >= 30) {
        this.onFrameStats(this.fpsAcc / this.fpsN);
        this.fpsAcc = 0;
        this.fpsN = 0;
      }
    }
    if (!this.fpsEl && !this.diag.el) return;
    const now = performance.now();
    this.fpsWin.push(dt * 1000);
    if (drawn) this.drawnInWin++;
    if (now - this.fpsShownAt < (this.diag.el ? 1000 : 500)) return;
    const n = this.fpsWin.length;
    const total = this.fpsWin.reduce((a, b) => a + b, 0);
    const worst = this.fpsWin.reduce((a, b) => Math.max(a, b), 0);
    const avg = total > 0 ? (n * 1000) / total : 0;
    const head = this.drawnInWin === 0 ? `${avg.toFixed(0)} fps  idle (nothing moving)` : `${avg.toFixed(0)} fps  worst ${worst.toFixed(1)} ms`;
    if (this.fpsEl) this.fpsEl.textContent = head;
    if (this.diag.el) {
      const c = (k: string) => this.diag.counts.get(k) ?? 0;
      const box = this.diag.el.querySelector<HTMLElement>('[data-k="text"]')!;
      box.textContent = [
        `${head}  drawn ${this.drawnInWin}/${n} frames`,
        `canvas ${this.size.w}×${this.size.h} @${this.size.pr.toFixed(2)}x  quality ${this.state.quality}  near ${this.camera.near.toFixed(2)} m`,
        ...(this.build?.humus.object ? [`soil fills: ${this.build.humus.counts.sheetTiles} tiles (${this.build.humus.shown.near} fine, ${this.build.humus.shown.far} coarse shown), ${this.build.humus.shown.pieces} of ${this.build.humus.counts.clods + this.build.humus.counts.shreds} pieces shown, ${(this.build.humus.shown.triangles / 1e6).toFixed(2)}M triangles in ${this.build.humus.shown.draws} draws (before culling)`] : []),
        `last second: resize ${c('resize')}  depth range ${c('depth range')}  shadows ${c('shadows')}  rebuild ${c('rebuild')}  textures ${c('textures')}  pause ${c('pause')}`,
        ...this.diag.log,
      ].join('\n');
      this.diag.counts.clear();
    }
    this.fpsWin = [];
    this.drawnInWin = 0;
    this.fpsShownAt = now;
  }

  /**
   * Redraw the sun's shadow map. It is drawn in a pass of its own whose camera sees only the
   * shadow layer and looks away from the yard, so nothing else is drawn; that lets plants cast
   * shadows from lower-detail stand-ins the main view never draws.
   */
  private renderShadows() {
    this.noteEvent('shadows', 'redrawn');
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(this.shadowPassTarget);
    r.render(this.scene, this.shadowPassCam);
    r.setRenderTarget(prev);
    r.shadowMap.needsUpdate = false;
    this.shadowDirty = false;
  }

  /** Stop the frame loop (tests and background tabs). */
  pause() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  resume() {
    if (!this.raf && !this.disposed) {
      this.lastTs = -1;
      this.invalidate();
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  /** Render one frame now and return it as a PNG data URL. */
  snapshot(dt = 1 / 60): string {
    this.camera.updateMatrixWorld();
    this.draw(dt);
    return this.renderer.domElement.toDataURL('image/png');
  }

  /**
   * Render one high-resolution still with the full camera look, from the current view or from `pose`. It is drawn
   * off screen with a camera of its own, so the live view never moves, changes size or blinks while it is made.
   */
  async exportStill(width: number, type = 'image/png', quality?: number, pose?: { eye: THREE.Vector3; target: THREE.Vector3; fov: number }): Promise<Blob> {
    await this.built();
    if (this.contextLost) throw new Error('The 3D view is restarting; try again in a moment.');
    const w0 = Math.max(1, this.container.clientWidth), h0 = Math.max(1, this.container.clientHeight);
    const W = Math.max(16, Math.round(width)), H = Math.max(16, Math.round(width / (w0 / h0)));
    const cam = this.camera.clone();
    const target = this.controls.target.clone();
    let focus = this.post.focus;
    if (pose) {
      cam.position.copy(pose.eye);
      cam.fov = pose.fov;
      cam.up.set(0, 1, 0);
      cam.lookAt(pose.target);
      target.copy(pose.target);
      focus = pose.eye.distanceTo(pose.target);
    }
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
    this.fitClipPlanes(cam, target);
    cam.updateMatrixWorld();

    const post = (this.stillPost ??= new PostPipeline(this.renderer));
    post.setQuality('max');
    post.setSize(W, H);
    Object.assign(post.lens, this.post.lens);
    post.exposure = this.post.exposure;
    post.focus = focus;
    const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false });
    const pixels = new Uint8Array(W * H * 4);
    const pr = this.renderer.getPixelRatio();
    try {
      this.mirror.setSize(W, H);
      this.sky.mesh.position.copy(cam.position);
      // An exported still always gets the plant detail its own size needs.
      this.drawScene(cam, H, H, post, rt, GLOBAL.uTime.value);
      if (typeof this.renderer.readRenderTargetPixelsAsync === 'function') {
        // Start the read now; the live view's buffers are restored before waiting on it.
        const read = this.renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H, pixels);
        this.restoreLive(pr);
        await read;
      } else {
        this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, pixels);
        this.restoreLive(pr);
      }
    } catch (e) {
      this.restoreLive(pr);
      throw e;
    } finally {
      rt.dispose();
      // Keep the still pipeline's shaders, not its large buffers.
      post.setSize(1, 1);
    }
    // Rows come bottom-up from WebGL.
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('The image could not be created.');
    const img = ctx.createImageData(W, H);
    const row = W * 4;
    for (let y = 0; y < H; y++) img.data.set(pixels.subarray((H - 1 - y) * row, (H - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
    return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('The image could not be created.'))), type, quality));
  }

  /** After a still: the live view's mirror size and sky, and a fresh live frame. */
  private restoreLive(pr: number) {
    this.mirror.setSize(this.size.w * pr || 512, this.size.h * pr || 512);
    this.sky.mesh.position.copy(this.camera.position);
    this.invalidate();
  }

  /**
   * A cover picture of the yard from its first generated view (the Overview), for a second screen, as a JPEG. It is
   * drawn off screen from that view, so whoever is looking around does not notice.
   */
  async coverImage(width = 1600): Promise<Blob> {
    await this.built();
    const v = this.views[0];
    return this.exportStill(width, 'image/jpeg', 0.88, v ? { eye: v.eye, target: v.target, fov: v.fov } : undefined);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.resizeTimer);
    this.resizeObs.disconnect();
    this.dprQuery?.removeEventListener('change', this.onDprChange);
    window.removeEventListener('keydown', this.onKey);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.fpsEl?.remove();
    this.lossNote?.remove();
    this.build?.dispose();
    this.pending?.dispose();
    for (const b of this.retired) b.dispose();
    this.stillPost?.dispose();
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
