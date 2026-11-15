import * as THREE from 'three';
import { GeoBuilder, UP, V, barkTexture, canopyDepth, clamp, col, jitter, leafQuad, leafTexture, lerp, rng, uvCell, type PlantSpec, type SpeciesGeo } from '../kit';
import { WOOD_BEND, crownEnvelope, emitWood, fitBuilders, growTree, limbAt, rootFlare, serratePath, tiled, type Limb } from './shared-trees-a';

/**
 * Japanese maple (Acer palmatum). A short trunk that divides low into a few
 * ascending stems, branches held in layered, nearly level sprays, and fine
 * opposite twigs carrying pairs of palmate leaves: 5 to 7 long-pointed,
 * toothed lobes cut about two thirds of the way to the base, 2.5 to 4 in
 * across, on slender petioles. The red and green maples share this file and
 * differ in palette and proportions.
 */

export interface MaplePalette {
  key: string;
  /** Leaf blade colors in the texture: center, body and lobe tips. */
  leafDark: string;
  leafMid: string;
  leafLight: string;
  /** Color the newest leaves at the shoot tips lean toward. */
  leafNew: string;
  vein: string;
  /** Petiole and young twig colors. */
  petiole: string;
  twig: string;
  /** Vertex tints: shaded interior, typical, and sunlit shoot tips. */
  tintInner: string;
  tintOuter: string;
  tintNew: string;
  /** Bark: base, dark streak and light streak. */
  bark: [string, string, string];
}

export interface MapleShape {
  /** Lobes per leaf (5 or 7) and leaf width in meters. */
  lobes: 5 | 7;
  leafSize: number;
  /** Height fractions where the crown starts and where it is widest. */
  crownBase: number;
  crownWide: number;
  /** Lean of the main stems away from vertical, radians. */
  stemLean: number;
  /** How level the branch sprays are, 0..1. */
  layering: number;
  /** Trunk radius at the ground as a fraction of height. */
  trunk: number;
  /** Spacing multiplier between leaf sprays along a twig (1 = default). */
  gap: number;
}

const LOBE_ANG = [0, 0.6, 1.2, 1.85];
const LOBE_LEN = [1, 0.88, 0.63, 0.34];

/** One palmate leaf, petiole joint at (x, y), middle lobe pointing along `rot`. `fresh` 0..1 leans it toward the new-growth color. */
function palmate(g: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, p: MaplePalette, lobes: number, shade: number, fresh: number) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const half = (lobes - 1) / 2;
  const order: number[] = [];
  for (let k = half; k >= 1; k--) order.push(-k, k);
  order.push(0);
  for (const k of order) {
    const a = Math.abs(k);
    const len = size * LOBE_LEN[a];
    g.save();
    g.rotate(Math.sign(k) * LOBE_ANG[a]);
    const grad = g.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, p.leafDark);
    grad.addColorStop(0.5, p.leafMid);
    grad.addColorStop(1, p.leafLight);
    g.fillStyle = grad;
    serratePath(g, len, len * 0.27, 0.42, Math.max(5, Math.round(11 * LOBE_LEN[a])), 0.16, 1.5);
    g.fill();
    if (fresh > 0.02) {
      g.globalAlpha = fresh * 0.75;
      g.fillStyle = p.leafNew;
      g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = shade < 0.5 ? `rgba(0,0,0,${(0.5 - shade) * 0.45})` : `rgba(255,255,255,${(shade - 0.5) * 0.07})`;
    g.fill();
    // Midrib and a few side veins.
    g.strokeStyle = p.vein;
    g.lineWidth = Math.max(0.8, size * 0.012);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(len * 0.93, 0);
    g.stroke();
    g.lineWidth = Math.max(0.5, size * 0.006);
    g.beginPath();
    for (let v = 1; v <= 5; v++) {
      const t = 0.22 + v * 0.11;
      for (const s of [-1, 1]) {
        g.moveTo(len * t, 0);
        g.lineTo(len * (t + 0.1), s * len * 0.075 * (1 - Math.abs(t - 0.45)));
      }
    }
    g.stroke();
    g.restore();
  }
  g.restore();
}

/**
 * 1024 atlas, 2 x 2 cells. Cells 0 to 2: sprays (a twig with opposite leaf
 * pairs and a terminal pair, the tip leaves younger). Cell 3: four single
 * leaves on their petioles, each in a 256 px quarter.
 */
