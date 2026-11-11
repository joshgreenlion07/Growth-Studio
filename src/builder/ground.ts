import * as THREE from 'three';
import { materialById } from '../siteplan/catalog';
import { bounds, distToEdge, distToPolyline, fallProfile, pointInPolygon, projectOnPolyline, type Bounds } from '../siteplan/geometry';
import type { SitePlan, Vec2, Zone } from '../siteplan/types';
import type { PBRSet } from '../engine/textures';
import { materialTextures, soilTextures } from '../engine/surfaces';
import { vnoise } from '../engine/noise';
import { CURB, ROAD, SIDEWALK, streetCoords, streetFrame } from './context';

/**
 * Terrain for the property and its surroundings, plus the ground surface
 * shader that paints lawn, mulch, decomposed granite and rock from the plan.
 */

export const WATER_LEVEL = -0.07;

export interface GroundModel {
  /** Site bounds plus margin, in plan coordinates. */
  area: Bounds;
  height(p: Vec2): number;
  /** The zone on top at a point (later zones win), or null. */
  zoneAt(p: Vec2): Zone | null;
  inWater(p: Vec2, pad?: number): boolean;
}

/** Ground surfaces painted by the splat shader: soil plus up to 8 materials. */
export const MAX_GROUND_LAYERS = 8;

export function groundLayers(plan: SitePlan): string[] {
  const ids: string[] = [];
  const add = (id: string) => {
    if (!ids.includes(id) && ids.length < MAX_GROUND_LAYERS) ids.push(id);
  };
  for (const z of plan.zones) if (z.kind !== 'hardscape' && materialById.has(z.catalogId)) add(z.catalogId);
  if (plan.water.some((w) => w.kind === 'pond' || w.kind === 'stream' || w.kind === 'pondless')) add('river-rock');
  return ids;
}

function layerIndex(layers: string[], id: string): number {
  const i = layers.indexOf(id);
  return i < 0 ? 0 : i + 1;
}

export function groundModel(plan: SitePlan): GroundModel {
  const b = bounds(plan.site.boundary);
  const area = { minX: b.minX - 4, minY: b.minY - 4, maxX: b.maxX + 4, maxY: b.maxY + 4 };
  const water = plan.water;
  const beds = plan.zones.filter((z) => z.kind === 'bed');
  const street = streetFrame(plan);
  const streetW = SIDEWALK * 2 + CURB * 2 + ROAD;

  const zoneAt = (p: Vec2): Zone | null => {
    for (let i = plan.zones.length - 1; i >= 0; i--) if (pointInPolygon(p, plan.zones[i].polygon)) return plan.zones[i];
    return null;
  };

  const inWater = (p: Vec2, pad = 0) => {
    for (const w of water) {
      if (w.polygon && (pointInPolygon(p, w.polygon) || (pad > 0 && distToEdge(p, w.polygon) < pad))) return true;
      if (w.points && distToPolyline(p, w.points) < (w.width ?? 0.8) / 2 + pad) return true;
    }
    return false;
  };

  const height = (p: Vec2): number => {
    let h = 0;
    // Gentle relief outside the property.
    const outside = !pointInPolygon(p, plan.site.boundary);
    if (outside) {
      const d = distToEdge(p, plan.site.boundary);
      let k = Math.min(1, Math.max(0, (d - 5) / 15));
      if (street) {
        const c = streetCoords(street, p);
        if (c.across > -0.3 && c.across < streetW + 0.3) return c.across > SIDEWALK && c.across < SIDEWALK + 2 * CURB + ROAD ? -0.26 : -0.03;
        // Keep the ground flat near the street.
        if (c.across > -3 && c.across < streetW + 3) k *= 0.2;
      }
      h += (vnoise(p[0] * 0.08, p[1] * 0.08, 1e6, 3) - 0.5) * 0.5 * k;
    } else {
      // Planting beds are mounded slightly; raised planters are filled near the top.
      const top = zoneAt(p);
      for (const z of beds) {
        if (top !== z) continue;
        if (z.raised && pointInPolygon(p, z.polygon)) {
          h = Math.max(h, z.raised.height - 0.07);
          continue;
        }
        if (pointInPolygon(p, z.polygon)) {
          const d = distToEdge(p, z.polygon);
          const mat = materialById.get(z.catalogId);
          const k = z.raised ? 0 : mat?.recipe === 'mulch' ? 0.07 : 0.025;
          h = Math.max(h, k * Math.min(1, d / 1.2));
        }
      }
    }
    for (const w of water) {
      if (w.kind === 'pond' && w.polygon && pointInPolygon(p, w.polygon)) {
        const d = distToEdge(p, w.polygon);
        h = Math.min(h, WATER_LEVEL - 0.04 - w.depth * Math.pow(Math.min(1, d / 1.3), 0.8));
      } else if (w.kind === 'pool' && w.polygon && pointInPolygon(p, w.polygon)) {
        h = Math.min(h, -w.depth - 0.15);
      } else if ((w.kind === 'stream' || w.kind === 'pondless') && w.points) {
        const half = (w.width ?? 0.8) / 2;
        const pr = projectOnPolyline(p, w.points);
        const prof = fallProfile(w, WATER_LEVEL);
        const lvl = prof.level(pr.t);
        // A planted berm carries the raised run; it fades out 1.6 m from the bank.
        const bank = Math.max(0, lvl + 0.08);
        const k = Math.min(1, Math.max(0, (pr.d - half) / 1.6));
        if (pr.d < half + 1.6) h = Math.max(h, bank * (1 - k * k * (3 - 2 * k)));
        // Head of the run: a rock mound the first fall spills from.
        const dh = Math.hypot(p[0] - w.points[0][0], p[1] - w.points[0][1]);
        if (dh < 1.8) h = Math.max(h, (prof.top + 0.3) * Math.pow(1 - dh / 1.8, 0.7));
        if (pr.d < half && (w.kind === 'stream' || pr.t < prof.end)) {
          const t = 1 - pr.d / half;
          h = lvl - 0.03 - w.depth * Math.sqrt(t);
        } else if (w.kind === 'pondless' && pr.t >= prof.end && pr.d < half + 0.4) {
          // Gravel basin at the bottom: water disappears into rock.
          h = Math.min(h, -0.02);
        }
      }
    }
    return h;
  };

  return { area, height, zoneAt, inWater };
}

