import * as THREE from 'three';
import { vnoise, voronoi } from './noise';
import { paintPixels } from './textures';

/*
 * Close-range detail for paver faces, at the same real size on every paver.
 *
 * A paver texture holds one whole repeat of its laying pattern, so its texel size grows with the pattern: a soldier
 * border repeats every 36 in (1024 px, about 28 px per inch), while Belgard's 3-Piece Pattern A only repeats every
 * 24 ft (2048 px, about 7 px per inch). The fine grain painted into the field's texture was therefore four times
 * coarser than the border's and read as soft blotches up close. Painting the field at the border's density would need
 * an 8192 px texture per color (about 1 GB of GPU memory with its three maps); instead the pattern texture keeps the
 * layout, piece colors, cleft and mottle, and two small shared textures carry what needs real-size detail:
 *  - the fine grain of the face, from a detail texture tiled in meters on top (a 0.25 m tile at 512 px, about 52 px
 *    per inch, the same on the field, the border and any other piece of the line), sampled twice at unrelated scales
 *    and angles so its own repeat never lines up; its mip levels fade it to neutral far away;
 *  - the joints and chamfers, drawn near the camera from an edge map (the distance to each piece's edge, about 1.2 mm
 *    a texel; see PaverEdges) instead of the pattern texture's blurred ones.
 * Cost: two detail fetches and three edge fetches per paver pixel, one shader program for every detailed paver, and
 * about 1.4 MB per face kind plus 0.5 to 4 MB per edge map of GPU memory; the pattern textures are unchanged in size.
 *
 * One RGBA texture per face kind: R the albedo factor (0.5 = 1), G and B the tangent-space normal's x and y, A the
 * roughness offset (0.5 = 0). Painted on the page (about 262k texels, a few tens of ms) the first time a line using
 * it is built, then shared by every color of every line with that face.
 */
export type DetailFace = 'slate' | 'smooth' | 'textured' | 'antiqued';

/** Meters covered by one repeat of the detail texture. */
export const DETAIL_TILE = 0.25;
const DETAIL_SIZE = 512;

/** Per face: the recipe in the detail tile's own u, v (0..1 over DETAIL_TILE), and its normal strength. */
const RECIPES: Record<DetailFace, { k: number; fn: (u: number, v: number) => { a: number; h: number; r: number } }> = {
  // Cleft slate: a fine crystalline grain of about 1.5 mm with a finer sparkle in it, mostly read through the light.
  slate: {
    k: 2.2,
    fn: (u, v) => {
      const g1 = vnoise(u * 164, v * 164, 164, 13);
      const g2 = vnoise(u * 330, v * 330, 330, 17);
      const g3 = vnoise(u * 41, v * 41, 41, 19);
      return { a: 1 + (g1 - 0.5) * 0.09 + (g2 - 0.5) * 0.05 + (g3 - 0.5) * 0.04, h: g1 * 0.55 + g2 * 0.3 + g3 * 0.6, r: (g1 - 0.5) * 0.08 };
    },
  },
  // Smooth cast face (Catalina Grana): dense paste with a 3 mm mottle and scattered fine sand grains, light and dark.
  smooth: {
    k: 0.9,
    fn: (u, v) => {
      const g = vnoise(u * 82, v * 82, 82, 5);
      const s = vnoise(u * 250, v * 250, 250, 7);
      const t = vnoise(u * 250, v * 250, 250, 9);
      const dark = s > 0.8 ? (s - 0.8) * 1.6 : 0, light = t > 0.82 ? (t - 0.82) * 1.4 : 0;
      return { a: 1 + (g - 0.5) * 0.08 - dark * 0.22 + light * 0.16, h: g * 0.35 - dark * 0.5 + vnoise(u * 160, v * 160, 160, 11) * 0.25, r: (g - 0.5) * 0.06 + dark * 0.05 };
    },
  },
  // Antiqued Flat Top's gently weathered smooth face: fine paste (about 3.5 mm), scattered sand grains, and fine pin
  // holes of 1 to 3 mm about 2 cm apart, as the pattern texture drew them before in its own (much coarser) texels.
  // Heights in the pattern texture's units (1 = about 4 mm): 4 mm over 0.49 mm texels.
  antiqued: {
    k: 8.2,
    fn: (u, v) => {
      const fine = vnoise(u * 71, v * 71, 71, 53);
      const vo = voronoi(u, v, 11, 59);
      const pin = vo.id > 0.95 ? 1 - smooth01(0.04, 0.13, vo.f1) : 0;
      const s = vnoise(u * 250, v * 250, 250, 61), t = vnoise(u * 250, v * 250, 250, 67);
      const dark = s > 0.82 ? (s - 0.82) * 1.4 : 0, light = t > 0.84 ? (t - 0.84) * 1.2 : 0;
      return { a: 1 + (fine - 0.5) * 0.05 - pin * 0.06 - dark * 0.16 + light * 0.12, h: fine * 0.03 - pin * 0.3 - dark * 0.02, r: (fine - 0.5) * 0.06 + pin * 0.08 };
    },
  },
  // Textured face: fine aggregate of about 2 mm with small dark pores.
  textured: {
    k: 1.6,
    fn: (u, v) => {
      const g = vnoise(u * 115, v * 115, 115, 7);
      const p = vnoise(u * 246, v * 246, 246, 11);
      const pore = p > 0.88 ? 1 : 0;
      return { a: 1 + (g - 0.5) * 0.16 - pore * 0.12, h: g * 0.6 - pore * 0.6, r: (g - 0.5) * 0.06 + pore * 0.05 };
    },
  },
};