function mapleLeaves(p: MaplePalette, lobes: number): THREE.Texture {
  return leafTexture(`maple-leaves-${p.key}`, 1024, 1024, (g) => {
    const S = 512;
    const r = rng(`maple-tex-${p.key}`);
    g.lineCap = 'round';
    for (let cell = 0; cell < 3; cell++) {
      g.save();
      g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      const nodes = cell === 2 ? 2 : 3;
      const x0 = S / 2, y0 = S, x1 = S / 2 + (r() - 0.5) * S * 0.06, y1 = S * (cell === 2 ? 0.46 : 0.36);
      g.strokeStyle = p.twig;
      g.lineWidth = S * 0.011;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo(S / 2 + (r() - 0.5) * S * 0.05, (y0 + y1) / 2, x1, y1);
      g.stroke();
      const leaf = S * (cell === 2 ? 0.27 : 0.235);
      for (let n = 0; n <= nodes; n++) {
        const t = n === nodes ? 1 : 0.1 + (n / nodes) * 0.84;
        const nx = lerp(x0, x1, t), ny = lerp(y0, y1, t);
        const tipNode = n === nodes;
        for (const s of [-1, 1]) {
          const a = -Math.PI / 2 + s * (tipNode ? 0.42 + r() * 0.2 : 1.0 + r() * 0.35 - t * 0.2);
          const pl = S * (tipNode ? 0.035 + r() * 0.02 : 0.075 + r() * 0.04);
          const lx = nx + Math.cos(a) * pl, ly = ny + Math.sin(a) * pl;
          g.strokeStyle = p.petiole;
          g.lineWidth = S * 0.005;
          g.beginPath();
          g.moveTo(nx, ny);
          g.lineTo(lx, ly);
          g.stroke();
          palmate(g, lx, ly, leaf * (tipNode ? 0.78 : 0.88 + r() * 0.24), a + (r() - 0.5) * 0.45, p, lobes, 0.25 + r() * 0.75, tipNode ? 0.55 + r() * 0.3 : t > 0.6 ? r() * 0.3 : 0);
        }
      }
      g.restore();
    }
    for (let q = 0; q < 4; q++) {
      const Q = 256;
      g.save();
      g.translate(S + (q % 2) * Q, S + Math.floor(q / 2) * Q);
      g.beginPath();
      g.rect(0, 0, Q, Q);
      g.clip();
      const bend = (r() - 0.5) * 0.3;
      const jx = Q / 2 + bend * Q * 0.2, jy = Q * 0.72;
      g.strokeStyle = p.petiole;
      g.lineWidth = Q * 0.014;
      g.beginPath();
      g.moveTo(Q / 2, Q);
      g.lineTo(jx, jy);
      g.stroke();
      palmate(g, jx, jy, Q * 0.41, -Math.PI / 2 + bend, p, lobes, 0.35 + r() * 0.6, q === 3 ? 0.7 : q === 2 ? 0.25 : 0);
      g.restore();
    }
  });
}

/** UV of single leaf q (0..3) in the atlas. */
function singleUV(q: number): [number, number, number, number] {
  const u0 = 0.5 + (q % 2) * 0.25, v1 = 0.5 - Math.floor(q / 2) * 0.25;
  return [u0, v1 - 0.25, u0 + 0.25, v1];
}

/** Smooth gray bark with faint vertical streaks and small lenticels. */
function mapleBark(p: MaplePalette): THREE.Texture {
  return barkTexture(`maple-bark-${p.key}`, 256, (g, S) => {
    const r = rng(`maple-bark-${p.key}`);
    g.fillStyle = p.bark[0];
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 520; i++) {
      const x = r() * S, y = r() * S, len = 16 + r() * 90, dx = (r() - 0.5) * 5;
      const dark = r() < 0.5;
      const a = 0.06 + r() * 0.16, w = 0.6 + r() * 2.2;
      tiled(g, S, () => {
        g.globalAlpha = a;
        g.strokeStyle = dark ? p.bark[1] : p.bark[2];
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + dx, y + len);
        g.stroke();
      });
    }
    for (let i = 0; i < 70; i++) {
      const x = r() * S, y = r() * S, w = 3 + r() * 6;
      tiled(g, S, () => {
        g.globalAlpha = 0.25 + r() * 0.2;
        g.fillStyle = p.bark[2];
        g.fillRect(x, y, w, 1.2);
      });
    }
    g.globalAlpha = 1;
  });
}

