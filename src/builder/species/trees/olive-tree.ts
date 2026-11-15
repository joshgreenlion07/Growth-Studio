import * as THREE from 'three';
import {
  GeoBuilder, UP, V, along, barkTexture, canopyDepth, clamp, col, growSkeleton, growStem, leafPath, leafQuad, leafTexture, lerp, rng, tube,
  type Branch, type SpeciesBuilder, type StemSpec,
} from '../kit';
import { ancestor, fitToSize, speckle, tubeVar } from './shared-trees-b';

/**
 * Fruitless olive, Olea europaea 'Swan Hill'. Three gnarled gray trunks from
 * a low fluted bole, an open billowing crown, and narrow opposite leaves:
 * gray-green above, silver-white beneath.
 */


function oliveLeaf(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, wid: number, silver: boolean, shade: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const gr = g.createLinearGradient(0, -wid / 2, 0, wid / 2);
  if (silver) {
    gr.addColorStop(0, '#a9b39c');
    gr.addColorStop(0.5, '#98a38b');
    gr.addColorStop(1, '#b4bda8');
  } else {
    gr.addColorStop(0, '#586a45');
    gr.addColorStop(0.48, '#485938');
    gr.addColorStop(0.52, '#52633d');
    gr.addColorStop(1, '#63744e');
  }
  g.fillStyle = gr;
  leafPath(g, len, wid, 0.55, 0.85);
  g.fill();
  g.fillStyle = shade < 0.5 ? `rgba(20,28,14,${(0.5 - shade) * 0.5})` : `rgba(170,184,140,${(shade - 0.5) * 0.25})`;
  g.fill();
  g.strokeStyle = silver ? 'rgba(120,132,104,0.7)' : 'rgba(124,140,98,0.7)';
  g.lineWidth = Math.max(1, wid * 0.1);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.93, 0);
  g.stroke();
  g.restore();
}

/** One shoot with opposite leaf pairs, from (x0, y0) heading `ang`, `len` px long. */
function oliveShoot(g: CanvasRenderingContext2D, r: () => number, x0: number, y0: number, ang: number, len: number, nodes: number, leafLen: number, silverChance: number, fresh: boolean) {
  const bend = (r() - 0.5) * 0.35;
  const pt = (t: number) => {
    const a = ang + bend * t;
    return { x: x0 + Math.cos(a) * len * t, y: y0 + Math.sin(a) * len * t, a: ang + bend * t * 2 };
  };
  g.strokeStyle = fresh ? '#7f8a68' : '#77776a';
  g.lineCap = 'round';
  g.lineWidth = fresh ? 3 : 4;
  g.beginPath();
  g.moveTo(x0, y0);
  for (let i = 1; i <= 8; i++) { const q = pt(i / 8); g.lineTo(q.x, q.y); }
  g.stroke();
  for (let n = 0; n < nodes; n++) {
    const t = 0.06 + (n / nodes) * 0.92;
    const q = pt(t);
    // Pairs alternate at right angles (decussate): every other pair is seen foreshortened.
    const fore = n % 2 ? 0.62 + r() * 0.15 : 1;
    const size = leafLen * lerp(1, 0.6, Math.pow(t, 2.2)) * (0.85 + r() * 0.3);
    for (const s of [-1, 1]) {
      const a = q.a + s * (0.55 + r() * 0.45) * (n % 2 ? 0.7 : 1);
      const silver = r() < silverChance;
      oliveLeaf(g, q.x, q.y, a, size * fore, size * (0.2 + r() * 0.05) * (n % 2 ? 1.15 : 1), silver, fresh ? 0.75 + r() * 0.25 : r());
    }
  }
  const e = pt(1);
  oliveLeaf(g, e.x, e.y, e.a + (r() - 0.5) * 0.4, leafLen * 0.55, leafLen * 0.1, r() < silverChance, 0.8);
  oliveLeaf(g, e.x, e.y, e.a + 0.35, leafLen * 0.45, leafLen * 0.09, r() < 0.5, 0.9);
}