/* ------------------------------------------------------------------ */
/* Splat map                                                            */
/* ------------------------------------------------------------------ */

function rasterPolygon(buf: Uint8Array, W: number, Hh: number, poly: Vec2[], toPx: (p: Vec2) => [number, number], value: number) {
  const pts = poly.map(toPx);
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(Hh - 1, Math.ceil(maxY));
  const xs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > yc !== yj > yc) xs.push(xi + ((yc - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, c) => a - c);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), c = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      buf.fill(value, y * W + a, y * W + c + 1);
    }
  }
}

function splatTextures(plan: SitePlan, area: Bounds, ppm: number, layers: string[]): THREE.DataTexture[] {
  const W = Math.min(2048, Math.ceil((area.maxX - area.minX) * ppm));
  const Hh = Math.min(2048, Math.ceil((area.maxY - area.minY) * ppm));
  const sx = W / (area.maxX - area.minX), sy = Hh / (area.maxY - area.minY);
  const toPx = (p: Vec2): [number, number] => [(p[0] - area.minX) * sx, (p[1] - area.minY) * sy];
  const idx = new Uint8Array(W * Hh);
  for (const z of plan.zones) {
    const layer = z.kind === 'hardscape' ? 0 : layerIndex(layers, z.catalogId);
    rasterPolygon(idx, W, Hh, z.polygon, toPx, layer);
  }
  const rock = layerIndex(layers, 'river-rock');
  for (const w of plan.water) {
    if (w.kind === 'pond' && w.polygon) rasterPolygon(idx, W, Hh, w.polygon, toPx, rock);
    if ((w.kind === 'stream' || w.kind === 'pondless') && w.points) {
      const half = (w.width ?? 0.8) / 2 + (w.kind === 'pondless' ? 0.6 : 0.22);
      for (let i = 0; i < w.points.length - 1; i++) {
        const a = w.points[i], c = w.points[i + 1];
        const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1;
        const nx = (-dy / l) * half, ny = (dx / l) * half;
        rasterPolygon(idx, W, Hh, [[a[0] + nx, a[1] + ny], [c[0] + nx, c[1] + ny], [c[0] - nx, c[1] - ny], [a[0] - nx, a[1] - ny]], toPx, rock);
        for (const q of [a, c]) {
          const circ: Vec2[] = [];
          for (let k = 0; k < 14; k++) circ.push([q[0] + Math.cos((k / 14) * 6.283) * half, q[1] + Math.sin((k / 14) * 6.283) * half]);
          rasterPolygon(idx, W, Hh, circ, toPx, rock);
        }
      }
    }
  }
  // Weights with a 3x3 box filter for soft, anti-aliased edges.
  const A = new Uint8Array(W * Hh * 4), B = new Uint8Array(W * Hh * 4);
  const acc = new Float32Array(MAX_GROUND_LAYERS + 1);
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      acc.fill(0);
      for (let j = -1; j <= 1; j++) {
        const yy = Math.min(Hh - 1, Math.max(0, y + j));
        for (let i = -1; i <= 1; i++) {
          const xx = Math.min(W - 1, Math.max(0, x + i));
          acc[idx[yy * W + xx]]++;
        }
      }
      const o = (y * W + x) * 4;
      for (let k = 0; k < 4; k++) {
        A[o + k] = (acc[k + 1] / 9) * 255;
        B[o + k] = (acc[k + 5] / 9) * 255;
      }
    }
  }
  return [A, B].map((data) => {
    const t = new THREE.DataTexture(data, W, Hh, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  });
}

