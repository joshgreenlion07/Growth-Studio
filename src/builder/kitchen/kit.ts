import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { FeatureAction } from '../actions';
import type { LandLight } from '../../engine/landlights';
import type { Tongue, FireStyle } from '../fire';
import { counterSet, stainlessSet, veneerSet } from '../../engine/kitchen-surfaces';
import { silverTravertineLedgerSet } from '../../engine/fountain-surfaces';
import { veneerFinish } from '../../siteplan/kitchen';
import { catalogMaterial, pbrMaterial, plainMaterial } from '../materials';

/*
 * The kitchen builder's toolkit: sizes in inches, the shared materials (brushed stainless with an anisotropic sheen,
 * powder coats, cast iron, the finishes), geometry helpers, and the sink a part is built into.
 *
 * Local space of a part: x across its bay (0 at the bay's center), y up from the patio, z out of the island's front
 * (0 at the veneer face). An island moves each bay's part into its own space.
 */

export const IN = 0.0254;

/** What a kitchen part is built into (builder/features.ts gives one per placed feature). Meters, local space. */
export interface KitchenSink {
  /** A static part, merged by material. */
  add(m: THREE.Material, g: THREE.BufferGeometry): void;
  /** A moving part turning or sliding about its own origin at the local point p: its geometry is given in local space. */
  hinge(px: number, py: number, pz: number): { group: THREE.Group; add(m: THREE.Material, g: THREE.BufferGeometry): void };
  /** A marker at a local point of `parent` (an action's anchor). */
  anchor(parent: THREE.Object3D | null, x: number, y: number, z: number): THREE.Object3D;
  act(a: Omit<FeatureAction, 'itemId'>): void;
  fire(t: Tongue[], style?: FireStyle): void;
  light(x: number, y: number, z: number, color: string, intensity: number, distance: number, flicker?: boolean): void;
  /** An aimed landscape-light beam in local space (engine/landlights.ts); returns the beam as placed (switch it by its `off`). */
  landLight(l: LandLight): LandLight;
  glow(m: THREE.MeshStandardMaterial): void;
  own(m: THREE.Material): void;
}

/** Something a part can open by hand, gathered by the island into its actions. */
export interface Mover {
  kind: 'hood' | 'lid' | 'door' | 'drawer';
  /** The part's name for its action ('Griddle hood'). */
  label: string;
  rig: Pick<FeatureAction, 'set' | 'tick'>;
  anchor: THREE.Object3D;
}

/** Meters-based UVs from a geometry's final positions and normals (so neighboring pieces line up). */
function worldUV(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [a, b] = ay > 0.6 ? [p.getX(i), p.getZ(i)] : ax > 0.6 ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = a;
    uv[i * 2 + 1] = b;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** A box in inches: w x h x d, x and z its center, y its bottom. UVs in meters from where it stands. */
export function bx(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.max(w, 1e-3) * IN, Math.max(h, 1e-3) * IN, Math.max(d, 1e-3) * IN);
  g.translate(x * IN, (y + h / 2) * IN, z * IN);
  return worldUV(g.toNonIndexed());
}

/** A box with rounded edges (radius r inches): the soft edge of a folded door or a slab's eased edge catches light. */
export function rbx(w: number, h: number, d: number, x: number, y: number, z: number, r: number): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  if (rr <= 0.01) return bx(w, h, d, x, y, z);
  const g = new RoundedBoxGeometry(w * IN, h * IN, d * IN, 2, rr * IN);
  g.translate(x * IN, (y + h / 2) * IN, z * IN);
  return worldUV(g.index ? g.toNonIndexed() : g);
}

/** A cylinder in inches along `axis`, centered at (x, y, z) (for 'y', y is its bottom). */
export function cy(r0: number, r1: number, len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y', seg = 20): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1 * IN, r0 * IN, len * IN, seg);
  if (axis === 'y') g.translate(0, (len / 2) * IN, 0);
  else if (axis === 'x') g.rotateZ(-Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  g.translate(x * IN, y * IN, z * IN);
  return g.toNonIndexed();
}

/** A round tube (radius r inches) along a path of points in inches. */
export function tube(points: [number, number, number][], r: number, seg = 10, steps = 24): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x * IN, y * IN, z * IN)), false, 'catmullrom', 0.2);
  return new THREE.TubeGeometry(curve, steps, r * IN, seg, false).toNonIndexed();
}