export function buildMaple(spec: PlantSpec, p: MaplePalette, shape: MapleShape): SpeciesGeo {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const wood = new GeoBuilder();
  const leaves = new GeoBuilder();

  const env = crownEnvelope({ H, R, base: shape.crownBase, wide: shape.crownWide, baseR: 0.5, pBot: 0.7, pTop: 2.3, lump: 0.07, phase: r() * 6 });
  const leanAz = r() * Math.PI * 2;
  const r0 = H * shape.trunk;
  // Densities are tuned on a 4.5 m tree; a bigger tree gets longer internodes, not more twigs.
  const sc = H / 4.5;
  const limbs = growTree(
    r,
    // The trunk carries on as the middle stem.
    [{ base: V(0, -0.12, 0), dir: V(Math.cos(leanAz) * 0.1, 1, Math.sin(leanAz) * 0.1), length: H * 0.74, r0, r1: r0 * 0.16, segs: 7, gnarl: 0.26, up: 0.1 }],
    [
      // Co-dominant stems leaving the trunk low down, one after another.
      { count: [4, 5], from: 0.1, to: 0.27, angle: shape.stemLean, angleVar: 0.12, len: 0.9, lenVar: 0.1, taperAlong: 1, radius: 0.72, tip: 0.2, segs: 6, gnarl: 0.3, up: 0.26, early: 1, limit: [0.97, 1], minKeep: 0.6 },
      // Scaffold branches, held nearly level, running out to the edge of the crown.
      { parents: [0, 1], perMeter: 2.5 / sc, from: (l) => (l.level === 0 ? 0.36 : 0.2), to: 0.97, angle: 1.05, angleVar: 0.25, len: 0.75, lenVar: 0.25, lenMin: 0.6 * sc, taperAlong: 0.75, radius: 0.5, tip: 0.22, segs: 5, gnarl: 0.34, up: 0.05, flatten: shape.layering * 0.75, out: 0.3, early: 0.96, limit: [0.94, 1], minKeep: 0.5 },
      { perMeter: 4.8 / sc, from: 0.14, to: 0.97, angle: 0.9, angleVar: 0.25, len: 0.5, lenVar: 0.3, lenMin: 0.28 * sc, lenMax: 0.9 * sc, taperAlong: 0.7, radius: 0.5, tip: 0.3, tipMin: 0.003, segs: 3, gnarl: 0.4, flatten: shape.layering * 0.7, out: 0.1, early: 0.92, opposite: true, smooth: false, limit: [0.94, 1.01], minKeep: 0.35 },
      { perMeter: 8 / sc, from: 0.12, to: 0.97, angle: 0.8, angleVar: 0.25, len: 0.5, lenVar: 0.35, lenMin: 0.12 * sc, lenMax: 0.36 * sc, taperAlong: 0.7, radius: 0.5, tip: 0.5, tipMin: 0.0016, segs: 1, gnarl: 0.2, flatten: shape.layering * 0.8, early: 0.88, opposite: true, smooth: false, limit: [0.95, 1.03] },
    ],
    env,
  );
  rootFlare(limbs[0], 0.55, r0 * 1.6);

  const center = V(0, H * lerp(shape.crownBase, 1, 0.42), 0), radii = V(R, H * (1 - shape.crownBase) * 0.62, R);
  const sway = (q: THREE.Vector3) => clamp(Math.pow(Math.max(0, q.y) / H, 1.6) * 0.7 + (Math.hypot(q.x, q.z) / R) * 0.3);
  const barkCol = col('#ffffff'), twigCol = new THREE.Color(p.twig).multiplyScalar(1.35);
  emitWood(wood, limbs, {
    tile: 0.42,
    sway,
    color: (l: Limb) => (l.level >= 4 ? twigCol : l.level === 3 ? barkCol.clone().lerp(twigCol, 0.55) : barkCol),
    sides: (l) => (l.level >= 4 ? 3 : l.level === 3 ? 4 : l.level === 2 ? 6 : l.level === 1 ? 9 : 12),
  });

  const tInner = col(p.tintInner), tOuter = col(p.tintOuter), tNew = col(p.tintNew);
  const k = Math.sqrt((shape.leafSize / 0.08) * sc);
  const tint = (at: THREE.Vector3, tipness: number) => {
    const depth = canopyDepth(at, center, radii);
    const shade = lerp(0.5, 1, Math.pow(depth, 1.6)) * lerp(0.8, 1, clamp((at.y - H * shape.crownBase) / (H * 0.5)));
    return jitter(tInner.clone().lerp(tOuter, Math.pow(depth, 1.3)).lerp(tNew, tipness * depth * r() * 0.8), r, 0.01, 0.05, 0.05).multiplyScalar(shade);
  };
  const outward = (at: THREE.Vector3) => V(at.x, (at.y - center.y) * 0.6, at.z).normalize();
  const leafBirth = (b: number, at: THREE.Vector3) => clamp(b + (r() < 0.84 ? 0 : 0.1 + r() * 0.5 * canopyDepth(at, center, radii)), 0, 0.9);
  /** A spray card: twig with leaf pairs, held nearly level, tips drooping. */
  const spray = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tipness: number, size: number) => {
    const face = UP.clone().addScaledVector(outward(at), 0.35).add(V((r() - 0.5) * 0.7, 0, (r() - 0.5) * 0.7)).normalize();
    const s = sway(at) * WOOD_BEND;
    const cell = r() < 0.22 ? 2 : r() < 0.5 ? 1 : 0;
    leafQuad(leaves, at, dir, face, size, size * 0.98, uvCell(2, 2, cell), tint(at, tipness), leafBirth(birth, at), at, { segs: 2, curl: 0.2 + r() * 0.55, center, radii, normalBend: 0.5, sway0: s, sway1: clamp(s + 0.12) });
  };
  /** One leaf on its petiole, hanging a little. */
  const single = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tipness: number) => {
    const face = UP.clone().addScaledVector(outward(at), 0.5).add(V((r() - 0.5) * 1.1, 0, (r() - 0.5) * 1.1)).normalize();
    const s = sway(at) * WOOD_BEND;
    const size = shape.leafSize * 2.25 * (0.8 + r() * 0.4);
    const q = tipness > 0.8 && r() < 0.5 ? 3 : Math.floor(r() * 3);
    leafQuad(leaves, at, dir, face, size, size, singleUV(q), tint(at, tipness), leafBirth(birth, at), at, { segs: 1, center, radii, normalBend: 0.4, sway0: s, sway1: clamp(s + 0.1) });
  };
  const side = (d: THREE.Vector3, sgn: number, fwd: number, drop: number) => {
    const lat = V().crossVectors(d, UP);
    if (lat.lengthSq() < 0.01) lat.set(1, 0, 0);
    lat.normalize().multiplyScalar(sgn);
    return d.clone().multiplyScalar(fwd).addScaledVector(lat, 0.85).add(V(0, drop, 0)).normalize();
  };

  for (const l of limbs) {
    if (l.level < 2) continue;
    const twig = l.level === 4;
    const from = twig ? 0.12 : l.level === 3 ? 0.3 : 0.55;
    const gap = (twig ? 0.06 : l.level === 3 ? 0.082 : 0.13) * k * shape.gap;
    const n = Math.max(1, Math.round((l.length * (1 - from)) / gap));
    for (let i = 0; i < n; i++) {
      const t = lerp(from, 0.97, (i + r() * 0.7) / n);
      const at = limbAt(l, t);
      // The shaded interior of a maple is mostly bare wood.
      if (canopyDepth(at.p, center, radii) < 0.25 + r() * 0.25) continue;
      const sgn = i % 2 ? 1 : -1;
      spray(at.p, side(at.dir, sgn, 0.55, (r() - 0.7) * 0.45), l.birth, t * (twig ? 1 : 0.5), (0.34 + r() * 0.1) * k);
      if (r() < 0.5) single(at.p, side(at.dir, -sgn, 0.3, (r() - 0.8) * 0.6), l.birth, t);
    }
    if (l.level >= 3) {
      const end = limbAt(l, 1);
      const back = limbAt(l, twig ? 0.6 : 0.9);
      spray(back.p, end.dir.clone().add(V(0, -0.12, 0)).normalize(), l.birth, 1, (0.36 + r() * 0.06) * k);
      for (const sgn of [-1, 1]) single(end.p, side(end.dir, sgn, 0.9, -0.25 * r()), l.birth, 1);
    }
  }

  fitBuilders([wood, leaves], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: mapleLeaves(p, shape.lobes),
    bark: { map: mapleBark(p) },
    look: { translucency: 0.42, leafRoughness: 0.78, bend: 0.3, flutter: 0.03 },
  };
}
