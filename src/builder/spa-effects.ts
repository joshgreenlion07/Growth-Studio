import * as THREE from 'three';
import { vnoise } from '../engine/noise';

/*
 * A hot tub's jets by hand (see builder/actions.ts): churning bubbles on the water, strongest round the seats, and
 * steam rising off the hot water. Both are lit like the rest of the yard (white foam and vapor, blue-lit at night by
 * the spa light), drawn as transparent layers whose patterns drift each frame while the jets run.
 */

const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

let foamTex: THREE.DataTexture | null = null;
let steamTex: THREE.DataTexture | null = null;

/** Small round bubbles and froth, tiling: alpha in the red channel's place of a white texture. */
function foamTexture(): THREE.DataTexture {
  if (foamTex) return foamTex;
  const n = 128, d = new Uint8Array(n * n * 4);
  const a = new Float32Array(n * n);
  for (let k = 0; k < 150; k++) {
    const cx = hash(k, 1) * n, cy = hash(k, 2) * n, r = 1.2 + hash(k, 3) * 3.2;
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const dd = Math.hypot(x - cx, y - cy) / r;
        if (dd > 1) continue;
        const i = ((y + n) % n) * n + ((x + n) % n);
        // A bubble: bright rim, clearer middle.
        a[i] = Math.max(a[i], 0.35 + 0.65 * Math.pow(dd, 3));
      }
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      // Patches of froth between the bubbles.
      const froth = vnoise(x / 10, y / 10, n / 10, 71);
      const v = Math.min(1, Math.max(a[i] * 0.85, froth > 0.62 ? (froth - 0.62) * 1.6 : 0));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(v * 255);
      d[i * 4 + 3] = 255;
    }
  }
  foamTex = new THREE.DataTexture(d, n, n);
  foamTex.wrapS = foamTex.wrapT = THREE.RepeatWrapping;
  foamTex.magFilter = THREE.LinearFilter;
  foamTex.minFilter = THREE.LinearMipmapLinearFilter;
  foamTex.generateMipmaps = true;
  foamTex.needsUpdate = true;
  return foamTex;
}

/** Soft billows of vapor, tiling, taller than wide. */
function steamTexture(): THREE.DataTexture {
  if (steamTex) return steamTex;
  const w = 64, h = 128, d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const f = vnoise(u * 4, v * 4, 4, 81) * 0.55 + vnoise(u * 8, v * 8, 8, 82) * 0.3 + vnoise(u * 16, v * 16, 16, 83) * 0.15;
      const k = Math.max(0, Math.min(1, (f - 0.42) * 2.4));
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.round(k * 255);
      d[i + 3] = 255;
    }
  }
  steamTex = new THREE.DataTexture(d, w, h);
  steamTex.wrapS = steamTex.wrapT = THREE.RepeatWrapping;
  steamTex.magFilter = THREE.LinearFilter;
  steamTex.minFilter = THREE.LinearFilter;
  steamTex.needsUpdate = true;
  return steamTex;
}

export interface SpaEffects {
  meshes: THREE.Mesh[];
  materials: THREE.Material[];
  /** Show the bubbles and the steam at a strength from 0 (hidden) to 1 (full). */
  level(a: number): void;
  /** Drift the patterns: dt seconds. */
  frame(dt: number): void;
}

/**
 * Bubbles over `water` (the water surface's own geometry, meters, uv 0..1 across the opening) and steam rising from
 * it to about 3 ft, centered at `center` with `halfW` the opening's half width.
 */
export function spaEffects(water: THREE.BufferGeometry, center: THREE.Vector3, halfW: number): SpaEffects {
  const meshes: THREE.Mesh[] = [];
  const materials: THREE.Material[] = [];
  const drift: { tex: THREE.Texture; vx: number; vy: number; wob: number }[] = [];

  // Two layers of foam drifting different ways read as churning water. Alpha fades in from the middle (the jets are
  // in the seats round the walls).
  for (let k = 0; k < 2; k++) {
    const g = water.clone();
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    const col = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(uv.getX(i) - 0.5, uv.getY(i) - 0.5) * 2;
      // Churning round the seats (the jets are in their backs), clearer over the footwell.
      const t = Math.min(1, Math.max(0, (r - 0.4) / 0.5));
      col.set([1, 1, 1, 0.06 + 0.94 * t * t * (3 - 2 * t)], i * 4);
      uv.setXY(i, uv.getX(i) * (k ? 4 : 6), uv.getY(i) * (k ? 4 : 6));
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.translate(0, 0.004 + k * 0.003, 0);
    const tex = foamTexture().clone();
    tex.needsUpdate = true;
    const m = new THREE.MeshStandardMaterial({ color: '#f2f6f8', roughness: 0.5, transparent: true, opacity: k ? 0.4 : 0.6, alphaMap: tex, vertexColors: true, depthWrite: false });
    m.addEventListener('dispose', () => tex.dispose());
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 3;
    mesh.visible = false;
    meshes.push(mesh);
    materials.push(m);
    drift.push({ tex, vx: k ? -0.11 : 0.09, vy: k ? 0.07 : -0.12, wob: k ? 1.3 : 0.9 });
  }

  // Steam: three tall crossed sheets over the water, thickest low down and fading out above and at the sides.
  const H = 0.95;
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(halfW * 1.9, H, 6, 8);
    const p = g.getAttribute('position');
    const col = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (halfW * 0.95), y = p.getY(i) / H + 0.5;
      const a = Math.max(0, 1 - x * x) * Math.pow(1 - y, 1.6) * Math.min(1, y * 8);
      col.set([1, 1, 1, a], i * 4);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.rotateY((k * Math.PI) / 3);
    g.translate(center.x, center.y + H / 2, center.z);
    const tex = steamTexture().clone();
    tex.repeat.set(1.5, 1);
    tex.needsUpdate = true;
    const m = new THREE.MeshStandardMaterial({ color: '#f4f6f7', roughness: 1, transparent: true, opacity: 0.42, alphaMap: tex, vertexColors: true, depthWrite: false, side: THREE.DoubleSide });
    m.addEventListener('dispose', () => tex.dispose());
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 4;
    mesh.visible = false;
    meshes.push(mesh);
    materials.push(m);
    drift.push({ tex, vx: (k - 1) * 0.02, vy: -0.08 - k * 0.015, wob: 0.6 });
  }

  const full = materials.map((m) => (m as THREE.MeshStandardMaterial).opacity);
  let t = 0;
  return {
    meshes,
    materials,
    level(a) {
      meshes.forEach((m, i) => {
        m.visible = a > 0.004;
        (materials[i] as THREE.MeshStandardMaterial).opacity = full[i] * a;
      });
    },
    frame(dt) {
      t += dt;
      for (const d of drift) {
        d.tex.offset.x = d.vx * t + Math.sin(t * d.wob) * 0.03;
        d.tex.offset.y = d.vy * t + Math.cos(t * d.wob * 0.8) * 0.03;
      }
    },
  };
}