const smooth01 = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const textures = new Map<DetailFace, THREE.DataTexture>();
let anisotropy = 8;
export function setDetailAnisotropy(n: number) {
  anisotropy = n;
  for (const t of textures.values()) t.anisotropy = n;
}

export function detailTexture(face: DetailFace): THREE.DataTexture {
  let t = textures.get(face);
  if (t) return t;
  const R = RECIPES[face];
  const px = paintPixels(DETAIL_SIZE, R.k, (u, v) => {
    const s = R.fn(u, v);
    return { h: s.h, c: [0.5 + (s.a - 1), 0, 0], r: 0.5 + s.r };
  });
  const n = DETAIL_SIZE * DETAIL_SIZE, data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    data[o] = px.albedo[o];
    data[o + 1] = px.normal[o];
    // paintPixels writes rows top first, as a canvas (flipped on upload); a DataTexture's first row is v = 0, so the
    // normal's y turns over.
    data[o + 2] = 255 - px.normal[o + 1];
    data[o + 3] = px.rough[o];
  }
  t = new THREE.DataTexture(data, DETAIL_SIZE, DETAIL_SIZE, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  textures.set(face, t);
  return t;
}

/** Meters an edge map's 8 bits span: distances from a piece's edge, 0 to 40 mm (0.16 mm steps). */
export const EDGE_RANGE = 0.04;

/**
 * A detailed paver's joints (built in engine/surfaces.ts, paverEdges): an n x n map of the distance from each point to
 * its piece's edge (0..EDGE_RANGE in 8 bits), and the affine map from geometry UVs in meters to the map's UVs.
 */
export interface PaverEdges {
  /** Cache key: maps with the same key are the same image (one layout, whatever the line or color). */
  key: string;
  size: number;
  /** Side of the full-size pattern texture the map is placed for (the shader waits for it, see uPavReady). */
  mapSize: number;
  /** Column-major 2 x 2 and offset: edge-map UV = e * uvMeters + off. */
  e: [number, number, number, number];
  off: [number, number];
  /** Half the joint (meters): the sand runs this far from a piece's edge. */
  joint: number;
  /** Width of the chamfer (meters), its steepest slope (normal x, y), and the band next to the joint whose color and
   *  relief come from just inside the piece instead of the pattern texture's own blurred joint. */
  bevel: number;
  slope: number;
  /** A worn, chipped edge (Antiqued Flat Top) instead of a clean chamfer. */
  worn: boolean;
  push: number;
  /** Joint sand, sRGB. */
  sand: [number, number, number];
  paint(): Uint8Array;
}

export interface PaverDetail {
  face: DetailFace;
  edges: PaverEdges;
}

