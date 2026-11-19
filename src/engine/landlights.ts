import * as THREE from 'three';

/**
 * Landscape lighting: many small aimed lights (up lights, path lights, wall washers, step lights), each with a real
 * beam. The studio's eight point lights are kept for fire, water, porch and pergola lights; a lit yard has 20 to 60
 * fixtures, so these get their own pool.
 *
 * Every lit material (standard, physical, lambert, phong, toon, including patched ones like foliage and the ground)
 * gets one extra loop in its light pass over a shared uniform array. The loop runs only as far as the number of
 * fixtures actually on, so by day it costs nothing, and a light whose reach or beam misses the pixel is skipped
 * after a distance test. There are no shadows from these lights.
 *
 * Beam: a fixture's published beam angle is where the light falls to half of its center (the usual LED spec). The
 * beam is modeled as I(t) = I0 * 2^-((1 - cos t) / (1 - cos h)) for half angle h, which is 50% at the beam edge and
 * fades smoothly past it like a real reflector or optic, then is cut to zero at the fixture's cutoff (its shroud,
 * hood or hat). Intensity is set from the fixture's lumens so the total light leaving it matches the spec.
 */

/** Up to this many fixtures light the scene at once (the closest to the view when a yard has more). */
export const LAND_LIGHT_LIMIT = 64;

export interface LandLight {
  /** World position of the light's source (just in front of the lens). */
  position: THREE.Vector3;
  /** Unit vector the beam's axis points along. */
  direction: THREE.Vector3;
  /** Full beam angle in degrees (to half intensity). */
  beamDeg: number;
  /** Full cutoff angle in degrees: no light past it (shroud, hood or hat). */
  cutoffDeg: number;
  /** Light leaving the fixture, lumens. */
  lumens: number;
  /** Color temperature, kelvin. */
  kelvin: number;
  /** RGB color '#rrggbb' of a color-changing fixture set to a color; it replaces `kelvin`. */
  color?: string;
  /** Reach in meters, past which the light is dropped (it is faded out before). */
  range: number;
  /**
   * Brightest away from the axis, not on it (a bollard's column lens throws its light out and down): the intensity
   * doubles from the axis to `beamDeg / 2` (instead of halving) and keeps rising to the cutoff.
   */
  ring?: boolean;
  /** Switched off by hand in the 3D view (builder/actions.ts): left out of the pool. */
  off?: boolean;
}

const STRIDE = 12; // three vec4 per light
let limit = 0;
const data = new Float32Array(LAND_LIGHT_LIMIT * STRIDE);
/** x: lights on, y: overall gain (night factor x scene scale). */
const info = new Float32Array(4);
let patched = false;

/**
 * Scene units per candela. The studio's night is exposed like a night photograph, so a real fixture's candela is
 * scaled down to the scene's light level (fitted so a 2700 K up light on a stucco wall and a path light's pool read
 * the way they do in photos of finished installs).
 */
export const CANDELA_TO_SCENE = 0.09;

/** Scene illuminance a single fixture's light eases toward on surfaces right at its lens (see the shader). */
const LAND_KNEE = 20;

/**
 * Patch the shader chunks once, before any lit material is compiled. `maxFragmentUniforms` is the renderer's
 * MAX_FRAGMENT_UNIFORM_VECTORS: the array takes three vectors per light and three's own lights and materials
 * need about 250, so a device with few uniforms gets fewer (or no) landscape lights rather than a broken shader.
 */