/** A bar handle on two standoffs, along `axis` ('x' across or 'y' up) from its center, standing `out` in proud of z0. */
export function barHandle(add: (m: THREE.Material, g: THREE.BufferGeometry) => void, m: THREE.Material, axis: 'x' | 'y', len: number, x: number, y: number, z0: number, out = 1.4, r = 0.3) {
  const zc = z0 + out;
  const post = len * 0.5 - 1.2;
  add(m, cy(r, r, len, x, axis === 'y' ? y - len / 2 : y, zc, axis, 16));
  // Rounded ends.
  for (const s of [-1, 1]) {
    const e = new THREE.SphereGeometry(r * IN, 12, 8);
    e.translate((axis === 'x' ? x + (s * len) / 2 : x) * IN, (axis === 'y' ? y + (s * len) / 2 : y) * IN, zc * IN);
    add(m, e.toNonIndexed());
    // Standoffs with a small foot plate on the face.
    const px = axis === 'x' ? x + s * post : x, py = axis === 'y' ? y + s * post : y;
    add(m, cy(r * 0.75, r * 0.75, out, px, py, z0 + out / 2, 'z', 12));
    add(m, cy(r * 1.5, r * 1.5, 0.12, px, py, z0 + 0.06, 'z', 16));
  }
}

/* ------------------------------------------------------------------ */
/* Materials                                                            */
/* ------------------------------------------------------------------ */

const cache = new Map<string, THREE.MeshStandardMaterial>();
function scaled(t: THREE.Texture, tile: number) {
  const c = t.clone();
  c.repeat.set(1 / tile, 1 / tile);
  c.needsUpdate = true;
  return c;
}

/**
 * Brushed stainless: a fully metallic physical material, its brushed grain in the roughness and normal maps (lines
 * along u) and an anisotropic highlight drawn out across the grain, as on a real No. 4 finish. `tint` darkens it a little
 * (the plates and trims of a second sheet).
 */
export function stainless(key = 'steel', tint = '#97938f', roughness = 1, aniso = 0.75): THREE.MeshStandardMaterial {
  let m = cache.get(`kit-ss:${key}`);
  if (m) return m;
  const s = stainlessSet();
  const p = new THREE.MeshPhysicalMaterial({
    color: tint, metalness: 1, roughness, map: scaled(s.map, s.tileMeters), roughnessMap: scaled(s.roughnessMap, s.tileMeters), normalMap: scaled(s.normalMap, s.tileMeters),
    normalScale: new THREE.Vector2(0.6, 0.6), anisotropy: aniso, anisotropyRotation: Math.PI / 2, envMapIntensity: 0.7,
  });
  cache.set(`kit-ss:${key}`, p);
  return p;
}

/** A polished metal (chrome bezels, the faucet). */
export function chrome(): THREE.MeshStandardMaterial {
  let m = cache.get('kit-chrome');
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color: '#c9ccd0', metalness: 1, roughness: 0.1, envMapIntensity: 0.9 });
    cache.set('kit-chrome', m);
  }
  return m;
}

export interface KitchenMats {
  steel: THREE.Material;
  plate: THREE.Material;
  chrome: THREE.Material;
  black: THREE.Material;
  knob: THREE.Material;
  castIron: THREE.Material;
  griddle: THREE.Material;
  cavity: THREE.Material;
  inside: THREE.Material;
  liner: THREE.Material;
  rubber: THREE.Material;
  tank: THREE.Material;
  teak: THREE.Material;
  frame: THREE.Material;
  bin: THREE.Material;
  ice: THREE.Material;
  towel: THREE.Material;
  brass: THREE.Material;
  ceramic: THREE.Material;
  dome: THREE.Material;
  firebrick: THREE.Material;
  core: THREE.Material;
  glass: THREE.Material;
}

