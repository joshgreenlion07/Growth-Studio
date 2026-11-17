import * as THREE from 'three';
import { GeoBuilder, UP, V, along, canopyDepth, clamp, col, deflect, jitter, leafPath, leafQuad, leafTexture, lerp, perp, rng, smoothstep, tube, uvCell, type SpeciesBuilder } from '../kit';
import { cellClip, faceCard, fitAll, hardenAlpha, stemBark, tone } from './shared-shrubs-b';

/**
 * Bougainvillea 'Barbara Karst' grown as a free-standing, mounding shrub, in
 * full color. A sprawl of long, arching, thorny canes from a woody crown;
 * short side shoots all along the outer half of every cane carry loose
 * panicles of papery crimson-magenta bracts (in threes, each three around
 * tiny white tubular flowers), so the cane ends read as sheets of color over
 * the green. Leaves alternate, broadly ovate with a pointed tip, 2 to 4 in,
 * dull medium green; a short curved spine at each node.
 *
 * References:
 *  - San Marcos Growers, Bougainvillea 'Barbara Karst'
 *    (smgrowers.com/products/plants/plantdisplay.asp?plant_id=261): large
 *    evergreen vine; leaves dull dark green, broadly ovate, pointed, slightly
 *    wavy; magenta-red bracts along the full length of the stems in flushes
 *    late spring to fall; small white flowers; hardy to about 20-25 F.
 *  - University of Arizona Campus Arboretum, taxon 1160
 *    (apps.cals.arizona.edu/arboretum/taxon.aspx?id=1160): vine to 20-50 ft
 *    "or pruned as a shrub"; the most cold-hardy bougainvillea; photos used
 *    for bract color and cluster form.
 *  - Monrovia, Barbara Karst Bougainvillea (monrovia.com plant 365): bright
 *    magenta-red bracts, summer bloom; climbs 20-30 ft with support, rambles
 *    as a bank cover unsupported.
 *  - Trees.com (formerly Fast Growing Trees), Barbara Karst Bougainvillea
 *    Shrub: shrub form 4-6 ft tall, 8-10 ft wide.
 * Modesto (zone 9, Sunset 8/9) frosts knock it back most winters, so as a
 * free-standing shrub it is kept about 6 ft tall and 8 ft wide (1.8 x 2.4 m);
 * a 5 gal is about 3 ft of staked canes.
 */

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Textures                                                             */
/* ------------------------------------------------------------------ */

/**
 * Leaf atlas, 2 x 2: two single leaves (petiole at the cell bottom, tip at
 * the top) and two leafy shoot tips (stem at the bottom center).
 */