const edgeMaps = new Map<string, { tex: THREE.DataTexture; E: PaverEdges }>();
function edgeTexture(E: PaverEdges): THREE.DataTexture {
  const have = edgeMaps.get(E.key);
  if (have) return have.tex;
  const t = new THREE.DataTexture(E.paint(), E.size, E.size, THREE.RedFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  // A distance changes smoothly, so it is read without mip levels (the shader stops using it before joints get thin).
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  // The pixels are only needed for the upload (a lost context paints them again, restorePaverDetail).
  t.onUpdate = () => {
    t.image.data = null;
  };
  t.needsUpdate = true;
  edgeMaps.set(E.key, { tex: t, E });
  return t;
}

/** Release one edge map (materials.ts keeps the most recently used few). */
export function disposeEdgeMap(key: string) {
  edgeMaps.get(key)?.tex.dispose();
  edgeMaps.delete(key);
}

/** The WebGL context came back: give every edge map its pixels again to upload. */
export function restorePaverDetail() {
  for (const { tex, E } of edgeMaps.values()) {
    tex.image.data = E.paint();
    tex.needsUpdate = true;
  }
}

/** The renderer is going away: release every detail and edge texture. */
export function disposePaverDetail() {
  for (const { tex } of edgeMaps.values()) tex.dispose();
  edgeMaps.clear();
  for (const t of textures.values()) t.dispose();
  textures.clear();
}

/**
 * The albedo factor of a face's detail at a point (meters), for drawing it into a swatch picture: the 3D view's two
 * samples, read from the detail texture's pixels (kept on the page).
 */
export function detailAlbedo(face: DetailFace, x: number, y: number): number {
  const d = detailTexture(face).image.data as Uint8Array;
  const at = (u: number, v: number) => {
    const i = ((((Math.floor(v * DETAIL_SIZE) % DETAIL_SIZE) + DETAIL_SIZE) % DETAIL_SIZE) * DETAIL_SIZE + (((Math.floor(u * DETAIL_SIZE) % DETAIL_SIZE) + DETAIL_SIZE) % DETAIL_SIZE)) * 4;
    return d[i] / 255;
  };
  const u = x / DETAIL_TILE, v = y / DETAIL_TILE;
  const u2 = (0.8 * u - 0.6 * v) * 1.37 + 0.31, v2 = (0.6 * u + 0.8 * v) * 1.37 + 0.57;
  return Math.max(0, 1 + at(u, v) + at(u2, v2) - 1);
}

/**
 * Give a paver material its close-range detail. `tileMeters` is the meters one repeat of its pattern texture covers
 * (its UVs are in meters, the maps repeat 1 / tileMeters). Chains any onBeforeCompile the material already has (or
 * gets later through patchDetail, as the pool cut copies do).
 */
export function applyPaverDetail(m: THREE.MeshStandardMaterial, detail: PaverDetail, tileMeters: number) {
  m.userData.paverDetail = { detail, tileMeters };
  patchDetail(m, m);
}

/*
 * The shader, near the camera (while the edge map is magnified or close to 1:1), redraws what the pattern texture can
 * only draw at its own texel size: the joints, cut sharp from the distance map with a pixel of antialiasing, and the
 * chamfer, a slope toward the joint across `bevel`. Next to a joint the pattern maps are read from just inside the
 * piece, so their own soft joint does not bleed sand into the face. Farther away, once a joint is narrower than about
 * a pixel, it fades to the pattern texture as it was, whose mip levels carry the joints without shimmer (a distance
 * map stays smooth when minified, so it needs no mip levels of its own). The fine grain
 * of the face comes from the detail tile, sampled twice at scales and angles that share no repeat.
 */
const FRAG_PARS = `
uniform sampler2D uPavDetail;
uniform float uPavTile;
uniform sampler2D uPavEdge;
uniform mat2 uPavE;
uniform vec2 uPavE0;
uniform float uPavEdgeN;
uniform float uPavTileM;
uniform vec4 uPavJoint; // half joint, chamfer, chamfer slope, push (meters)
uniform vec3 uPavSand;
uniform float uPavWorn;
uniform float uPavReady;
float pvHash( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
float pvNoise( vec2 x ) {
	vec2 i = floor( x ), f = fract( x );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( pvHash( i ), pvHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( pvHash( i + vec2( 0.0, 1.0 ) ), pvHash( i + 1.0 ), u.x ), u.y );
}`;

const FRAG_EDGE = `
#ifdef USE_NORMALMAP_TANGENTSPACE
	vec2 pvM = vNormalMapUv * uPavTileM;
	vec2 pvE = uPavE * pvM + uPavE0;
	float pvE1 = texture2D( uPavEdge, pvE ).r;
	float pvD = pvE1 * ${EDGE_RANGE.toFixed(4)} - uPavJoint.x;
	// On while a joint is wider than about a pixel; past that the pattern texture's own joints, mipmapped, take over.
	vec2 pvMx = dFdx( pvM ), pvMy = dFdy( pvM );
	float pvFp = max( length( pvMx ), length( pvMy ) );
	float pvOn = ( 1.0 - smoothstep( 1.0, 1.8, pvFp / ( 2.0 * uPavJoint.x ) ) ) * uPavReady;
	// Direction into the piece (UV meters): the distance's gradient, read a texel of the map along each axis.
	vec2 pvT = vec2( 1.0 / uPavEdgeN, 0.0 );
	vec2 pvGe = vec2( texture2D( uPavEdge, pvE + pvT.xy ).r, texture2D( uPavEdge, pvE + pvT.yx ).r ) - pvE1;
	vec2 pvG = transpose( uPavE ) * pvGe;
	float pvGl = length( pvG );
	vec2 pvDir = pvGl > 1e-9 ? pvG / pvGl : vec2( 0.0 );
	// A worn edge (Antiqued Flat Top), as the pattern texture paints it but in real size: the arris wanders a little
	// and chips break out of it, eating into the piece. The sand still fills only the real joint (pvRim); a chip is a
	// low notch of rougher, lighter broken concrete. Noise in meters, so it never repeats.
	float pvRim = pvD, pvChip = 0.0;
	vec2 pvDirW = pvDir;
	if ( uPavWorn > 0.5 ) {
		float wob = pvNoise( pvM * 20.0 + 3.1 ) - 0.5;
		float cn = pvNoise( pvM * 33.0 + 7.7 ) * 0.75 + pvNoise( pvM * 91.0 + 1.3 ) * 0.25;
		float chip = smoothstep( 0.6, 0.8, cn );
		float eat = max( 0.0, wob ) * 0.003 + chip * ( 0.004 + 0.009 * cn );
		pvD -= eat;
		pvChip = chip * ( 1.0 - smoothstep( 0.002, 0.02, pvRim ) );
		// The chip's own walls face out of the chip: the gradient of what it eats, from its screen derivatives.
		float pvDt = pvMx.x * pvMy.y - pvMx.y * pvMy.x;
		vec2 gEat = abs( pvDt ) > 1e-14 ? inverse( mat2( pvMx.x, pvMy.x, pvMx.y, pvMy.y ) ) * vec2( dFdx( eat ), dFdy( eat ) ) : vec2( 0.0 );
		vec2 g = pvDir - gEat;
		pvDirW = length( g ) > 1e-6 ? normalize( g ) : pvDir;
	}
	// A clean joint is cut a pixel wide; a worn one's sand meets the face over about a millimeter.
	float pvSoft = uPavWorn > 0.5 ? max( fwidth( pvRim ), 0.0012 ) : max( fwidth( pvRim ), 1e-6 );
	float pvJm = clamp( 0.5 - pvRim / pvSoft, 0.0, 1.0 ) * pvOn;
	pvChip *= pvOn * ( 1.0 - pvJm );
	// The floor of a chip, below the face: where the worn edge has receded but the joint has not.
	float pvFloor = uPavWorn * ( 1.0 - smoothstep( -0.0006, 0.0006, pvD ) ) * pvOn * ( 1.0 - pvJm );
	vec2 pvUv = vNormalMapUv + pvDir * ( max( 0.0, uPavJoint.w - pvRim ) * pvOn / uPavTileM );
	float pvX = clamp( pvD / uPavJoint.y, 0.0, 1.0 );
	// The slope across the edge: a clean chamfer's, or a worn round's (with the chip floor flat below it).
	float pvTilt = uPavJoint.z * ( uPavWorn > 0.5 ? 6.0 * pvX * ( 1.0 - pvX ) * step( 0.0, pvD ) : 4.0 * pvX * ( 1.0 - pvX ) ) * pvOn * ( 1.0 - pvJm );
#else
	vec2 pvUv = vMapUv;
#endif`;

const FRAG_DETAIL = `
#ifdef USE_NORMALMAP_TANGENTSPACE
	diffuseColor.rgb = mix( diffuseColor.rgb, mix( diffuseColor.rgb, vec3( 0.34, 0.31, 0.27 ), 0.25 ) * 1.04, pvChip * 0.1 );
	// A worn round falls away from the light a little, the chip floor sits in its own shade, and the crevice where the
	// round meets the sand is darker still.
	float pvCrev = 1.0 - smoothstep( 0.0, 0.0018, pvRim );
	diffuseColor.rgb *= 1.0 - uPavWorn * ( ( 1.0 - smoothstep( 0.0, uPavJoint.y, pvD ) ) * 0.08 + pvCrev * 0.18 ) * pvOn * ( 1.0 - pvJm ) - pvFloor * 0.22;
	// Worn joints are a little sunken, so their sand reads darker.
	diffuseColor.rgb = mix( diffuseColor.rgb, uPavSand * ( 1.0 - 0.2 * uPavWorn ), pvJm );
	vec2 pdUv = vNormalMapUv * uPavTile;
	const mat2 pdRot = mat2( 0.8, 0.6, -0.6, 0.8 );
	vec4 pdA = texture2D( uPavDetail, pdUv );
	vec4 pdB = texture2D( uPavDetail, pdRot * pdUv * 1.37 + vec2( 0.31, 0.57 ) );
	diffuseColor.rgb *= max( vec3( 0.0 ), vec3( 1.0 + ( pdA.r + pdB.r - 1.0 ) ) );
	// The second sample's slope turns back to the surface's axes (and grows with its scale).
	vec2 pdN = ( pdA.gb * 2.0 - 1.0 ) + transpose( pdRot ) * ( pdB.gb * 2.0 - 1.0 ) * 1.37;
	float pdR = pdA.a + pdB.a - 1.0;
#endif`;

const uvSwap = (chunk: string, varying: string) => chunk.split(varying).join('pvUv');

/**
 * Install the detail shader hook of `from` (if it has one) on `m`, ahead of any hook `m` already has. A material clone
 * (pools.cutMaterial) calls this so the copy keeps the detail: three's clone copies userData but not the hook.
 */
export function patchDetail(m: THREE.Material, from: THREE.Material) {
  const d = from.userData.paverDetail as { detail: PaverDetail; tileMeters: number } | undefined;
  if (!d) return;
  m.userData.paverDetail = d;
  const E = d.detail.edges;
  const sand = new THREE.Color().setRGB(E.sand[0], E.sand[1], E.sand[2], THREE.SRGBColorSpace);
  const uniforms = {
    uPavDetail: { value: detailTexture(d.detail.face) },
    uPavTile: { value: d.tileMeters / DETAIL_TILE },
    uPavEdge: { value: edgeTexture(E) },
    uPavE: { value: new THREE.Matrix2().fromArray(E.e) },
    uPavE0: { value: new THREE.Vector2(E.off[0], E.off[1]) },
    uPavEdgeN: { value: E.size },
    uPavTileM: { value: d.tileMeters },
    uPavJoint: { value: new THREE.Vector4(E.joint, E.bevel, E.slope, E.push) },
    uPavSand: { value: new THREE.Vector3(sand.r, sand.g, sand.b) },
    uPavWorn: { value: E.worn ? 1 : 0 },
    // Off until the full-size pattern maps are in: the quick low-resolution copy first shown sits half a (larger) texel
    // apart, so its joints would not meet the edge map's.
    uPavReady: {
      get value() {
        const img = (m as THREE.MeshStandardMaterial).map?.image as { width?: number } | undefined;
        return (img?.width ?? 0) >= E.mapSize ? 1 : 0;
      },
    },
  };
  const before = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    Object.assign(s.uniforms, uniforms);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>${FRAG_PARS}`)
      .replace('#include <map_fragment>', `${FRAG_EDGE}\n${uvSwap(THREE.ShaderChunk.map_fragment, 'vMapUv')}\n${FRAG_DETAIL}`)
      .replace(
        '#include <roughnessmap_fragment>',
        `${uvSwap(THREE.ShaderChunk.roughnessmap_fragment, 'vRoughnessMapUv')}\n#ifdef USE_NORMALMAP_TANGENTSPACE\n\troughnessFactor = clamp( mix( roughnessFactor + pvChip * 0.18, 1.0, pvJm ) + pdR, 0.04, 1.0 );\n#endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        uvSwap(THREE.ShaderChunk.normal_fragment_maps, 'vNormalMapUv').replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale;\n\tmapN.xy += ( pdN - pvDirW * pvTilt ) * normalScale;'),
      );
    before.call(m, s, r);
  };
  // One program for every detailed paver: everything that differs is a uniform.
  m.customProgramCacheKey = () => 'paver-detail';
}
