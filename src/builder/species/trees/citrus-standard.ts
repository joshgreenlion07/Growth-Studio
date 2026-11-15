import * as THREE from 'three';
import {
  GeoBuilder, UP, V, along, barkTexture, canopyDepth, clamp, col, fitSkeleton, growSkeleton, leafPath, leafQuad, leafTexture, lerp, rng, tube, uvCell,
  type SpeciesBuilder,
} from '../kit';
import { ball, fitToSize, speckle, tubeVar } from './shared-trees-b';

/**
 * Patio citrus trained as a standard (sweet orange, Citrus sinensis type):
 * one clean straight trunk, a dense round head of glossy dark green oval
 * leaves with lighter new growth, ripe oranges hanging in the canopy and a
 * few white blossoms.
 */

function citrusLeaf(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, fresh: boolean, shade: number) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const wid = len * 0.5;
  // Short winged petiole.
  g.strokeStyle = fresh ? '#7da045' : '#4f7030';
  g.lineWidth = len * 0.035;
  g.beginPath();
  g.moveTo(-len * 0.1, 0);
  g.lineTo(0, 0);
  g.stroke();
  const gr = g.createLinearGradient(0, -wid / 2, 0, wid / 2);
  if (fresh) {
    gr.addColorStop(0, '#86ab45');
    gr.addColorStop(0.5, '#6d9838');
    gr.addColorStop(1, '#93b64f');
  } else {
    gr.addColorStop(0, '#34602a');
    gr.addColorStop(0.47, '#234a1c');
    gr.addColorStop(0.53, '#2b5524');
    gr.addColorStop(1, '#264c1e');
  }
  g.fillStyle = gr;
  leafPath(g, len, wid, 0.42, 0.7);
  g.fill();
  g.fillStyle = shade < 0.5 ? `rgba(8,20,6,${(0.5 - shade) * 0.5})` : `rgba(190,220,140,${(shade - 0.5) * 0.22})`;
  g.fill();
  // Gloss: a soft pale streak on one half.
  g.save();
  leafPath(g, len, wid, 0.42, 0.7);
  g.clip();
  const gl = g.createLinearGradient(0, -wid * 0.42, 0, -wid * 0.05);
  gl.addColorStop(0, 'rgba(220,240,200,0)');
  gl.addColorStop(0.5, `rgba(220,240,200,${fresh ? 0.16 : 0.2})`);
  gl.addColorStop(1, 'rgba(220,240,200,0)');
  g.fillStyle = gl;
  g.fillRect(len * 0.1, -wid / 2, len * 0.75, wid / 2);
  g.restore();
  // Midrib and side veins.
  g.strokeStyle = fresh ? 'rgba(196,220,130,0.9)' : 'rgba(140,176,92,0.85)';
  g.lineWidth = Math.max(1.2, len * 0.02);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(len * 0.96, 0);
  g.stroke();
  g.strokeStyle = fresh ? 'rgba(196,220,130,0.4)' : 'rgba(120,160,84,0.38)';
  g.lineWidth = Math.max(0.8, len * 0.008);
  g.beginPath();
  for (let i = 1; i <= 8; i++) {
    const t = i / 9.5, px = len * t;
    const reach = wid * 0.42 * Math.sin(Math.PI * Math.pow(t, 0.75));
    for (const s of [-1, 1]) {
      g.moveTo(px, 0);
      g.quadraticCurveTo(px + len * 0.06, s * reach * 0.6, px + len * 0.11, s * reach);
    }
  }
  g.stroke();
  g.restore();
}

/** A shoot with alternate leaves, base at (x0, y0), heading up. */
function citrusShoot(g: CanvasRenderingContext2D, r: () => number, x0: number, y0: number, ang: number, len: number, n: number, leafLen: number, fresh: boolean) {
  const bend = (r() - 0.5) * 0.3;
  const pt = (t: number) => {
    const a = ang + bend * t;
    return { x: x0 + Math.cos(a) * len * t, y: y0 + Math.sin(a) * len * t, a: ang + bend * t * 2 };
  };
  g.strokeStyle = fresh ? '#6f9440' : '#4c6a34';
  g.lineCap = 'round';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(x0, y0);
  for (let i = 1; i <= 8; i++) { const q = pt(i / 8); g.lineTo(q.x, q.y); }
  g.stroke();
  for (let k = 0; k < n; k++) {
    const t = 0.1 + (k / n) * 0.86;
    const q = pt(t);
    const s = k % 2 ? 1 : -1;
    const a = q.a + s * (0.6 + r() * 0.5);
    citrusLeaf(g, q.x + Math.cos(a) * leafLen * 0.1, q.y + Math.sin(a) * leafLen * 0.1, a, leafLen * (0.78 + r() * 0.34) * lerp(1, 0.75, t * t), fresh || (t > 0.85 && r() < 0.25), r());
  }
  const e = pt(1);
  citrusLeaf(g, e.x, e.y, e.a + (r() - 0.5) * 0.4, leafLen * 0.8, fresh || r() < 0.4, 0.7);
}