/** Atlas: top row four single shoots (256 x 512 each), bottom row two wide sprays (512 x 512 each). */
const SHOOT_UV = (i: number): [number, number, number, number] => [i / 4, 0.5, (i + 1) / 4, 1];
const SPRAY_UV = (i: number): [number, number, number, number] => [i / 2, 0, (i + 1) / 2, 0.5];

function oliveLeaves(): THREE.Texture {
  return leafTexture('olive-swan-hill', 1024, 1024, (g) => {
    const r = rng('olive-tex');
    const up = -Math.PI / 2;
    for (let cell = 0; cell < 4; cell++) {
      g.save();
      g.translate(cell * 256, 0);
      g.beginPath();
      g.rect(0, 0, 256, 512);
      g.clip();
      oliveShoot(g, r, 128, 510, up, 420, 13, 98, [0.06, 0.16, 0.38, 0.14][cell], cell === 3);
      g.restore();
    }
    for (let cell = 0; cell < 2; cell++) {
      g.save();
      g.translate(cell * 512, 512);
      g.beginPath();
      g.rect(0, 0, 512, 512);
      g.clip();
      // A fan of shoots off one twig; back ones first.
      const fan = cell === 0 ? [-0.62, 0.58, -0.3, 0.27, 0] : [0.7, -0.5, 0.36, -0.16, 0.08];
      fan.forEach((a) => {
        oliveShoot(g, r, 256, 508, up + a, 505 * (0.74 + 0.26 * Math.cos(a * 1.6)) * (0.88 + r() * 0.12), 13, 72, cell === 0 ? 0.08 : 0.2, false);
      });
      g.restore();
    }
  });
}