export function initLandLights(maxFragmentUniforms: number) {
  if (patched) return;
  patched = true;
  limit = Math.max(0, Math.min(LAND_LIGHT_LIMIT, Math.floor((maxFragmentUniforms - 256) / 3)));
  if (limit < 4) {
    limit = 0;
    return;
  }
  const decl = `
uniform vec4 uLand[ ${limit * 3} ];
uniform vec4 uLandInfo;
`;
  THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin + decl;
  const loop = /* glsl */ `
#if defined( RE_Direct )
{
	int landN = int( uLandInfo.x );
	if ( landN > 0 ) {
		vec3 landW = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		for ( int i = 0; i < ${limit}; i ++ ) {
			if ( i >= landN ) break;
			vec4 la = uLand[ i * 3 ];
			vec3 lv = la.xyz - landW;
			float d2 = dot( lv, lv );
			if ( d2 >= la.w * la.w ) continue;
			vec4 lb = uLand[ i * 3 + 1 ];
			float d = sqrt( d2 );
			vec3 l = lv / max( d, 1e-4 );
			float c = dot( - l, lb.xyz );
			if ( c <= lb.w ) continue;
			vec4 lc = uLand[ i * 3 + 2 ];
			float beam = exp2( - ( 1.0 - c ) * lc.w ) * smoothstep( lb.w, lb.w + ( 1.0 - lb.w ) * 0.18, c );
			float reach = saturate( 1.0 - pow4( d / la.w ) );
			// Highlight roll-off: a surface a few centimeters from a lens (a wall under a cap light) would be lit tens of
			// times brighter than anything else and bloom into a ball; it eases toward LAND_KNEE the way a photo's
			// highlights do, and leaves ordinary levels (a lit tree, a path light's pool) nearly as they are.
			float landE = uLandInfo.y * beam * reach * reach / max( d2, 0.01 );
			float landPeak = max( lc.r, max( lc.g, lc.b ) ) * landE;
			float landSoft = landPeak > 1e-6 ? ${LAND_KNEE.toFixed(1)} * ( 1.0 - exp( - landPeak / ${LAND_KNEE.toFixed(1)} ) ) / landPeak : 1.0;
			directLight.color = lc.rgb * ( landE * landSoft );
			directLight.direction = normalize( ( viewMatrix * vec4( l, 0.0 ) ).xyz );
			directLight.visible = true;
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
			#ifdef GS_LEAF
			// Leaves lit from below or behind glow through, as with the sun (engine/foliage.ts), and light scattered
			// inside a canopy reaches leaves turned every way: an up light makes a narrow column (a cypress) glow,
			// though its leaves face sideways to a beam that comes almost straight up.
			float landBack = pow( max( dot( - directLight.direction, normalize( vViewPosition ) ), 0.0 ), 3.0 );
			float landWrap = max( dot( - geometryNormal, directLight.direction ), 0.0 );
			float landScatter = 0.5 + 0.5 * dot( geometryNormal, directLight.direction );
			reflectedLight.directDiffuse += diffuseColor.rgb * directLight.color * ( uTranslucency * ( landBack * 0.9 + landWrap * 0.35 ) + 0.35 * landScatter );
			#endif
		}
	}
}
#endif
`;
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const at = chunk.indexOf('#if defined( RE_IndirectDiffuse )');
  THREE.ShaderChunk.lights_fragment_begin = at < 0 ? chunk + loop : chunk.slice(0, at) + loop + chunk.slice(at);
  // Every material built on these libraries shares the same two arrays: three copies a typed-array uniform by
  // reference when it clones a library's uniforms for a material, so one write reaches them all.
  for (const id of ['standard', 'physical', 'lambert', 'phong', 'toon'] as const) {
    const lib = THREE.ShaderLib[id];
    if (!lib) continue;
    lib.uniforms.uLand = { value: data.subarray(0, limit * STRIDE) };
    lib.uniforms.uLandInfo = { value: info };
  }
}

/** How many landscape lights this device can show at once (0 when its shaders have too few uniforms). */
export function landLightLimit(): number {
  return limit;
}

/** Linear RGB of a warm-white LED at a color temperature, white balanced the way a night photo of a yard is. */
export function kelvinColor(k: number, out = new THREE.Color()): THREE.Color {
  const t = Math.max(1800, Math.min(6500, k)) / 100;
  const r = 255;
  const g = Math.max(0, Math.min(255, 99.4708 * Math.log(t) - 161.1196));
  const b = t <= 19 ? 0 : Math.max(0, Math.min(255, 138.5177 * Math.log(t - 10) - 305.0448));
  out.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  // Photos of lit yards are balanced near 3400 K, so 2700 K reads warm, not orange.
  const wb = new THREE.Color().setRGB(1, 0.74, 0.55, THREE.SRGBColorSpace);
  out.r /= wb.r;
  out.g /= wb.g;
  out.b /= wb.b;
  const m = Math.max(out.r, out.g, out.b);
  return out.multiplyScalar(1 / m);
}

/**
 * Linear RGB of a fixture's light: its RGB color when set (an RGBCW lamp), else its white at `kelvin`. Scaled so the
 * brightest channel is 1, as `kelvinColor` is.
 */
