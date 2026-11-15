import * as THREE from 'three';
import { GeoBuilder, V, barkTexture, clamp, col, leafPath, leafQuad, leafTexture, lerp, rng, uvCell, type SpeciesBuilder } from '../kit';
import { WOOD_BEND, crownEnvelope, crownTools, emitWood, fitBuilders, growTree, limbAt, normalFromHeight, platePath, rootFlare, tiled } from './shared-trees-a';

/**
 * The catalog's generic "Shade tree" is modeled on Chinese pistache
 * (Pistacia chinensis), the standard Central Valley shade tree: one trunk
 * clear to about head height, ascending scaffold limbs, and a rounded
 * umbrella crown about as wide as tall. Leaves are alternate and pinnately
 * compound, 8 to 10 in long with 10 to 12 narrow lance-shaped leaflets,
 * dark green in summer, gathered toward the shoot ends. Bark is gray-brown
 * and scaly, furrowed into plates that flake off to show salmon-orange
 * inner bark.
 */

const LEAF = { dark: '#1c3814', mid: '#2c501b', light: '#3f6a26', fresh: '#6f9234', rib: 'rgba(170,196,110,0.6)', rachis: '#7d8f45', twig: '#6b5a48' };

/** One compound leaf from (x, y) along `rot`, `len` px long. */
function pinnate(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, len: number, rot: number, shade: number, fresh: number) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const bend = (r() - 0.5) * len * 0.1;
  const at = (t: number): [number, number] => [len * t, bend * 4 * t * (1 - t)];
  g.strokeStyle = LEAF.rachis;
  g.lineWidth = Math.max(1, len * 0.009);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.5, bend * 2, len * 0.9, 0);
  g.stroke();
  const pairs = r() < 0.5 ? 5 : 6;
  for (let i = 0; i < pairs; i++) {
    const f = i / (pairs - 1);
    for (const s of [-1, 1]) {
      const [px, py] = at(0.2 + 0.7 * f + s * 0.012);
      const ll = len * 0.34 * (1 - 0.3 * Math.abs(f - 0.4)) * (0.9 + r() * 0.2);
      g.save();
      g.translate(px, py);
      g.rotate(s * (1.0 - 0.5 * f + (r() - 0.5) * 0.2));
      const grad = g.createLinearGradient(0, 0, ll, 0);
      grad.addColorStop(0, LEAF.dark);
      grad.addColorStop(0.6, LEAF.mid);
      grad.addColorStop(1, LEAF.light);
      g.fillStyle = grad;
      leafPath(g, ll, ll * 0.34, 0.36, 0.95);
      g.fill();
      if (fresh > 0.02) {
        g.globalAlpha = fresh * 0.7;
        g.fillStyle = LEAF.fresh;
        g.fill();
        g.globalAlpha = 1;
      }
      g.fillStyle = shade < 0.5 ? `rgba(0,0,0,${(0.5 - shade) * 0.4})` : `rgba(255,255,220,${(shade - 0.5) * 0.12})`;
      g.fill();
      g.strokeStyle = LEAF.rib;
      g.lineWidth = Math.max(0.7, ll * 0.022);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(ll * 0.9, 0);
      g.stroke();
      g.restore();
    }
  }
  g.restore();
}

/**
 * 1024 atlas, 2 x 2 cells. Cells 0 to 2: a shoot end with six or seven
 * compound leaves. Cell 3: two single compound leaves, each 256 x 512.
 */
function pistacheLeaves(): THREE.Texture {
  return leafTexture('pistache-leaves', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('pistache-tex');
    g.lineCap = 'round';
    for (let cell = 0; cell < 3; cell++) {
      g.save();
      g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      const x0 = S / 2, y0 = S, x1 = S / 2 + (r() - 0.5) * S * 0.05, y1 = S * 0.5;
      g.strokeStyle = LEAF.twig;
      g.lineWidth = S * 0.012;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      const n = cell === 2 ? 9 : 10;
      for (let i = 0; i < n; i++) {
        const t = 0.05 + (i / (n - 1)) * 0.95;
        const s = i % 2 ? 1 : -1;
        const a = -Math.PI / 2 + (i === n - 1 ? (r() - 0.5) * 0.3 : s * (1.15 - t * 0.65 + r() * 0.15));
        pinnate(g, r, lerp(x0, x1, t), lerp(y0, y1, t), S * (0.41 + r() * 0.07), a, 0.2 + r() * 0.8, t > 0.8 ? 0.3 + r() * 0.4 : 0);
      }
      g.restore();
    }
    for (let q = 0; q < 2; q++) {
      g.save();
      g.translate(S + q * 256, S);
      g.beginPath();
      g.rect(0, 0, 256, S);
      g.clip();
      pinnate(g, r, 128, S, S * 0.94, -Math.PI / 2, 0.4 + r() * 0.5, q ? 0.45 : 0);
      g.restore();
    }
  });
}

