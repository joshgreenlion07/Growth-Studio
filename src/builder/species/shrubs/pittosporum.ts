import * as THREE from 'three';
import { GeoBuilder, V, clamp, col, deflect, lerp, rng, along, type SpeciesBuilder } from '../kit';
import {
  atlas, buildFrame, frameWood, lumps, normalAt, paintSprig, shellSprigs, simpleBark, sprigCard, swayFn, twigBirthLookup,
  type Br, type LeafStyle, type Shape, type SprigStyle,
} from './shared-shrubs-a';

/**
 * Pittosporum tenuifolium 'Silver Sheen': a tall, upright, airy screening
 * shrub. Small wavy-edged silvery light green leaves on thin near-black
 * twigs; the dark stems showing through the pale foliage is the look.
 */

const LEAF: LeafStyle = {
  p: 0.8, q: 0.6, aspect: 0.64, wavy: 0.11,
  base: '#6c8f66', dark: '#4c6e4c', light: '#93b07c',
  midrib: 'rgba(224,236,200,0.75)', midribW: 0.03, gloss: 0.2,
};
const SPRIG: SprigStyle = { twig: '#15110e', twigW: 0.009, leafLen: 0.125, arrangement: 'alternate', nodes: 11, angle: 0.95, side: 4, height: 0.8, petiole: 0.012 };

function sheenAtlas() {
  const S = 341;
  const cells = [];
  for (let i = 0; i < 9; i++) {
    cells.push({
      x: (i % 3) * S, y: Math.floor(i / 3) * S, w: S, h: S,
      draw: (g: CanvasRenderingContext2D, w: number, _h: number, r: () => number) =>
        paintSprig(g, r, w, LEAF, { ...SPRIG, nodes: 10 + Math.floor(r() * 3), side: i < 6 ? 4 : 3 }, i >= 6 ? 0.8 : 0.15 + r() * 0.3, i >= 6 ? 0.1 : (r() - 0.5) * 0.3),
    });
  }
  return atlas('silver-sheen-atlas', 1024, 1024, cells);
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder();
  const at = sheenAtlas();

  // Upright oval: widest a bit below the middle, a rounded top, somewhat narrower at the ground.
  const a = (Sp / 2) * 0.8, top = H * 0.95, sPeak = 0.42, c = V(0, H * 0.45, 0);
  const sh: Shape = {
    c, bound: H + Sp,
    f: (p) => {
      const s = p.y / top;
      if (s >= 1) return 1 + (s - 1) * 20 + Math.hypot(p.x, p.z);
      const prof = s < sPeak ? 0.5 + 0.5 * Math.sin((Math.PI / 2) * clamp(s / sPeak)) : Math.sqrt(Math.max(0, 1 - Math.pow((s - sPeak) / (1 - sPeak), 2.3)));
      return (Math.hypot(p.x, p.z) / (a * Math.max(0.02, prof))) * (1 + 0.07 * (1 + lumps(p, c, 0.6)));
    },
  };

  const frame = buildFrame(r, sh, { H, Sp, stems: 7, stemBaseR: 0.13, stemR: 0.024, stemReach: 0.72, arch: 0.3, stemYMin: 0.4, secs: 220, twigs: 640, twigInset: 0.08, wobble: 0.14, early: 0.9, twigMaxR: 0.0026, attachSpread: 2.5 });
  const sway = swayFn(H, Sp);
  const stemCol = col('#8a8078'), midCol = col('#4a423c'), twigCol = col('#2a2420');
  frameWood(wood, frame, { r, sway, secSides: 3, color: (b) => (b.level === 2 ? twigCol : b.level === 1 ? midCol : stemCol), uvScale: 2 });

  const white = new THREE.Color(1, 1, 1);
  const tint = (p: THREE.Vector3) => {
    const depth = clamp(Math.hypot(p.x, p.z) / (Sp / 2));
    return white.clone().multiplyScalar(lerp(0.7, 1, depth) * lerp(0.82, 1, clamp(p.y / (H * 0.5))) * (0.86 + r() * 0.14));
  };
  const along2 = (b: Br, ts: number[], size: [number, number]) => {
    for (const t of ts) {
      const at2 = along(b.pts, t);
      const n = normalAt(sh, at2.p);
      const dir = deflect(at2.dir, 0.45 + r() * 0.5, r() * 6.2832);
      const face = n.clone().add(V(r() - 0.5, r() - 0.2, r() - 0.5)).normalize();
      const len = lerp(size[0], size[1], r());
      const s = sway(at2.p);
      const birth = r() < 0.8 ? b.birth : clamp(Math.max(b.birth, 0.1) + r() * 0.5, 0, 0.9);
      sprigCard(leaves, at2.p, dir, face, len, len, at.uv[r() < 0.22 ? 6 + Math.floor(r() * 3) : Math.floor(r() * 6)], tint(at2.p), birth, at2.p, n, 0.5, s, clamp(s + 0.15));
    }
  };
  for (const b of frame.twigs) along2(b, [0.2 + r() * 0.15, 0.45 + r() * 0.1, 0.65 + r() * 0.1, 0.85, 1], [0.22, 0.3]);
  for (const b of frame.secs) along2(b, [0.3 + r() * 0.1, 0.5 + r() * 0.1, 0.7 + r() * 0.1, 0.9], [0.22, 0.3]);
  // Extra sprigs through the outer crown for a soft, feathery outline.
  shellSprigs(leaves, r, sh, {
    n: 2600, len: [0.22, 0.3], inset: 0.3, early: 0.8, tangent: 0.4, up: 0.45, nb: 0.5, sway, birth: twigBirthLookup(frame.twigs), yMin: 0.1,
    cell: (_d, p) => at.uv[r() < 0.15 + 0.2 * clamp(p.y / H) ? 6 + Math.floor(r() * 3) : Math.floor(r() * 6)],
    color: (depth, p) => tint(p).multiplyScalar(lerp(1, 0.8, depth)),
  });

  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: at.map,
    bark: { map: simpleBark('silver-sheen-bark', '#6c645c', '#3a332e', '#958c82') },
    look: { leafRoughness: 0.66, translucency: 0.32, bend: 0.1, flutter: 0.018, woodShadows: true },
  };
};