/* ------------------------------------------------------------------ */
/* Ground meshes                                                        */
/* ------------------------------------------------------------------ */

function gridGeometry(area: Bounds, step: number, height: (p: Vec2) => number, hole?: Bounds): THREE.BufferGeometry {
  const nx = Math.ceil((area.maxX - area.minX) / step), ny = Math.ceil((area.maxY - area.minY) / step);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = area.minX + ((area.maxX - area.minX) * i) / nx;
      const z = area.minY + ((area.maxY - area.minY) * j) / ny;
      pos.push(x, height([x, z]), z);
      // World-space UVs keep the normal-map tangent frame aligned with x and z.
      uv.push(x, z);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (hole) {
        // Leave out only cells that sit fully inside the hole. Cells that straddle its
        // edge stay, so no gap opens between this mesh and the one that fills the hole.
        const x0 = area.minX + ((area.maxX - area.minX) * i) / nx, x1 = area.minX + ((area.maxX - area.minX) * (i + 1)) / nx;
        const z0 = area.minY + ((area.maxY - area.minY) * j) / ny, z1 = area.minY + ((area.maxY - area.minY) * (j + 1)) / ny;
        if (x0 >= hole.minX && x1 <= hole.maxX && z0 >= hole.minY && z1 <= hole.maxY) continue;
      }
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Ground material: a splat blend of soil plus the plan's surfaces, in world space. */
function splatMaterial(layerIds: string[], area: Bounds, splats: THREE.DataTexture[]): THREE.MeshPhysicalMaterial {
  const soil = soilTextures();
  const sets: PBRSet[] = [soil, ...layerIds.map((id) => materialTextures(materialById.get(id)!))];
  const roughK = [0.97, ...layerIds.map((id) => {
    const r = materialById.get(id)!.recipe;
    return r === 'blackPebble' ? 0.55 : r === 'riverRock' || r === 'cobble' ? 0.7 : r === 'turfArtificial' ? 0.8 : 0.93;
  })];
  const n = sets.length;
  // Physical material so the ground's sky reflection can be toned down:
  // rough mulch and soil reflect far less than the default 4%.
  const mat = new THREE.MeshPhysicalMaterial({ map: soil.map, normalMap: soil.normalMap, roughness: 1, metalness: 0, specularIntensity: 0.45 });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uSplatA = { value: splats[0] };
    s.uniforms.uSplatB = { value: splats[1] };
    s.uniforms.uArea = { value: new THREE.Vector4(area.minX, area.minY, area.maxX - area.minX, area.maxY - area.minY) };
    sets.forEach((l, i) => {
      s.uniforms[`uA${i}`] = { value: l.map };
      s.uniforms[`uN${i}`] = { value: l.normalMap };
      s.uniforms[`uT${i}`] = { value: 1 / l.tileMeters };
    });
    s.uniforms.uMacro = { value: soil.map };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const decl = sets.map((_, i) => `uniform sampler2D uA${i}; uniform sampler2D uN${i}; uniform float uT${i};`).join('\n');
    const comps = ['a.r', 'a.g', 'a.b', 'a.a', 'b.r', 'b.g', 'b.b', 'b.a'];
    const w = (i: number) => (i === 0 ? 'g0' : `gw${i}`);
    const weights = Array.from({ length: n - 1 }, (_, i) => `float gw${i + 1} = ${comps[i]};`).join(' ');
    const sum = n > 1 ? Array.from({ length: n - 1 }, (_, i) => `gw${i + 1}`).join(' + ') : '0.0';
    const albedo = sets.map((_, i) => `texture2D(uA${i}, wp * uT${i}).rgb * ${w(i)}`).join(' + ');
    const normal = sets.map((_, i) => `texture2D(uN${i}, wp * uT${i}).xyz * ${w(i)}`).join(' + ');
    const rough = sets.map((_, i) => `${roughK[i].toFixed(3)} * ${w(i)}`).join(' + ');
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vGW;
         uniform sampler2D uSplatA; uniform sampler2D uSplatB; uniform vec4 uArea; uniform sampler2D uMacro;
         ${decl}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 suv = (vGW.xz - uArea.xy) / uArea.zw;
         float inside = step(0.0, suv.x) * step(0.0, suv.y) * step(suv.x, 1.0) * step(suv.y, 1.0);
         vec4 a = texture2D(uSplatA, suv) * inside;
         vec4 b = texture2D(uSplatB, suv) * inside;
         ${weights}
         float g0 = max(0.0, 1.0 - (${sum}));
         vec2 wp = vGW.xz;
         vec3 alb = ${albedo};
         float macro = texture2D(uMacro, wp * 0.023).g;
         alb *= mix(1.0, 0.86 + macro * 0.3, g0);
         diffuseColor.rgb *= alb;`,
      )
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * (${rough});`)
      .replace(
        '#include <normal_fragment_maps>',
        `vec3 nmap = (${normal}) * 2.0 - 1.0;
         nmap.xy *= normalScale;
         normal = normalize(tbn * nmap);`,
      );
  };
  mat.customProgramCacheKey = () => `ground-splat-${layerIds.join(',')}`;
  return mat;
}