let mats: KitchenMats | null = null;
export function kitchenMats(): KitchenMats {
  mats ??= {
    steel: stainless(),
    plate: stainless('plate', '#85817d', 1, 0.5),
    chrome: chrome(),
    black: new THREE.MeshPhysicalMaterial({ color: '#1a1b1c', roughness: 0.48, metalness: 0.25, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
    knob: plainMaterial('kit-knob', { color: '#121213', roughness: 0.32, metalness: 0.2 }),
    castIron: plainMaterial('kit-cast-iron', { color: '#1b1a19', roughness: 0.75, metalness: 0.45 }),
    griddle: plainMaterial('kit-griddle', { color: '#1c1b1a', roughness: 0.62, metalness: 0.3 }),
    cavity: plainMaterial('kit-cavity', { color: '#2b2b2a', roughness: 0.95, side: THREE.BackSide }),
    inside: plainMaterial('kit-inside', { color: '#262626', roughness: 0.85, metalness: 0.2 }),
    liner: plainMaterial('kit-liner', { color: '#cfd1d2', roughness: 0.45 }),
    rubber: plainMaterial('kit-rubber', { color: '#101010', roughness: 0.85 }),
    tank: plainMaterial('kit-tank', { color: '#e7e6e1', roughness: 0.42, metalness: 0.1 }),
    teak: plainMaterial('kit-teak', { color: '#9a7654', roughness: 0.72 }),
    frame: plainMaterial('kit-frame-black', { color: '#202122', roughness: 0.5, metalness: 0.4 }),
    bin: plainMaterial('kit-bin', { color: '#3a3c3e', roughness: 0.6 }),
    ice: plainMaterial('kit-ice', { color: '#eef4f7', roughness: 0.18, metalness: 0 }),
    towel: plainMaterial('kit-towel', { color: '#f1f0ea', roughness: 0.95 }),
    brass: plainMaterial('kit-brass', { color: '#86663a', roughness: 0.45, metalness: 0.8 }),
    ceramic: plainMaterial('kit-ceramic', { color: '#4e4a46', roughness: 0.9 }),
    dome: catalogMaterial('stucco-santa-barbara-sw-agreeable-gray'),
    firebrick: plainMaterial('kit-firebrick', { color: '#6b4a38', roughness: 0.9 }),
    core: plainMaterial('kit-core', { color: '#8d8b86', roughness: 0.95 }),
    glass: plainMaterial('kit-glass', { color: '#1b2226', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.5 }),
  };
  return mats;
}

/** A veneer finish's material (UVs in meters). */
export function veneerMaterial(id: string): THREE.MeshStandardMaterial {
  const v = veneerFinish(id);
  if (v.look === 'silver') return pbrMaterial('kit-veneer-silver', silverTravertineLedgerSet());
  if (v.look) return catalogMaterial(v.look);
  return pbrMaterial(`kit-veneer-${v.id}`, veneerSet(v.id));
}

/** A countertop finish's material. */
export function counterMaterial(id: string): THREE.MeshStandardMaterial {
  return pbrMaterial(`kit-counter-${id}`, counterSet(id));
}

/**
 * A plain name plate's face: the text in a plain sans face, light on dark (or dark on light), drawn once on a canvas at
 * runtime. Only a maker's name as text, never its logo. Null where there is no document (a worker).
 */
export function namePlate(text: string, light = true): THREE.MeshStandardMaterial | null {
  const key = `kit-name:${text}:${light}`;
  let m = cache.get(key);
  if (m) return m;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = light ? '#1a1b1c' : '#c9ccce';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = light ? '#e9e9e6' : '#1d1d1e';
  g.font = '600 86px Helvetica, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Letter-spaced capitals.
  const chars = [...text];
  const sp = 14;
  const wTotal = chars.reduce((s, ch) => s + g.measureText(ch).width, 0) + sp * (chars.length - 1);
  let x = (c.width - wTotal) / 2;
  g.textAlign = 'left';
  for (const ch of chars) {
    g.fillText(ch, x, c.height / 2 + 4);
    x += g.measureText(ch).width + sp;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.2 });
  cache.set(key, m);
  return m;
}

/** A plane facing +z, w x h inches, centered at (x, y, z), UVs 0..1 (for a name plate). */
export function facePlane(w: number, h: number, x: number, y: number, z: number, tiltX = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w * IN, h * IN);
  if (tiltX) g.rotateX(tiltX);
  g.translate(x * IN, y * IN, z * IN);
  return g.toNonIndexed();
}

/* ------------------------------------------------------------------ */
/* Motion                                                               */
/* ------------------------------------------------------------------ */

const ease = (t: number) => t * t * (3 - 2 * t);

/** A sliding part (a drawer, a pull-out): `group` moves from its rest position by `dist` meters along `axis`. */
export function slide(group: THREE.Object3D, axis: 'x' | 'y' | 'z', dist: number, on: boolean, seconds = 0.75, delay = 0): Pick<FeatureAction, 'set' | 'tick'> {
  const rest = group.position[axis];
  let t = on ? 1 : 0, target = t, wait = 0;
  const apply = () => (group.position[axis] = rest + dist * ease(t));
  apply();
  return {
    set(next, instant) {
      target = next ? 1 : 0;
      wait = next ? delay : 0;
      if (instant) {
        t = target;
        wait = 0;
        apply();
      }
    },
    tick(dt) {
      if (t === target) return false;
      if (wait > 0) {
        wait -= dt;
        return true;
      }
      const step = dt / seconds;
      t = target > t ? Math.min(target, t + step) : Math.max(target, t - step);
      apply();
      return true;
    },
  };
}