function oliveBark(): THREE.Texture {
  return barkTexture('olive-bark', 512, (g, S) => {
    const r = rng('olive-bark');
    g.fillStyle = '#69655e';
    g.fillRect(0, 0, S, S);
    speckle(g, r, 0, 0, S, S, 2600, ['rgba(160,156,146,0.25)', 'rgba(70,64,56,0.22)', 'rgba(126,112,92,0.25)', 'rgba(150,156,138,0.2)'], 3, 16);
    // Raised plates between deep, wandering fissures.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 150; i++) {
        let x = r() * S, y = r() * S;
        const len = 40 + r() * 170;
        g.strokeStyle = pass === 0 ? `rgba(34,30,26,${0.45 + r() * 0.4})` : `rgba(186,182,170,${0.18 + r() * 0.22})`;
        g.lineWidth = pass === 0 ? 1.5 + r() * 4 : 1 + r() * 2.5;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < len; k += 8) {
          x += (r() - 0.5) * 7;
          y += 8;
          g.lineTo(x, y);
          if (y > S) { g.stroke(); g.beginPath(); y -= S; g.moveTo(x, y); }
        }
        g.stroke();
      }
    }
    // Short cross cracks.
    for (let i = 0; i < 260; i++) {
      const x = r() * S, y = r() * S;
      g.strokeStyle = `rgba(40,35,30,${0.2 + r() * 0.3})`;
      g.lineWidth = 0.8 + r() * 1.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 5 + r() * 16, y + (r() - 0.5) * 6);
      g.stroke();
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder();
  const leaves = new GeoBuilder();

  // Crown envelope: broad and rounded, about as wide as tall, starting about 2 m up.
  const center = V(0, H * 0.635, 0), radii = V(Sp / 2, H * 0.365, Sp / 2);
  const sway = (q: THREE.Vector3) => clamp(Math.pow(Math.max(0, q.y) / H, 1.6) * 0.7 + (Math.hypot(q.x, q.z) / (Sp / 2)) * 0.35);
  const white = col('#ffffff'), young = col('#e6ead6');

  // Three gnarled trunks leaning apart from a low bole.
  const trunkAz = [0, 1, 2].map((i) => (i / 3) * Math.PI * 2 + 0.5 + (r() - 0.5) * 0.4);
  const trunks = trunkAz.map((az, i) => {
    const lean = 0.42 + i * 0.05 + r() * 0.08;
    return growStem(r, {
      base: V(Math.cos(az) * 0.17, 0.2, Math.sin(az) * 0.17), dir: V(Math.cos(az) * Math.sin(lean), Math.cos(lean), Math.sin(az) * Math.sin(lean)),
      length: 2.25 - i * 0.12, radius: 0.16, segs: 9, gnarl: 0.5, gravity: -0.12,
    });
  });
  const trunkR = (i: number, t: number) => lerp(0.16 - i * 0.012, 0.1 - i * 0.008, t);

  // Scaffold limbs: aimed at points spread evenly around the crown, so it fills out on every side.
  const scaffolds: StemSpec[] = [];
  trunks.forEach((pts, i) => {
    for (let k = 0; k < 4; k++) {
      const top = k === 3;
      const az = trunkAz[i] + (top ? 0.5 : (k - 1) * 0.7) + (r() - 0.5) * 0.3;
      const reach = top ? 0.16 + r() * 0.1 : 0.5 + r() * 0.12;
      const target = V(Math.cos(az) * radii.x * reach, center.y + radii.y * (top ? 0.45 : -0.2 + r() * 0.35), Math.sin(az) * radii.z * reach);
      const t = top ? 1 : 0.62 + k * 0.14 + r() * 0.06;
      const base = along(pts, Math.min(1, t)).p;
      const d = target.clone().sub(base);
      scaffolds.push({ base, dir: d.clone().normalize(), length: d.length(), radius: trunkR(i, t) * (top ? 0.8 : 0.62), taper: 0.35, segs: 6, gnarl: 0.34, gravity: -0.08 });
    }
  });
  const sk = growSkeleton(r, scaffolds, [
    { count: [5, 6], from: 0.2, to: 1, angle: 0.95, angleVar: 0.3, length: 0.62, taperAlong: 0.8, radius: 0.6, taper: 0.4, segs: 5, gnarl: 0.4, gravity: 0.05, flatten: 0.25, early: 0.94 },
    { count: [5, 6], from: 0.15, to: 1, angle: 0.9, angleVar: 0.3, length: 0.55, taperAlong: 0.8, radius: 0.6, taper: 0.45, segs: 3, gnarl: 0.36, gravity: 0.22, early: 0.88 },
    { count: [4, 5], from: 0.12, to: 1, angle: 0.8, angleVar: 0.3, length: 0.6, taperAlong: 0.8, radius: 0.65, taper: 0.5, segs: 2, gnarl: 0.3, gravity: 0.4, early: 0.86 },
  ]);
  // Keep every limb inside the rounded envelope.
  const er = V(radii.x - 0.3, radii.y - 0.25, radii.z - 0.3);
  for (const b of sk.branches) {
    for (let i = b.level === 0 ? 1 : 0; i < b.pts.length; i++) {
      const p = b.pts[i];
      const d = Math.hypot((p.x - center.x) / er.x, (p.y - center.y) / er.y, (p.z - center.z) / er.z);
      if (d > 1) p.sub(center).multiplyScalar(1 / d).add(center);
    }
  }

  // The low fluted bole the trunks rise from, with a root flare.
  const bolePts = [-0.2, -0.05, 0.08, 0.22, 0.36, 0.5].map((y) => V(0, y, 0));
  const boleR = [0.5, 0.46, 0.37, 0.31, 0.27, 0.2];
  tubeVar(wood, bolePts, (i) => boleR[i], 18, () => white, 0, V(), () => 0, {
    uScale: 3, cap: true, twist: 0.12,
    lump: (th, i) => 1 + (0.2 - i * 0.02) * Math.sin(th * 5 + 0.7) + 0.08 * Math.sin(th * 9 + i),
  });
  // Trunks: thick, flared into the bole, fluted and slowly twisting.
  trunks.forEach((pts, bi) => {
    const n = pts.length;
    tubeVar(wood, pts, (i) => trunkR(bi, i / (n - 1)) * (1 + 0.45 * Math.exp(-i * 0.9)), 12, () => white, 0, pts[0], (i) => sway(pts[i]), {
      uScale: 2, twist: 0.35, cap: true,
      lump: (th, i) => 1 + 0.13 * Math.sin(th * 3 + bi * 2 + i * 0.3) + 0.06 * Math.sin(th * 7 + i * 1.3),
    });
  });
  // Limbs and branches. The finest twigs are painted on the leaf cards, not built.
  for (const b of sk.branches) {
    if (b.level === 3) continue;
    if (b.level === 2) {
      const pts = [b.pts[0], b.pts[1], b.pts[b.pts.length - 1]];
      tube(wood, pts, Math.max(0.006, b.r0), 0.003, 3, young, b.birth, pts[0], (i) => sway(pts[i]), 1);
    } else {
      tube(wood, b.pts, Math.max(0.008, b.r0), Math.max(0.005, b.r1), b.level === 0 ? 9 : 5, white, b.birth, b.pts[0], (i) => sway(b.pts[i]), b.level === 0 ? 2 : 1);
    }
  }

  // Foliage: shoots of opposite leaves along the twigs, shaded as billowing clumps.
  const clumpOf = new Map<Branch, THREE.Vector3>();
  const clump = (b: Branch) => {
    const a = ancestor(sk.branches, b, 1);
    let c = clumpOf.get(a);
    if (!c) {
      c = along(a.pts, 0.7).p;
      clumpOf.set(a, c);
    }
    return c;
  };
  const unit = V(1, 1, 1);
  const card = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, spray: boolean, tip: boolean, cc: THREE.Vector3) => {
    const depth = canopyDepth(at, center, radii);
    const local = clamp(at.distanceTo(cc) / 1.1);
    const d = clamp(0.5 * depth + 0.5 * local);
    const shade = lerp(0.4, 0.92, Math.pow(d, 1.5)) * lerp(0.8, 1, clamp((at.y - H * 0.3) / (H * 0.5))) * (0.9 + r() * 0.18);
    const c = new THREE.Color(shade, shade, shade * (0.95 + r() * 0.08));
    const face = V((r() - 0.5) * 1.3, 1, (r() - 0.5) * 1.3).normalize();
    const s = sway(at);
    const nc = center.clone().lerp(cc, 0.65);
    const size = spray ? 0.46 + r() * 0.16 : 0.32 + r() * 0.12;
    const uv = spray ? SPRAY_UV(r() < 0.65 ? 0 : 1) : SHOOT_UV(tip && r() < 0.5 ? 3 : r() < 0.6 ? 0 : r() < 0.85 ? 1 : 2);
    leafQuad(leaves, at, dir, face, size, spray ? size : size * 0.5, uv, c, birth, at, {
      segs: 2, curl: (r() - 0.2) * 0.7, center: nc, radii: unit, normalBend: 0.6, sway0: s, sway1: clamp(s + 0.22),
    });
  };
  for (const b of sk.branches) {
    if (b.level < 2) continue;
    const twig = b.level === 3;
    const cc = clump(b);
    const n = Math.max(2, Math.round(b.length / (twig ? 0.07 : 0.1)));
    for (let k = 0; k < n; k++) {
      const t = lerp(twig ? 0 : 0.2, 1, (k + r() * 0.7) / n);
      const at = along(b.pts, t);
      const lateral = V().crossVectors(at.dir, UP);
      if (lateral.lengthSq() < 0.01) lateral.set(1, 0, 0);
      lateral.normalize().multiplyScalar(k % 2 ? 1 : -1);
      const out = at.p.clone().sub(center).normalize();
      const dir = at.dir.clone().multiplyScalar(twig ? 0.9 : 0.7).addScaledVector(lateral, twig ? 0.45 : 0.6).addScaledVector(out, 0.35).add(V(0, (r() - 0.4) * 0.7, 0)).normalize();
      card(at.p, dir, clamp(b.birth + r() * 0.1, 0, 0.9), r() < 0.75, false, cc);
    }
    if (twig) {
      const end = along(b.pts, 1);
      card(end.p, end.dir.clone().add(V(0, (r() - 0.6) * 0.5, 0)).normalize(), clamp(b.birth + 0.04, 0, 0.9), r() < 0.35, true, cc);
    }
  }

  fitToSize([wood, leaves], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: oliveLeaves(),
    bark: { map: oliveBark() },
    look: { translucency: 0.1, leafRoughness: 0.88, bend: 0.2, flutter: 0.02, alphaTest: 0.38 },
  };
};