function leafTex(): THREE.Texture {
  return leafTexture('bougainvillea-leaves', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('bougainvillea-leaf-tex');
    /** A broadly ovate leaf with a drawn-out point, base at (x, y), pointing `ang` from straight up. */
    const leaf = (x: number, y: number, ang: number, len: number, young: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(-Math.PI / 2 + ang);
      const pet = len * 0.13, L = len - pet, W = L * (0.66 + r() * 0.06);
      g.strokeStyle = tone('#5f7a34', '#6e8a3c', young);
      g.lineCap = 'round';
      g.lineWidth = Math.max(2, len * 0.03);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(pet + 2, 0);
      g.stroke();
      g.translate(pet, 0);
      const sh = r();
      const a = tone(tone('#24431a', '#2d4f1e', sh), '#476f28', young), b = tone(tone('#335b23', '#3e672a', sh), '#5e8c34', young);
      const grad = g.createLinearGradient(0, -W / 2, 0, W / 2);
      grad.addColorStop(0, a);
      grad.addColorStop(0.46, b);
      grad.addColorStop(0.54, tone(a, b, 0.75));
      grad.addColorStop(1, a);
      g.fillStyle = grad;
      leafPath(g, L, W, 0.34, 0.9);
      g.shadowColor = 'rgba(0,12,0,0.45)';
      g.shadowBlur = 6;
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(20,38,14,0.55)';
      g.lineWidth = 1.3;
      g.stroke();
      g.save();
      g.clip();
      // Dull sheen and a slight wave along the margin (light and dark bands).
      g.fillStyle = 'rgba(210,230,190,0.07)';
      g.beginPath();
      g.ellipse(L * 0.45, -W * 0.18, L * 0.3, W * 0.12, 0, 0, TAU);
      g.fill();
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
        g.beginPath();
        g.ellipse(L * (0.15 + i * 0.17), (r() < 0.5 ? -1 : 1) * W * 0.42, L * 0.1, W * 0.12, 0, 0, TAU);
        g.fill();
      }
      // Midrib and arching side veins that run toward the tip.
      g.strokeStyle = tone('#8fae68', '#a8c47a', young);
      g.lineWidth = Math.max(1.6, len * 0.012);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(L * 0.95, 0);
      g.stroke();
      g.strokeStyle = 'rgba(140,175,105,0.45)';
      g.lineWidth = Math.max(0.9, len * 0.006);
      g.beginPath();
      for (let i = 1; i <= 5; i++) {
        const t = i / 6.4, vx = L * t;
        const reach = (W / 2) * 0.8 * Math.sin(Math.PI * Math.pow(t, 0.8));
        for (const s of [-1, 1]) {
          g.moveTo(vx, 0);
          g.quadraticCurveTo(vx + L * 0.1, s * reach * 0.75, vx + L * 0.24, s * reach * 0.9);
        }
      }
      g.stroke();
      g.restore();
      g.restore();
    };
    const thorn = (x: number, y: number, side: number) => {
      g.fillStyle = '#6d6234';
      g.beginPath();
      g.moveTo(x - 3, y + 4);
      g.quadraticCurveTo(x + side * 10, y - 2, x + side * 20, y + 6);
      g.quadraticCurveTo(x + side * 8, y + 4, x + 3, y + 8);
      g.closePath();
      g.fill();
    };
    // Cells 0 and 1: single leaves.
    for (let cell = 0; cell < 2; cell++) {
      cellClip(g, cell, 0, S, S);
      leaf(S / 2, S - 4, (r() - 0.5) * 0.06, S * 0.96, cell === 1 ? 0.15 : 0);
      g.restore();
    }
    // Cells 2 and 3: a shoot tip with alternate leaves, smaller toward the tip (3 is younger, lighter growth).
    for (let cell = 2; cell < 4; cell++) {
      cellClip(g, cell - 2, 1, S, S);
      const young = cell === 3 ? 0.55 : 0.1;
      const x0 = S / 2, y0 = S - 3, y1 = S * 0.3;
      const bend = (r() - 0.5) * 40;
      const tx = (t: number) => x0 + bend * t * t + Math.sin(t * 9) * 4, ty = (t: number) => lerp(y0, y1, t);
      g.strokeStyle = tone('#6a6a3a', '#7a8a40', young);
      g.lineCap = 'round';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(tx(0), ty(0));
      for (let i = 1; i <= 12; i++) g.lineTo(tx(i / 12), ty(i / 12));
      g.stroke();
      const n = 4;
      for (let i = 0; i < n; i++) {
        const t = lerp(0.12, 0.8, i / (n - 1));
        const s = i % 2 ? 1 : -1;
        if (i < 2 && r() < 0.7) thorn(tx(t), ty(t), -s);
        leaf(tx(t), ty(t), s * lerp(0.9, 0.45, t) + (r() - 0.5) * 0.2, S * lerp(0.56, 0.4, t) * (0.9 + r() * 0.2), clamp(young + t * 0.4));
      }
      leaf(tx(1), ty(1), (r() - 0.5) * 0.3, S * 0.25, clamp(young + 0.5));
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
}

/**
 * Bract atlas, 2 x 2: loose panicles of bract triads seen from the front
 * (cells 0-2) and from the side (cell 3), centered in each cell. Each triad
 * is three papery, heart-based bracts around one to three white starry
 * flowers on pale tubes.
 */
function bractTex(catalogFresh: string, catalogDeep: string): THREE.Texture {
  return leafTexture('bougainvillea-bracts', 1024, 1024, (g) => {
    const S = 512;
    const r = rng('bougainvillea-bract-tex');
    // The render (sky light through thin bracts, ACES) pushes crimson toward pink; paint a touch redder.
    const fresh = tone(catalogFresh, '#d8182a', 0.35);
    const deep = tone(catalogDeep, '#9a0c22', 0.3);
    const light = tone(fresh, '#ff4a5a', 0.3);
    const shadow = tone(deep, '#3a0414', 0.35);
    /** One bract, base at the origin of the current transform, tip toward +x. */
    const bract = (len: number, shade: number) => {
      const w = len * (0.78 + r() * 0.12);
      const grad = g.createRadialGradient(len * 0.05, 0, len * 0.04, len * 0.4, 0, len * 0.85);
      grad.addColorStop(0, tone(shadow, deep, 0.4 + shade * 0.4));
      grad.addColorStop(0.45, tone(deep, fresh, 0.35 + shade * 0.65));
      grad.addColorStop(1, tone(fresh, light, shade * 0.6));
      g.fillStyle = grad;
      // Broad ovate bract with a rounded, slightly heart-shaped base and a short point.
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(len * 0.02, -w * 0.5, len * 0.42, -w * 0.62, len * 0.72, -w * 0.36);
      g.quadraticCurveTo(len * 0.92, -w * 0.16, len, 0);
      g.quadraticCurveTo(len * 0.92, w * 0.16, len * 0.72, w * 0.36);
      g.bezierCurveTo(len * 0.42, w * 0.62, len * 0.02, w * 0.5, 0, 0);
      g.closePath();
      g.shadowColor = 'rgba(40,0,12,0.5)';
      g.shadowBlur = 7;
      g.fill();
      g.shadowBlur = 0;
      g.save();
      g.clip();
      // Fine net of veins, slightly darker than the papery blade.
      g.strokeStyle = 'rgba(80,0,30,0.22)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(len * 0.95, 0);
      for (let i = 1; i <= 4; i++) {
        const t = i / 5;
        for (const s of [-1, 1]) {
          g.moveTo(len * t * 0.8, 0);
          g.quadraticCurveTo(len * (t * 0.8 + 0.12), s * w * 0.22, len * (t * 0.8 + 0.18), s * w * 0.36 * Math.sin(Math.PI * (0.2 + t * 0.7)));
        }
      }
      g.stroke();
      // Light catching a crumpled fold.
      g.fillStyle = `rgba(255,110,140,${0.06 + shade * 0.08})`;
      g.beginPath();
      g.ellipse(len * 0.55, -w * 0.12 * (r() < 0.5 ? 1 : -1), len * 0.26, w * 0.1, 0.2, 0, TAU);
      g.fill();
      g.restore();
    };
    /** The small white flower: a pale tube along the bract with a five-lobed white star at its mouth. */
    const floret = (x: number, y: number, s: number) => {
      g.fillStyle = '#fbf7ee';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + r() * 0.1, rr = i % 2 ? s * 0.42 : s;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.fillStyle = '#e6d27a';
      g.beginPath();
      g.arc(x, y, s * 0.28, 0, TAU);
      g.fill();
    };
    /** A triad seen from the front at (x, y): `open` 0 (cupped, seen half from the side) .. 1 (flat open). */
    const triad = (x: number, y: number, size: number, rot: number, open: number) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      const sq = lerp(0.55, 1, open);
      g.scale(1, sq);
      const order = [0, 1, 2].sort(() => r() - 0.5);
      for (const i of order) {
        g.save();
        g.rotate((i / 3) * TAU + (r() - 0.5) * 0.35);
        bract(size * (0.5 + r() * 0.08), clamp([0.15, 0.55, 0.95][i] + (r() - 0.5) * 0.3 - (1 - sq) * 0.4));
        g.restore();
      }
      g.restore();
      // Florets: the tube lies hidden along a bract; only the small white star at its mouth shows.
      const nf = r() < 0.3 ? 0 : 1 + Math.floor(r() * 2.2);
      for (let k = 0; k < nf; k++) {
        const a = rot + (Math.floor(r() * 3) / 3) * TAU + (r() - 0.5) * 0.3, d = size * (0.05 + r() * 0.08);
        floret(x + Math.cos(a) * d, y + Math.sin(a) * d * sq, size * (0.03 + r() * 0.01));
      }
    };
    for (let cell = 0; cell < 4; cell++) {
      cellClip(g, cell % 2, Math.floor(cell / 2), S, S);
      const side = cell === 3;
      const n = cell === 0 ? 6 : cell === 1 ? 9 : cell === 2 ? 5 : 6;
      const spots: { x: number; y: number; s: number }[] = [];
      for (let tries = 0; tries < 800 && spots.length < n; tries++) {
        const a = r() * TAU, d = Math.sqrt(r()) * S * (cell === 1 ? 0.24 : 0.2);
        const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * (side ? 1.2 : 1);
        const s = S * (cell === 1 ? 0.36 : 0.42) * (0.82 + r() * 0.3);
        if (spots.every((q) => Math.hypot(q.x - x, q.y - y) > (q.s + s) * 0.24)) spots.push({ x, y, s });
      }
      // Thin pinkish-green panicle stalks, mostly hidden.
      g.lineCap = 'round';
      g.strokeStyle = tone('#6f7038', '#8a3a50', 0.35);
      g.lineWidth = 3.5;
      for (const q of spots) {
        g.beginPath();
        g.moveTo(S / 2, S * 0.62);
        g.quadraticCurveTo((S / 2 + q.x) / 2, (S * 0.62 + q.y) / 2 + 10, q.x, q.y);
        g.stroke();
      }
      // Back to front: lower triads drawn first, the larger, open ones last.
      spots.sort((a, b) => a.s - b.s);
      for (const q of spots) triad(q.x, q.y, q.s, r() * TAU, side ? 0.2 + r() * 0.4 : 0.55 + r() * 0.45);
      g.restore();
    }
    hardenAlpha(g, 1024, 1024);
  });
}

