import * as THREE from 'three';
import { GeoBuilder, UP, V, clamp, col, jitter, leafTexture, lerp, perp, rng, tube, type SpeciesBuilder } from '../kit';
import {
  buildFrame, frameWood, lumps, sampleSurface, simpleBark, sprigCard, swayFn, twigBirthLookup, type Shape, type UV,
} from './shared-shrubs-a';
import { cellClip, hardenAlpha } from './shared-shrubs-b';
import { paintSpray, type GlossLeaf, type SprayStyle } from './shared-glossy';

/**
 * Shiny xylosma, Xylosma congestum (X. congesta), grown as a natural,
 * unsheared shrub.
 *
 * A broad, dense, fountain-like mound: several stems rise from the base and
 * arch outward, and long slender branches spill over the top and sides with
 * drooping tips, the lowest reaching back toward the ground. Leaves 2 to 3 in,
 * ovate with a drawn-out tip and a lightly toothed edge, alternate in flat
 * sprays on zigzag red-brown twigs; glossy, light yellow-green, with new
 * growth flushing coppery bronze-red at every shoot tip. Older vigorous
 * shoots can carry a few spines; the flowers are inconspicuous.
 *
 * References:
 *  - Monrovia, Shiny Xylosma: 10 to 12 ft tall and wide, moderate growth;
 *    small glossy leaves, shiny light green; bronzy young foliage; spreading,
 *    gracefully arching branches; natural or sheared.
 *    https://www.monrovia.com/shiny-xylosma.html
 *  - Devil Mountain Nursery (California wholesale): 8 to 12 ft tall and wide;
 *    pointed oval glossy leaves; new growth bronze, maturing bright green.
 *    https://devilmountainnursery.com/xylosma-congestum
 *  - CSU Stanislaus campus tree map (Turlock, Central Valley): 8 to 12 ft tall
 *    and wide; ovate glossy leaves.
 *    https://www.csustan.edu/campus-tree-story-map/shiny-xylosma-xylosma-congesta
 *  - ASU landscape plant notes: ovate, serrate, acuminate leaves, light green;
 *    new growth reddish bronze to copper; occasional stipular spines.
 *    https://www.asu.edu/lib/camartin/plants/Plant%20html%20files/xylosmacongesta.html
 *  - UC IPM: branches arch or droop; new growth bronze.
 * Catalog: 5 gal at 0.9 x 0.5 m, mature 3.0 m tall x 3.0 m wide (10 ft both
 * ways, the middle of Monrovia, Devil Mountain and CSU Stanislaus) in about
 * 8 years. Left unpruned it can go on to a small tree of 15 ft or more.
 */

const LEAF: GlossLeaf = {
  base: '#467c1a', dark: '#244c0e', fresh: '#8e4420', aspect: 0.56, widest: 0.36, tip: 0.88,
  teeth: 9, toothDepth: 0.05, veins: 5, impressed: 0.18, gloss: 0.36, midrib: 'rgba(205,220,140,0.8)',
};
const SPRAY: SprayStyle = { twig: '#6c3b26', twigW: 0.012, leafLen: 0.3, nodes: 9, angle: 0.9, height: 0.86, zigzag: 0.022, petiole: 0.02, side: 2 };