export function lightColor(kelvin: number, color?: string, out = new THREE.Color()): THREE.Color {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return kelvinColor(kelvin, out);
  out.setStyle(color, THREE.SRGBColorSpace);
  const m = Math.max(out.r, out.g, out.b);
  return m > 1e-4 ? out.multiplyScalar(1 / m) : kelvinColor(kelvin, out);
}

/** Peak (center) candela of a beam carrying `lumens`, for the beam shape above (a ring beam's on its axis). */
export function peakCandela(lumens: number, beamDeg: number, cutoffDeg: number, ring = false): number {
  const a = Math.max(1e-4, 1 - Math.cos((beamDeg * Math.PI) / 360));
  const umax = 1 - Math.cos((Math.min(179, cutoffDeg) * Math.PI) / 360);
  const flux = ((2 * Math.PI * a) / Math.LN2) * (ring ? Math.pow(2, umax / a) - 1 : 1 - Math.pow(2, -umax / a));
  return lumens / Math.max(1e-4, flux);
}

/**
 * The landscape lights of a built yard. `set` takes a new list, `update` picks the ones to show for a camera
 * (all of them when they fit) and writes the shared arrays; `setGain` follows the night.
 */
export class LandLightPool {
  private lights: LandLight[] = [];
  private packed: Float32Array = new Float32Array(0);
  private lastPick = new THREE.Vector3(Infinity, 0, 0);
  private gain = 0;

  set(lights: LandLight[]) {
    this.lights = lights;
    this.packed = new Float32Array(lights.length * STRIDE);
    const col = new THREE.Color();
    lights.forEach((l, i) => {
      const o = i * STRIDE;
      const half = Math.min(170, l.beamDeg) / 2;
      // A ring beam rises toward its cutoff, so the cutoff may sit inside its half angle.
      const cut = l.ring ? Math.min(89, l.cutoffDeg / 2) : Math.max(half * 1.05, Math.min(178, l.cutoffDeg) / 2);
      const dir = l.direction.clone().normalize();
      const cd = (l.ring ? peakCandela(l.lumens, l.beamDeg, cut * 2, true) : peakCandela(l.lumens, l.beamDeg, l.cutoffDeg)) * CANDELA_TO_SCENE;
      lightColor(l.kelvin, l.color, col).multiplyScalar(cd);
      this.packed.set([l.position.x, l.position.y, l.position.z, l.range], o);
      this.packed.set([dir.x, dir.y, dir.z, Math.cos((cut * Math.PI) / 180)], o + 4);
      // The shader's falloff exp2(-(1 - cos t) * w): a negative w makes a ring beam grow away from its axis.
      this.packed.set([col.r, col.g, col.b, (l.ring ? -1 : 1) / Math.max(1e-4, 1 - Math.cos((half * Math.PI) / 180))], o + 8);
    });
    this.lastPick.set(Infinity, 0, 0);
    this.write(null);
  }

  get count(): number {
    return this.lights.length;
  }

  /** Overall gain: 0 by day, the night factor after dark. */
  setGain(g: number) {
    this.gain = g;
    info[1] = g;
    info[0] = g > 0 ? Math.min(limit, this.lights.length) : 0;
  }

  /**
   * With more fixtures than the device can show, keep the ones nearest to where the camera looks, re-picked when
   * the view has moved a couple of meters. Returns true when the set changed.
   */
  update(focus: THREE.Vector3): boolean {
    if (this.lights.length <= limit) return false;
    if (focus.distanceTo(this.lastPick) < 2) return false;
    this.lastPick.copy(focus);
    this.write(focus);
    return true;
  }

  private write(focus: THREE.Vector3 | null) {
    const n = Math.min(limit, this.lights.length);
    if (!focus || this.lights.length <= limit) {
      data.set(this.packed.subarray(0, n * STRIDE));
    } else {
      const order = this.lights.map((l, i) => ({ i, d: l.position.distanceToSquared(focus) - l.range * l.range }));
      order.sort((a, b) => a.d - b.d);
      for (let k = 0; k < n; k++) data.set(this.packed.subarray(order[k].i * STRIDE, order[k].i * STRIDE + STRIDE), k * STRIDE);
    }
    this.setGain(this.gain);
  }
}