export interface GroundBuild {
  object: THREE.Group;
  /** Surfaces for autofocus and camera collision. */
  surfaces: THREE.Mesh[];
  dispose(): void;
}

export function buildGround(plan: SitePlan, gm: GroundModel, quality: 'draft' | 'balanced' | 'max'): GroundBuild {
  const group = new THREE.Group();
  group.name = 'ground';
  const area = gm.area;
  const layers = groundLayers(plan);
  const splats = splatTextures(plan, area, quality === 'draft' ? 30 : 60, layers);
  const mat = splatMaterial(layers, area, splats);
  const step = quality === 'draft' ? 0.3 : 0.18;
  const site = new THREE.Mesh(gridGeometry(area, step, gm.height), mat);
  site.receiveShadow = true;
  site.name = 'site-ground';
  group.add(site);

  // Surroundings: coarser terrain that fades into the haze.
  const far = { minX: area.minX - 80, minY: area.minY - 80, maxX: area.maxX + 80, maxY: area.maxY + 80 };
  const surroundMat = mat; // Splat weights are zero outside, which leaves the soil and dry grass layer.
  const ring = new THREE.Mesh(gridGeometry(far, 2.0, gm.height, area), surroundMat);
  ring.receiveShadow = true;
  ring.name = 'surround-ground';
  // The ring tucks a few millimeters under the site ground where the two overlap.
  ring.position.y = -0.004;
  group.add(ring);

  return {
    object: group,
    surfaces: [site],
    dispose() {
      site.geometry.dispose();
      ring.geometry.dispose();
      mat.dispose();
      splats.forEach((t) => t.dispose());
    },
  };
}