function citrusLeaves(): THREE.Texture {
  return leafTexture('citrus-standard', 1024, 1024, (g) => {
    const r = rng('citrus-tex');
    const S = 512, up = -Math.PI / 2;
    for (let cell = 0; cell < 4; cell++) {
      g.save();
      g.translate((cell % 2) * S, Math.floor(cell / 2) * S);
      g.beginPath();
      g.rect(0, 0, S, S);
      g.clip();
      if (cell < 2) {
        citrusShoot(g, r, S / 2, S - 4, up - 0.42, S * 0.52, 5, 150, false);
        citrusShoot(g, r, S / 2, S - 4, up + 0.45, S * 0.5, 5, 150, false);
        citrusShoot(g, r, S / 2, S - 4, up, S * 0.66, 7, 158, false);
      } else if (cell === 2) {
        citrusShoot(g, r, S / 2, S - 4, up + 0.3, S * 0.5, 5, 150, false);
        citrusShoot(g, r, S / 2, S - 4, up - 0.1, S * 0.66, 7, 150, true);
      } else {
        citrusShoot(g, r, S / 2, S - 4, up, S * 0.64, 7, 165, false);
      }
      g.restore();
    }
  });
}

/** Fruit and blossom atlas, 2 x 2: orange peel, blossom, blossom cluster, green calyx star. */
function citrusFruit(): THREE.Texture {
  return leafTexture('citrus-fruit', 512, 512, (g) => {
    const r = rng('citrus-fruit');
    const S = 256;
    g.fillStyle = '#ea7a12';
    g.fillRect(0, 0, S, S);
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, 'rgba(250,160,50,0.3)');
    gr.addColorStop(1, 'rgba(200,84,10,0.45)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    speckle(g, r, 0, 0, S, S, 1500, ['rgba(198,98,18,0.3)', 'rgba(255,196,110,0.28)'], 1.5, 4);
    const flower = (cx: number, cy: number, rad: number) => {
      for (let k = 0; k < 5; k++) {
        g.save();
        g.translate(cx, cy);
        g.rotate((k / 5) * Math.PI * 2 + 0.3);
        const pg = g.createLinearGradient(0, 0, rad, 0);
        pg.addColorStop(0, '#ece8d2');
        pg.addColorStop(1, '#ffffff');
        g.fillStyle = pg;
        leafPath(g, rad, rad * 0.46, 0.55, 0.3);
        g.fill();
        g.restore();
      }
      g.fillStyle = '#e6c04a';
      g.beginPath();
      g.arc(cx, cy, rad * 0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c99a2c';
      for (let k = 0; k < 10; k++) g.fillRect(cx + Math.cos(k) * rad * 0.2 - 1.5, cy + Math.sin(k) * rad * 0.2 - 1.5, 3, 3);
    };
    flower(S + S / 2, S / 2, S * 0.46);
    flower(S * 0.3, S + S * 0.36, S * 0.27);
    flower(S * 0.7, S + S * 0.42, S * 0.25);
    flower(S * 0.46, S + S * 0.74, S * 0.24);
    // Calyx star.
    g.fillStyle = '#5d7a34';
    for (let k = 0; k < 5; k++) {
      g.save();
      g.translate(S * 1.5, S * 1.5);
      g.rotate((k / 5) * Math.PI * 2);
      leafPath(g, S * 0.4, S * 0.26, 0.35, 0.8);
      g.fill();
      g.restore();
    }
  });
}

function citrusBark(): THREE.Texture {
  return barkTexture('citrus-bark', 256, (g, S) => {
    const r = rng('citrus-bark');
    g.fillStyle = '#726b5c';
    g.fillRect(0, 0, S, S);
    speckle(g, r, 0, 0, S, S, 900, ['rgba(170,166,150,0.25)', 'rgba(90,82,66,0.2)', 'rgba(110,120,90,0.2)'], 3, 12);
    for (let i = 0; i < 380; i++) {
      const x = r() * S, y = r() * S;
      g.strokeStyle = r() < 0.55 ? `rgba(62,54,42,${0.12 + r() * 0.2})` : `rgba(196,190,172,${0.1 + r() * 0.16})`;
      g.lineWidth = 0.6 + r() * 1.4;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y + 14 + r() * 50);
      g.stroke();
    }
  });
}

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), fruit = new GeoBuilder();

  const trunkH = H * 0.4;
  const headC = V(0, H * 0.68, 0), headR = V(Sp / 2, H * 0.32, Sp / 2);
  // Scaffolds fan out from the top of the trunk and fill a ball.
  const sk = growSkeleton(
    r,
    [0, 1, 2, 3, 4, 5].map((i) => {
      const az = (i / 5) * Math.PI * 2 + r() * 0.5;
      const lean = i === 5 ? 0.08 : 0.75 + r() * 0.3;
      return {
        base: V(0, trunkH - 0.06 - (i % 3) * 0.05, 0), dir: V(Math.cos(az) * Math.sin(lean), Math.cos(lean), Math.sin(az) * Math.sin(lean)),
        length: H * (i === 5 ? 0.27 : 0.34), radius: 0.026, taper: 0.35, segs: 5, gnarl: 0.25, gravity: -0.35,
      };
    }),
    [
      { count: [4, 5], from: 0.2, to: 1, angle: 0.8, angleVar: 0.3, length: 0.7, taperAlong: 0.75, radius: 0.6, taper: 0.4, segs: 4, gnarl: 0.35, gravity: -0.05, early: 0.95 },
      { count: [4, 5], from: 0.15, to: 1, angle: 0.85, angleVar: 0.3, length: 0.62, taperAlong: 0.8, radius: 0.6, taper: 0.45, segs: 3, gnarl: 0.35, gravity: 0.05, early: 0.9 },
      { count: [4, 5], from: 0.15, to: 1, angle: 0.8, angleVar: 0.3, length: 0.65, taperAlong: 0.8, radius: 0.65, taper: 0.5, segs: 2, gnarl: 0.3, gravity: 0.1, early: 0.85 },
    ],
  );
  fitSkeleton(sk, H, Sp, 0.16);
  // Keep the head a tidy ball: pull strays in, and keep the trunk clean below it.
  const er = V(headR.x - 0.14, headR.y - 0.12, headR.z - 0.14);
  for (const b of sk.branches) {
    for (let i = b.level === 0 ? 1 : 0; i < b.pts.length; i++) {
      const p = b.pts[i];
      const d = Math.hypot((p.x - headC.x) / er.x, (p.y - headC.y) / er.y, (p.z - headC.z) / er.z);
      if (d > 1) p.sub(headC).multiplyScalar(1 / d).add(headC);
    }
  }

  const sway = (q: THREE.Vector3) => clamp(Math.pow(Math.max(0, q.y) / H, 1.5) * 0.75 + (Math.hypot(q.x, q.z) / (Sp / 2)) * 0.25);
  const white = col('#ffffff'), green = col('#93b070');

  // One straight clean trunk with a slight flare and a graft swelling.
  const top = sk.branches[0].pts[0].y + 0.1;
  const tp = [-0.12, 0, 0.06, 0.16, 0.24, 0.4, 0.6, 0.8, 1].map((t) => V(Math.sin(t * 5) * 0.012, t <= 0 ? t : t * top, Math.cos(t * 4) * 0.01));
  const tr = [1.7, 1.5, 1.22, 1.18, 1.05, 1, 0.96, 0.95, 0.8];
  tubeVar(wood, tp, (i) => 0.047 * tr[i], 12, () => white, 0, V(), (i) => sway(tp[i]), { uScale: 1, cap: true });
  for (const b of sk.branches) {
    const c = b.level >= 3 ? green : b.level === 2 ? white.clone().lerp(green, 0.6) : white;
    const sides = b.level === 0 ? 8 : b.level === 1 ? 5 : b.level === 2 ? 4 : 3;
    tube(wood, b.pts, Math.max(0.004, b.r0), Math.max(0.0025, b.r1), sides, c, b.birth, b.pts[0], (i) => sway(b.pts[i]), 1);
  }

  const card = (at: THREE.Vector3, dir: THREE.Vector3, birth: number, tip: boolean) => {
    const depth = canopyDepth(at, headC, headR);
    const shade = lerp(0.4, 1.05, Math.pow(depth, 2)) * lerp(0.78, 1, clamp((at.y - (headC.y - headR.y)) / (headR.y * 1.4))) * (0.9 + r() * 0.2);
    const c = new THREE.Color(shade * (0.95 + r() * 0.1), shade, shade * (0.92 + r() * 0.1));
    const face = V((r() - 0.5) * 1.2, 1, (r() - 0.5) * 1.2).normalize();
    const cell = tip && depth > 0.7 && r() < 0.45 ? 2 : r() < 0.2 ? 3 : r() < 0.5 ? 0 : 1;
    const size = 0.27 + r() * 0.1;
    const s = sway(at);
    leafQuad(leaves, at, dir, face, size, size, uvCell(2, 2, cell), c, birth, at, {
      segs: 2, curl: (r() - 0.25) * 0.8, center: headC, radii: headR, normalBend: 0.5, sway0: s, sway1: clamp(s + 0.15),
    });
  };
  const tipsOut: { p: THREE.Vector3; birth: number }[] = [];
  for (const b of sk.branches) {
    if (b.level < 2) continue;
    const twig = b.level === 3;
    const n = Math.max(2, Math.round(b.length / (twig ? 0.038 : 0.055)));
    for (let k = 0; k < n; k++) {
      const t = lerp(twig ? 0.05 : 0.2, 1, (k + r() * 0.7) / n);
      const at = along(b.pts, t);
      const lateral = V().crossVectors(at.dir, UP);
      if (lateral.lengthSq() < 0.01) lateral.set(1, 0, 0);
      lateral.normalize().multiplyScalar(k % 2 ? 1 : -1);
      const out = at.p.clone().sub(headC).normalize();
      const dir = at.dir.clone().multiplyScalar(0.5).addScaledVector(lateral, 0.6).addScaledVector(out, 0.7).add(V(0, (r() - 0.45) * 0.6, 0)).normalize();
      card(at.p, dir, clamp(b.birth + r() * 0.1, 0, 0.9), false);
    }
    if (twig) {
      const end = along(b.pts, 1);
      const out = end.p.clone().sub(headC).normalize();
      card(end.p, end.dir.clone().addScaledVector(out, 0.8).normalize(), clamp(b.birth + 0.04, 0, 0.9), true);
      tipsOut.push({ p: end.p, birth: b.birth });
    }
  }

  // Oranges hang just inside the surface of the head; blossoms sit on it.
  const peel = uvCell(2, 2, 0);
  const inset = (u: [number, number, number, number]): [number, number, number, number] => [u[0] + 0.02, u[1] + 0.02, u[2] - 0.02, u[3] - 0.02];
  let nFruit = 0, nBloom = 0;
  for (let tries = 0; tries < 4000 && (nFruit < 64 || nBloom < 60); tries++) {
    const t = tipsOut[Math.floor(r() * tipsOut.length)];
    const depth = canopyDepth(t.p, headC, headR);
    if (depth < 0.8) continue;
    const s = sway(t.p);
    if (nFruit < 64 && t.p.y < headC.y + headR.y * 0.55 && r() < 0.5) {
      const rad = 0.036 + r() * 0.006;
      const c = t.p.clone().add(V((r() - 0.5) * 0.05, -rad * 1.5 - r() * 0.05, (r() - 0.5) * 0.05));
      const out = c.clone().sub(headC).setY(0).normalize();
      c.addScaledVector(out, 0.15 + r() * 0.07);
      const birth = nFruit % 3 === 0 ? 0 : clamp(Math.max(t.birth, 0.1 + r() * 0.7), 0, 0.85);
      const tint = r() < 0.12 ? col('#e8e070') : new THREE.Color(1, 0.93 + r() * 0.1, 0.9 + r() * 0.1);
      ball(fruit, c, rad, 0.94, inset(peel), tint.multiplyScalar(lerp(0.8, 1, depth)), birth, t.p, s, 9, 6, r() * 6);
      // Stem and calyx on top.
      leafQuad(fruit, c.clone().add(V(-0.02, rad * 0.95, 0)), V(1, 0, 0), UP, 0.04, 0.04, inset(uvCell(2, 2, 3)), col('#ffffff'), birth, t.p, { sway0: s, sway1: s });
      nFruit++;
    } else if (nBloom < 60) {
      const out = t.p.clone().sub(headC).normalize();
      const p = t.p.clone().addScaledVector(out, 0.05 + r() * 0.06).add(V((r() - 0.5) * 0.12, (r() - 0.5) * 0.12, (r() - 0.5) * 0.12));
      const side = V().crossVectors(out, UP).normalize();
      const size = r() < 0.5 ? 0.075 : 0.045;
      leafQuad(fruit, p.clone().addScaledVector(side, -size / 2), side, out, size, size, inset(uvCell(2, 2, size > 0.05 ? 2 : 1)), col('#ffffff'), clamp(t.birth + r() * 0.5, 0, 0.85), t.p, { sway0: s, sway1: s });
      nBloom++;
    }
  }

  fitToSize([wood, leaves, fruit], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: fruit.build(),
    leafMap: citrusLeaves(),
    flowerMap: citrusFruit(),
    bark: { map: citrusBark() },
    look: { translucency: 0.25, leafRoughness: 0.74, bend: 0.1, flutter: 0.012 },
  };
};