function xylosmaAtlas(): { map: THREE.Texture; spray: (i: number) => UV } {
  const map = leafTexture('xylosma-leaves', 1024, 768, (g) => {
    const r = rng('xylosma-leaf-tex');
    // 0-5 mature, 6-8 coppery new shoots, 9-10 in shade, 11 half-colored.
    const fresh = [0.04, 0.08, 0.12, 0.05, 0.15, 0.1, 1.05, 0.95, 1.1, 0, 0, 0.6];
    for (let i = 0; i < 12; i++) {
      cellClip(g, i % 4, Math.floor(i / 4), 256, 256);
      const shaded = i === 9 || i === 10;
      paintSpray(g, r, 256, 256, LEAF, { ...SPRAY, nodes: 8 + Math.floor(r() * 3), leafLen: i >= 6 && i <= 8 ? 0.27 : 0.3 }, { fresh: fresh[i], shade: shaded ? -0.5 : (r() - 0.5) * 0.25 });
      g.restore();
    }
    hardenAlpha(g, 1024, 768);
  });
  const e = 1.5 / 1024;
  return {
    map,
    spray: (i) => {
      const cx = i % 4, cy = Math.floor(i / 4);
      return [cx / 4 + e, 1 - (cy + 1) / 3 + e * 1.33, (cx + 1) / 4 - e, 1 - cy / 3 - e * 1.33];
    },
  };
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const at = xylosmaAtlas();

  // Broad dome: widest a little below the middle; below that the skirt of arching branch tips draws in toward the base.
  const a = (Sp / 2) * 0.92, top = H * 0.94, sPeak = 0.36, c = V(0, H * 0.38, 0);
  const sh: Shape = {
    c, bound: H + Sp,
    f: (p) => {
      const s = p.y / top;
      if (s >= 1) return 1 + (s - 1) * 20 + Math.hypot(p.x, p.z);
      const prof = s < sPeak ? 0.7 + 0.3 * Math.sin((Math.PI / 2) * clamp(s / sPeak)) : Math.pow(Math.max(0, 1 - Math.pow((s - sPeak) / (1 - sPeak), 2.3)), 0.55);
      return (Math.hypot(p.x, p.z) / (a * Math.max(0.02, prof))) * (1 + 0.1 * (1 + lumps(p, c, 3.7)));
    },
  };

  const frame = buildFrame(r, sh, { H, Sp, stems: 9, stemBaseR: 0.16, stemR: 0.032, stemReach: 0.66, arch: 0.36, stemYMin: 0.35, secs: 110, twigs: 420, twigInset: 0.12, wobble: 0.12, early: 0.8, twigMaxR: 0.005, attachSpread: 1.5 });
  const sway = swayFn(H, Sp);
  const stemCol = col('#ffffff', 0.5), twigCol = col('#b08068');
  frameWood(wood, frame, { r, sway, twigFrac: 0.35, color: (b) => (b.level === 2 ? twigCol : b.level === 1 ? stemCol.clone().lerp(twigCol, 0.4) : stemCol), uvScale: 2 });

  const white = new THREE.Color(1, 1, 1);
  const birthAt = twigBirthLookup(frame.twigs);
  const tint = (depth: number, p: THREE.Vector3) => jitter(white, r, 0.012, 0.04, 0.05).multiplyScalar(lerp(1, 0.58, depth) * lerp(0.76, 1, clamp(p.y / (H * 0.6))) * (0.88 + r() * 0.14));
  const outer = (p: THREE.Vector3) => clamp(p.y / H) * 0.75 + 0.25;

  // The dense body: flat sprays held up to the light and leaning down the slope of the mound, layer over layer.
  const shell = (n: number, inset: number, len: [number, number], early: number, dark: boolean) => {
    for (const s of sampleSurface(r, sh, n, 0.03, 0.03)) {
      const depth = dark ? 0.4 + 0.6 * r() : Math.pow(r(), 1.7);
      const tip = s.p.clone().addScaledVector(s.n, -depth * inset);
      const ta = perp(s.n), tb = V().crossVectors(s.n, ta);
      const az = r() * 6.2832;
      const tan = ta.multiplyScalar(Math.cos(az)).addScaledVector(tb, Math.sin(az));
      // Lean outward and down the slope of the mound, so the sprays shingle like a cascade.
      const down = V(s.n.x, 0, s.n.z).normalize().multiplyScalar(0.5).add(V(0, -0.35, 0));
      const dir = s.n.clone().multiplyScalar(0.35).addScaledVector(tan, 0.55).add(s.n.y < 0.85 ? down : V()).normalize();
      const L = lerp(len[0], len[1], r());
      const base = tip.clone().addScaledVector(dir, -L * 0.8);
      if (base.y < 0.01) base.y = 0.01;
      const face = s.n.clone().multiplyScalar(0.7).add(V((r() - 0.5) * 0.6, 0.45, (r() - 0.5) * 0.6)).normalize();
      // Low foliage is there from the start: a nursery plant is leafy to the soil line.
      const b0 = tip.y < H * 0.25 && r() < 0.7 ? 0 : birthAt(tip);
      const birth = r() < early ? b0 : clamp(Math.max(b0, 0.1) + r() * 0.5, 0, 0.9);
      const sw = sway(base);
      const copper = !dark && depth < 0.35 && r() < 0.26 * outer(tip);
      const cell = dark || depth > 0.65 ? 9 + Math.floor(r() * 2) : copper ? 6 + Math.floor(r() * 3) : r() < 0.1 ? 11 : Math.floor(r() * 6);
      sprigCard(leaves, base, dir, face, L, L, at.spray(cell), dark ? white.clone().multiplyScalar(lerp(0.66, 0.4, depth)) : tint(depth, tip), birth, base, s.n, 0.5, sw, clamp(sw + 0.14), dark ? 0 : 0.35 + r() * 0.4);
    }
  };
  shell(2500, 0.24, [0.2, 0.27], 0.72, false);
  shell(500, Sp * 0.22, [0.24, 0.3], 1, true);

  // Long arching branches spilling over the mound: leafy wands that rise out of the bush, bend over and
  // hang their tips, each ending in a coppery new shoot.
  const archC = col('#d8a888');
  for (const s of sampleSurface(r, sh, 75, H * 0.3, 0.2)) {
    const p0 = s.p.clone().addScaledVector(s.n, -0.24);
    const outH = V(s.n.x, 0, s.n.z);
    if (outH.lengthSq() < 1e-4) outH.set(r() - 0.5, 0, r() - 0.5);
    outH.normalize();
    const L = 0.36 + r() * 0.36;
    const p1 = p0.clone().addScaledVector(s.n, L * 0.45).add(V(0, L * 0.24, 0));
    const p2 = p1.clone().addScaledVector(outH, L * 0.5).add(V(0, -L * (0.45 + r() * 0.25), 0));
    if (p2.y < 0.05) p2.y = 0.05;
    const N = 8;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      pts.push(V().addScaledVector(p0, u * u).addScaledVector(p1, 2 * u * t).addScaledVector(p2, t * t));
    }
    const b0 = clamp(birthAt(p0) + 0.15 + r() * 0.35, 0, 0.85);
    const sw = (i: number) => clamp(sway(pts[Math.min(N, i)]) + i * 0.03);
    tube(wood, pts, 0.004, 0.0014, 3, archC, b0, p0, sw, 2);
    // Sprays in pairs along the outer part of the arch, held flat and facing up, then the drooping tip.
    for (let i = 1; i <= N; i++) {
      const q = pts[i];
      const d = (i < N ? pts[i + 1].clone().sub(pts[i]) : pts[N].clone().sub(pts[N - 1])).normalize();
      const sideV = V().crossVectors(d, UP);
      if (sideV.lengthSq() < 1e-4) sideV.copy(perp(d));
      sideV.normalize();
      // Tilted toward the outside, so the sprays still read from the side instead of as edge-on slivers.
      const face = UP.clone().multiplyScalar(0.3).addScaledVector(s.n, 0.85).add(V((r() - 0.5) * 0.6, (r() - 0.5) * 0.3, (r() - 0.5) * 0.6)).normalize();
      const lit = white.clone().multiplyScalar((0.8 + r() * 0.12) * lerp(0.78, 1, clamp(q.y / H)));
      const sides = i === N ? [0] : [-1, 1];
      for (const sd of sides) {
        const dir = sd === 0 ? d.clone() : d.clone().multiplyScalar(0.55).addScaledVector(sideV, 0.8 * sd).add(V(0, -0.12, 0)).normalize();
        const tipish = i >= N - 1;
        const len = tipish ? 0.18 + r() * 0.05 : 0.19 + r() * 0.06;
        const cell = tipish && (sd === 0 || r() < 0.5) ? 6 + Math.floor(r() * 3) : i >= N - 3 && r() < 0.3 ? 11 : Math.floor(r() * 6);
        sprigCard(leaves, q, dir, face, len, len, at.spray(cell), lit, clamp(b0 + i * 0.008), q, s.n, 0.5, sw(i), clamp(sw(i) + 0.15), sd === 0 ? 0.5 : 0.3);
      }
    }
  }

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: at.map,
    bark: { map: simpleBark('xylosma-bark', '#7a6e62', '#4e443a', '#9c9284') },
    look: { leafRoughness: 0.64, translucency: 0.26, bend: 0.09, flutter: 0.012 },
  };
};