/* ------------------------------------------------------------------ */
/* Builder                                                              */
/* ------------------------------------------------------------------ */

interface Cane {
  pts: THREE.Vector3[];
  /** Fraction of the length where the cane leaves the mound as a hanging whip (1 = none). */
  whipFrom: number;
  r0: number;
  r1: number;
  birth: number;
  level: number;
  len: number;
}

/** Cubic Bezier through four points, sampled at n + 1 points. */
function bezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push(p0.clone().multiplyScalar(u * u * u).addScaledVector(p1, 3 * u * u * t).addScaledVector(p2, 3 * u * t * t).addScaledVector(p3, t * t * t));
  }
  return out;
}

const polyLen = (pts: THREE.Vector3[]) => pts.reduce((a, p, i) => (i ? a + p.distanceTo(pts[i - 1]) : 0), 0);

export const build: SpeciesBuilder = (spec) => {
  const H = spec.matureHeight, Sp = spec.matureSpread;
  const r = rng(spec.id);
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), flowers = new GeoBuilder();

  // The envelope: a loose mound, widest about a third of the way up, its skirt
  // coming down to the ground near the full spread. Built at about the final
  // size; fitAll trims the last few percent.
  const R = Sp / 2 * 0.86;
  const y0 = H * 0.34;
  const center = V(0, y0, 0), radii = V(R, H - y0, R);
  const lumpK = [0, 1, 2, 3].map(() => ({ k: V(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(2 + r() * 2.5), ph: r() * TAU }));
  const shellAt = (d: THREE.Vector3) => {
    const ry = d.y >= 0 ? H - y0 : y0;
    const pw = 2.6;
    const a = Math.pow(Math.hypot(d.x, d.z) / R, pw) + Math.pow(Math.abs(d.y) / ry, pw);
    const lump = 1 + 0.2 * lumpK.reduce((acc, l) => acc + Math.sin(d.dot(l.k) + l.ph), 0) / 2;
    const p = center.clone().addScaledVector(d, lump / Math.pow(a, 1 / pw));
    p.y = Math.max(p.y, 0.04);
    return p;
  };
  const out = (p: THREE.Vector3) => {
    const d = p.clone().sub(center);
    d.set(d.x / (radii.x * radii.x), d.y / (radii.y * radii.y), d.z / (radii.z * radii.z));
    return d.lengthSq() < 1e-9 ? UP.clone() : d.normalize();
  };
  const sway = (p: THREE.Vector3) => clamp(Math.pow(clamp(p.y / H), 1.2) * 0.5 + (Math.hypot(p.x, p.z) / R) * 0.5);

  /** A cane from the crown that rises steeply, arches over and comes down onto the shell at `q`. */
  const caneTo = (base: THREE.Vector3, q: THREE.Vector3, segs: number, lift: number) => {
    const horiz = V(q.x - base.x, 0, q.z - base.z);
    const hl = horiz.length();
    if (hl > 1e-6) horiz.multiplyScalar(1 / hl);
    const rise = Math.max(q.y, H * 0.5) * (0.55 + r() * 0.2);
    const p1 = base.clone().add(V(0, rise, 0)).addScaledVector(horiz, hl * 0.15);
    const over = (1 - clamp(q.y / H)) * H * lift;
    const p2 = q.clone().add(V(0, over, 0)).addScaledVector(horiz, -hl * (0.2 + r() * 0.15));
    const pts = bezier(base, p1, p2, q, segs);
    // A slight zigzag from node to node.
    const ph = r() * TAU, side = perp(q.clone().sub(base).normalize());
    return pts.map((p, i) => (i === 0 ? p : p.clone().addScaledVector(side, Math.sin(i * 2.3 + ph) * 0.012)));
  };
  /** Carry a cane on past its end, drooping: the long whips that hang out of the mound. */
  const whip = (pts: THREE.Vector3[], len: number, droop: number) => {
    const n = 6;
    const d = pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize();
    // It leaves the mound heading out and a little up, then bows over.
    const flat = V(d.x, 0, d.z);
    if (flat.lengthSq() < 1e-4) flat.copy(pts[pts.length - 1]).setY(0);
    flat.normalize();
    d.copy(flat).multiplyScalar(0.85).add(V(0, 0.25 + r() * 0.35, 0)).normalize();
    const p = pts[pts.length - 1].clone();
    const outPts = [...pts];
    for (let i = 0; i < n; i++) {
      d.y -= droop / n;
      d.normalize();
      p.addScaledVector(d, len / n);
      p.y = Math.max(p.y, 0.03);
      outPts.push(p.clone());
    }
    return outPts;
  };

  // Shell points on a Fibonacci spiral, where the foliage and bracts sit.
  const shell: { p: THREE.Vector3; d: THREE.Vector3 }[] = [];
  const NS = 760, under = -0.5;
  const total = Math.round(NS / ((1 - under) / 2));
  const off = r() * TAU;
  for (let i = 0; i < total; i++) {
    const y = 1 - (2 * (i + 0.5)) / total;
    if (y < under) break;
    const rad = Math.sqrt(1 - y * y), th = i * 2.39996 + off;
    const d = V(Math.cos(th) * rad + (r() - 0.5) * 0.06, y + (r() - 0.5) * 0.06, Math.sin(th) * rad + (r() - 0.5) * 0.06).normalize();
    const p = shellAt(d);
    // Some points sit a little inside the surface, for a deeper canopy; a few shoots stand well out of it.
    if (r() < 0.16 && y > -0.2) p.sub(center).multiplyScalar(1.08 + r() * 0.22).add(center);
    else p.lerp(center, r() * r() * 0.22);
    shell.push({ p, d });
  }

  // Primary canes, each aimed at its own patch of the shell; the first few are the staked nursery plant.
  const canes: Cane[] = [];
  const NP = 26;
  const early = new Set([0, 1, 3, 5, 8, 11, 14, 18, 22]);
  for (let k = 0; k < NP; k++) {
    const yk = lerp(0.95, -0.35, Math.pow((k + 0.5) / NP, 0.9));
    const rad = Math.sqrt(1 - yk * yk), th = k * 2.39996 + off * 1.3;
    const d = V(Math.cos(th) * rad, yk, Math.sin(th) * rad);
    const q = shellAt(d).lerp(center, 0.12 + r() * 0.1);
    const base = V(Math.cos(th) * 0.05 * r(), 0, Math.sin(th) * 0.05 * r());
    let pts = caneTo(base, q, 12, 0.35 + r() * 0.25);
    const inner = polyLen(pts);
    // Long whips arch out of the mound and hang, here and there.
    if (yk > -0.15 && r() < 0.5) pts = whip(pts, R * (0.2 + r() * 0.2), 1.3 + r() * 0.9);
    const birth = early.has(k) ? 0 : clamp(0.08 + r() * 0.62, 0, 0.8);
    const len = polyLen(pts);
    canes.push({ pts, whipFrom: inner / len, r0: 0.014 + r() * 0.005, r1: 0.0035, birth, level: 0, len });
  }
  // A few long runners that reach well past the mound and bow over: the sprawl in the outline.
  for (let k = 0; k < 6; k++) {
    const yk = lerp(0.15, 0.7, r());
    const rad = Math.sqrt(1 - yk * yk), th = (k / 6) * TAU + off + (r() - 0.5) * 0.6;
    const d = V(Math.cos(th) * rad, yk, Math.sin(th) * rad);
    const q = shellAt(d).lerp(center, 0.15);
    let pts = caneTo(V(0, 0, 0), q, 12, 0.4 + r() * 0.2);
    const inner = polyLen(pts);
    pts = whip(pts, R * (0.28 + r() * 0.2), 1.2 + r() * 0.7);
    const len = polyLen(pts);
    canes.push({ pts, whipFrom: inner / len, r0: 0.014 + r() * 0.004, r1: 0.0035, birth: clamp(0.35 + r() * 0.4), level: 0, len });
  }
  // Secondary canes off the primaries, arching out to the shell beside their parent's.
  for (const c of canes.slice(0, NP)) {
    const n = r() < 0.35 ? 1 : 2;
    for (let j = 0; j < n; j++) {
      const t = lerp(0.35, 0.65, (j + r()) / n);
      const at = along(c.pts, t);
      const end = c.pts[c.pts.length - 1].clone().sub(center).normalize();
      const d = deflect(end, 0.35 + r() * 0.35, r() * TAU);
      d.y = Math.max(d.y, -0.4);
      const q = shellAt(d.normalize()).lerp(center, 0.1 + r() * 0.12);
      if (q.y < at.p.y - H * 0.5) continue;
      const v = q.clone().sub(at.p);
      const p1 = at.p.clone().addScaledVector(at.dir, v.length() * 0.35).add(V(0, v.length() * 0.15, 0));
      const p2 = q.clone().add(V(0, Math.max(0, at.p.y - q.y) * 0.4 + 0.1, 0)).addScaledVector(V(v.x, 0, v.z).normalize(), -v.length() * 0.2);
      let pts = bezier(at.p, p1, p2, q, 8);
      const inner = polyLen(pts);
      if (d.y > -0.1 && r() < 0.35) pts = whip(pts, R * (0.18 + r() * 0.2), 1.3 + r() * 0.8);
      const birth = clamp(c.birth + (r() < 0.5 ? 0 : 0.1 + r() * 0.3), 0, 0.85);
      const len = polyLen(pts);
      canes.push({ pts, whipFrom: inner / len, r0: lerp(c.r0, c.r1, t) * 0.75, r1: 0.003, birth, level: 1, len });
    }
  }

  const caneOld = col('#6e604c'), caneYoung = col('#71783f');
  const thornC = col('#7b6d3c');
  for (const c of canes) {
    tube(wood, c.pts, c.r0, c.r1, c.level === 0 ? 6 : 4, c.level === 0 ? caneOld.clone().lerp(caneYoung, 0.25) : caneOld.clone().lerp(caneYoung, 0.6), c.birth, c.pts[0], (i) => sway(c.pts[i]), 1.5);
  }

  const leafCol = (p: THREE.Vector3) => {
    const d = canopyDepth(p, center, radii);
    const shade = lerp(0.4, 1, Math.pow(d, 1.6)) * lerp(0.78, 1, clamp(p.y / (H * 0.6)));
    return jitter(col('#ffffff'), r, 0.015, 0.04, 0.05).multiplyScalar(shade * (0.88 + r() * 0.16));
  };
  const faceFor = (p: THREE.Vector3) => UP.clone().multiplyScalar(0.7).addScaledVector(out(p), 0.6).add(V((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6)).normalize();

  /** One leaf on a petiole at a node, held out and up from its stem. */
  const leafAt = (p: THREE.Vector3, axis: THREE.Vector3, az: number, birth: number, anchor: THREE.Vector3, size = 1) => {
    const dir = deflect(axis, 0.85 + (r() - 0.5) * 0.4, az).add(V(0, 0.2, 0)).normalize();
    const len = 0.1 * size * (0.8 + r() * 0.35);
    const s = sway(p);
    leafQuad(leaves, p, dir, faceFor(p), len, len, uvCell(2, 2, r() < 0.6 ? 0 : 1), leafCol(p), birth, anchor, { segs: 2, curl: 0.2 + r() * 0.4, center, radii, normalBend: 0.45, sway0: s, sway1: clamp(s + 0.08) });
  };
  /** A leafy shoot tip card. */
  const shootAt = (p: THREE.Vector3, dir: THREE.Vector3, birth: number, anchor: THREE.Vector3, young: boolean, size = 1) => {
    const len = 0.19 * size * (0.8 + r() * 0.35);
    const s = sway(p);
    leafQuad(leaves, p, dir, faceFor(p), len, len, uvCell(2, 2, young ? 3 : 2), leafCol(p), birth, anchor, { segs: 2, curl: 0.25 + r() * 0.3, center, radii, normalBend: 0.5, sway0: s, sway1: clamp(s + 0.1) });
  };
  const bractTint = () => jitter(col('#ffffff'), r, 0.01, 0.03, 0.05).multiplyScalar(0.86 + r() * 0.14);
  /** A panicle of bracts: two or three cards at random angles around the cluster center. */
  const bractsAt = (c: THREE.Vector3, axis: THREE.Vector3, birth: number, anchor: THREE.Vector3, size: number) => {
    const s = sway(c);
    const o = out(c);
    const n = 2 + (r() < 0.4 ? 1 : 0);
    const depth = canopyDepth(c, center, radii);
    const tintC = bractTint().multiplyScalar(lerp(0.6, 1, Math.pow(depth, 1.5)));
    for (let k = 0; k < n; k++) {
      const nrm = o.clone().multiplyScalar(0.7).addScaledVector(axis, 0.3).add(V((r() - 0.5) * 1.6, (r() - 0.5) * 1.0 + 0.3, (r() - 0.5) * 1.6)).normalize();
      const shadeN = nrm.clone().lerp(o, 0.6).lerp(UP, 0.2).normalize();
      const at = c.clone().addScaledVector(axis, (k - 0.5) * size * 0.25).add(V((r() - 0.5) * size * 0.3, (r() - 0.5) * size * 0.2, (r() - 0.5) * size * 0.3));
      const cell = k === 0 ? (r() < 0.5 ? 0 : 1) : r() < 0.25 ? 3 : r() < 0.6 ? 2 : 0;
      faceCard(flowers, at, nrm, size * (k === 0 ? 1 : 0.8 + r() * 0.2), r() * TAU, uvCell(2, 2, cell), tintC.clone().multiplyScalar(0.92 + r() * 0.12), birth, anchor, s, shadeN);
    }
  };

  // Bloom comes in drifts: a smooth field over the shrub, so the color reads as sheets with green between.
  const drift = [0, 1, 2].map(() => ({ k: V(r() - 0.5, (r() - 0.5) * 0.6, r() - 0.5).normalize().multiplyScalar(TAU / (0.8 + r() * 0.6)), ph: r() * TAU }));
  const bloomField = (p: THREE.Vector3) => clamp(0.5 + drift.reduce((a, d) => a + Math.sin(p.dot(d.k) + d.ph), 0) * 0.3);
  const sunny = (p: THREE.Vector3) => lerp(0.4, 1, clamp(p.y / (H * 0.8)));
  const lateralC = col('#6f7a3c');

  // Nodes along every cane: a spine and a leaf, sampled for the side shoots below.
  const nodes: { p: THREE.Vector3; dir: THREE.Vector3; cane: number; t: number; rad: number }[] = [];
  canes.forEach((c, ci) => {
    let az = r() * TAU;
    let t = (c.level === 0 ? 0.12 : 0.05) + r() * 0.04;
    while (t < 0.99) {
      const at = along(c.pts, t);
      az += 2.39996 + (r() - 0.5) * 0.6;
      const born = c.birth === 0 ? (r() < 0.8 ? 0 : 0.1 + r() * 0.5) : clamp(c.birth + r() * 0.12, 0, 0.9);
      const sd = deflect(at.dir, Math.PI / 2, az + 2.2);
      const rad = lerp(c.r0, c.r1, t);
      const sw = sway(at.p);
      const p0 = at.p.clone().addScaledVector(sd, rad * 0.8);
      const i0 = wood.vert(p0.clone().addScaledVector(at.dir, 0.004), sd, 0.1, 0.1, thornC, c.birth, at.p, sw);
      const i1 = wood.vert(p0.clone().addScaledVector(at.dir, -0.004), sd, 0.2, 0.1, thornC, c.birth, at.p, sw);
      const i2 = wood.vert(p0.clone().addScaledVector(sd, 0.012).addScaledVector(at.dir, -0.007), sd, 0.15, 0.2, thornC.clone().multiplyScalar(1.2), c.birth, at.p, sw);
      wood.tri(i0, i1, i2);
      wood.tri(i0, i2, i1);
      leafAt(at.p, at.dir, az, born, at.p);
      if (t > c.whipFrom) {
        // Out on a hanging whip the color runs the length of the cane.
        if (r() < 0.75 * lerp(0.5, 1.3, bloomField(at.p))) {
          const bd = deflect(at.dir, 0.8, az).add(V(0, 0.3, 0)).normalize();
          bractsAt(at.p.clone().addScaledVector(bd, 0.05), bd, c.birth === 0 ? (r() < 0.4 ? 0 : 0.2 + r() * 0.4) : clamp(born + 0.05), at.p, 0.15 + r() * 0.06);
        }
      } else nodes.push({ p: at.p, dir: at.dir, cane: ci, t, rad });
      t += (lerp(0.09, 0.06, t) / c.len) * (0.75 + r() * 0.5);
    }
    // The cane's own end: a bract panicle (most cascading whips end in color) or a young shoot.
    const tip = c.pts[c.pts.length - 1], tdir = c.pts[c.pts.length - 1].clone().sub(c.pts[c.pts.length - 2]).normalize();
    if (r() < 0.8 * lerp(0.5, 1.3, bloomField(tip))) bractsAt(tip.clone().addScaledVector(tdir, 0.04), tdir, c.birth === 0 ? (r() < 0.5 ? 0 : 0.2) : clamp(c.birth + 0.08), tip, 0.16 + r() * 0.05);
    else shootAt(tip, tdir, c.birth, tip, true, 0.9);
  });

  // A side shoot from the nearest cane node out to every shell point: leaves along it, and at its end a bract panicle or a leafy tip.
  for (const sp of shell) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i];
      const dd = nd.p.distanceToSquared(sp.p);
      if (dd < bd && nd.p.y < sp.p.y + 0.25) { bd = dd; best = i; }
    }
    if (best < 0) continue;
    const nd = nodes[best], c = canes[nd.cane];
    const end = sp.p.clone();
    const v = end.clone().sub(nd.p);
    const slen = v.length();
    if (slen < 0.02) continue;
    const sdir = v.clone().normalize();
    const born = c.birth === 0 ? (r() < 0.85 ? 0 : 0.1 + r() * 0.5) : clamp(c.birth + 0.02 + r() * 0.15, 0, 0.9);
    const mid = nd.p.clone().lerp(end, 0.5).add(V(0, slen * 0.1, 0));
    tube(wood, slen > 0.2 ? [nd.p, mid, end] : [nd.p, end], nd.rad * 0.45 + 0.0012, 0.0014, 3, lateralC, born, nd.p, (i) => sway(i === 0 ? nd.p : end), 1);
    const nl = Math.max(1, Math.round(slen / 0.08));
    let laz = r() * TAU;
    for (let k = 0; k < nl; k++) {
      laz += 2.4 + (r() - 0.5) * 0.5;
      leafAt(nd.p.clone().lerp(end, (k + 0.6 + r() * 0.3) / (nl + 0.4)), sdir, laz, born, nd.p);
    }
    const bloomP = smoothstep(0.3, 0.62, bloomField(end) * lerp(0.6, 1.15, sunny(end)));
    const blooming = r() < lerp(0.12, 0.97, bloomP);
    const tipDir = sdir.clone().lerp(out(end), 0.5).normalize();
    if (blooming) {
      const bb = c.birth === 0 ? (r() < 0.45 ? 0 : 0.15 + r() * 0.5) : clamp(born + 0.03 + r() * 0.12, 0, 0.92);
      bractsAt(end.clone().addScaledVector(tipDir, 0.04), tipDir, bb, nd.p, (0.14 + r() * 0.07) * lerp(0.9, 1.2, bloomP));
      if ((slen > 0.22 && r() < 0.5) || (bloomP > 0.6 && r() < 0.6)) bractsAt(nd.p.clone().lerp(end, 0.55).addScaledVector(out(end), 0.03), tipDir, clamp(bb + 0.05), nd.p, 0.12 + r() * 0.04);
    } else {
      shootAt(end, tipDir.clone().lerp(UP, 0.25).normalize(), born, nd.p, r() < 0.35);
    }
  }

  fitAll([wood, leaves, flowers], H, Sp);
  return {
    wood: wood.build(),
    leaves: leaves.build(),
    flowers: flowers.build(),
    leafMap: leafTex(),
    flowerMap: bractTex(spec.flower ?? '#cf1f5a', spec.flower2 ?? '#9c1447'),
    bark: { map: stemBark('bougainvillea', 0.25) },
    look: { translucency: 0.3, leafRoughness: 0.7, bend: 0.08, flutter: 0.013 },
  };
};