interface Plate { x: number; y: number; rx: number; ry: number; gone: boolean; tone: number; seed: number }

function barkPlates(S: number): Plate[] {
  const r = rng('pistache-plates');
  const out: Plate[] = [];
  const cols = 9, rows = 5;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      out.push({
        x: ((i + 0.5 + (j % 2) * 0.5 + (r() - 0.5) * 0.8) / cols) * S,
        y: ((j + 0.5 + (r() - 0.5) * 0.9) / rows) * S,
        rx: (S / cols) * (0.36 + r() * 0.16),
        ry: (S / rows) * (0.4 + r() * 0.2),
        gone: r() < 0.1,
        tone: r(),
        seed: Math.floor(r() * 1e6),
      });
    }
  }
  return out;
}

/** Gray-brown scaly plates over dark furrows, with salmon-orange inner bark where plates have flaked off. */
function pistacheBark(): { map: THREE.Texture; normalMap: THREE.Texture } {
  const S = 512;
  const plates = barkPlates(S);
  const map = barkTexture('pistache-bark', S, (g) => {
    const r = rng('pistache-bark');
    g.fillStyle = '#463a30';
    g.fillRect(0, 0, S, S);
    // Orange inner bark glows along the furrows and fills the flaked patches.
    for (const p of plates) {
      tiled(g, S, () => {
        g.fillStyle = p.gone ? (p.tone < 0.5 ? '#9c6844' : '#ab7752') : '#6e4a34';
        g.globalAlpha = p.gone ? 1 : 0.75;
        platePath(g, rng(`pp${p.seed}`), p.x, p.y, p.rx * 1.12, p.ry * 1.08, 0.2);
        g.fill();
      });
    }
    g.globalAlpha = 1;
    for (const p of plates) {
      if (p.gone) continue;
      const base = p.tone < 0.33 ? '#7b7267' : p.tone < 0.66 ? '#8b8276' : '#6c645a';
      tiled(g, S, () => {
        g.fillStyle = base;
        platePath(g, rng(`pq${p.seed}`), p.x, p.y, p.rx, p.ry, 0.2);
        g.fill();
        g.strokeStyle = 'rgba(58,46,38,0.6)';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = 'rgba(176,168,154,0.22)';
        platePath(g, rng(`pr${p.seed}`), p.x, p.y - p.ry * 0.1, p.rx * 0.7, p.ry * 0.75, 0.35);
        g.fill();
      });
    }
    // Flaky grain.
    for (let i = 0; i < 1400; i++) {
      const x = r() * S, y = r() * S, len = 4 + r() * 16, a = 0.08 + r() * 0.16, light = r() < 0.5, dx = (r() - 0.5) * 3;
      tiled(g, S, () => {
        g.globalAlpha = a;
        g.strokeStyle = light ? '#b8b0a2' : '#2a211b';
        g.lineWidth = 0.7 + r() * 1.2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + dx, y + len);
        g.stroke();
      });
    }
    g.globalAlpha = 1;
  });
  const normalMap = normalFromHeight('pistache-bark-n', S, 1.8, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    for (const p of plates) {
      const top = p.gone ? 90 : 255;
      [1, 0.86, 0.7].forEach((k, i) => {
        const v = Math.round(top * (0.45 + i * 0.275));
        tiled(g, S, () => {
          g.fillStyle = `rgb(${v},${v},${v})`;
          platePath(g, rng(`pq${p.seed}`), p.x, p.y, p.rx * k, p.ry * k, 0.2);
          g.fill();
        });
      });
    }
  });
  return { map, normalMap };
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread, R = Sp / 2;
  const r = rng(spec.id);
  const wood = new GeoBuilder();
  const leaves = new GeoBuilder();
  const crownBase = 0.27;

  const env = crownEnvelope({ H, R, base: crownBase, wide: 0.6, baseR: 0.6, pBot: 0.6, pTop: 2.3, lump: 0.07, phase: r() * 6 });
  const r0 = H * 0.019;
  const limbs = growTree(
    r,
    [{ base: V(0, -0.15, 0), dir: V(0.04, 1, -0.03), length: H * 0.66, r0, r1: r0 * 0.28, segs: 7, gnarl: 0.05, up: 0.2 }],
    [
      // Scaffold limbs leave the trunk above head height and sweep up and out.
      { count: [7, 8], from: 0.34, to: 0.9, angle: 0.95, angleVar: 0.15, len: 0.8, lenVar: 0.12, taperAlong: 0.8, radius: 0.62, tip: 0.2, segs: 6, gnarl: 0.3, up: 0.42, out: 0.25, early: 1, limit: [0.97, 1], minKeep: 0.5 },
      { parents: [0, 1], perMeter: 1.5, from: (l) => (l.level === 0 ? 0.72 : 0.22), to: 0.97, angle: 0.85, angleVar: 0.2, len: 0.6, lenVar: 0.25, lenMin: 1.2, taperAlong: 0.7, radius: 0.55, tip: 0.25, segs: 4, gnarl: 0.36, up: 0.12, out: 0.3, early: 0.96, limit: [0.94, 1], minKeep: 0.4 },
      { perMeter: 2.3, from: 0.15, to: 0.97, angle: 0.8, angleVar: 0.2, len: 0.5, lenVar: 0.3, lenMin: 0.6, lenMax: 1.8, taperAlong: 0.7, radius: 0.5, tip: 0.3, tipMin: 0.006, segs: 3, gnarl: 0.4, up: 0.1, out: 0.15, early: 0.92, smooth: false, limit: [0.94, 1.01], minKeep: 0.3 },
      { perMeter: 4, from: 0.12, to: 0.97, angle: 0.75, angleVar: 0.25, len: 0.5, lenVar: 0.35, lenMin: 0.25, lenMax: 0.7, taperAlong: 0.75, radius: 0.5, tip: 0.5, tipMin: 0.0035, segs: 1, gnarl: 0.2, up: 0.1, early: 0.88, smooth: false, limit: [0.95, 1.03] },
    ],
    env,
  );
  rootFlare(limbs[0], 0.6, r0 * 1.5);

  const center = V(0, H * lerp(crownBase, 1, 0.42), 0), radii = V(R, H * (1 - crownBase) * 0.62, R);
  const T = crownTools(r, { H, R, crownBase, center, radii, tInner: col('#93a08c'), tOuter: col('#ffffff'), tNew: col('#f4f7c2') });
  const barkCol = col('#ffffff'), youngCol = col('#b3aa9c'), twigCol = col('#8a7a66');
  emitWood(wood, limbs, {
    tile: 0.75,
    sway: T.sway,
    color: (l) => (l.level >= 4 ? twigCol : l.level === 3 ? youngCol : barkCol),
    sides: (l) => (l.level >= 4 ? 3 : l.level === 3 ? 4 : l.level === 2 ? 6 : l.level === 1 ? 9 : 16),
  });

  /** A shoot end carrying several compound leaves. */
  const shoot = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tipness: number, size: number) => {
    const s = T.sway(at) * WOOD_BEND;
    leafQuad(leaves, at, dir, T.face(at, 0.45, 0.8), size, size, uvCell(2, 2, Math.floor(r() * 3)), T.tint(at, tipness), T.birth(birth, at), at, { segs: 2, curl: 0.3 + r() * 0.6, center, radii, normalBend: 0.5, sway0: s, sway1: clamp(s + 0.12) });
  };
  /** One compound leaf arching out and down. */
  const leaf = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tipness: number) => {
    const s = T.sway(at) * WOOD_BEND;
    const len = 0.24 + r() * 0.08;
    const q = r() < 0.5 ? 0 : 1;
    leafQuad(leaves, at, dir, T.face(at, 0.5, 1.2), len, len * 0.5, [0.5 + q * 0.25, 0, 0.75 + q * 0.25, 0.5], T.tint(at, tipness), T.birth(birth, at), at, { segs: 1, center, radii, normalBend: 0.4, sway0: s, sway1: clamp(s + 0.1) });
  };

  for (const l of limbs) {
    if (l.level < 3) continue;
    const twig = l.level === 4;
    const from = twig ? 0.2 : 0.35;
    const n = Math.max(1, Math.round((l.length * (1 - from)) / (twig ? 0.14 : 0.24)));
    for (let i = 0; i < n; i++) {
      const t = lerp(from, 0.97, (i + r() * 0.7) / n);
      const at = limbAt(l, t);
      if (T.depth(at.p) < 0.3 + r() * 0.25) continue;
      const sgn = i % 2 ? 1 : -1;
      shoot(at.p, T.side(at.dir, sgn, 0.6, (r() - 0.6) * 0.5), l.birth, t * (twig ? 1 : 0.5), 0.56 + r() * 0.16);
      leaf(at.p, T.side(at.dir, -sgn, 0.4, (r() - 0.75) * 0.7), l.birth, t);
      if (r() < 0.6) leaf(at.p, T.side(at.dir, sgn, 0.2, (r() - 0.8) * 0.7), l.birth, t);
    }
    const end = limbAt(l, 1);
    const back = limbAt(l, twig ? 0.55 : 0.9);
    shoot(back.p, end.dir.clone().add(V(0, -0.1, 0)).normalize(), l.birth, 1, 0.62 + r() * 0.12);
    for (let i = 0; i < 4; i++) leaf(end.p, T.side(end.dir, i % 2 ? 1 : -1, 0.3 + r() * 0.9, (r() - 0.6) * 0.6), l.birth, 1);
  }

  fitBuilders([wood, leaves], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    leafMap: pistacheLeaves(),
    bark: pistacheBark(),
    look: { alphaTest: 0.3, translucency: 0.38, leafRoughness: 0.55, bend: 0.3, flutter: 0.028 },
  };
};
