import type { FeatureSpec } from './catalog';
import type { FinishId, FixtureSpec } from './truscapes';

/**
 * Vista Professional Outdoor Lighting (vistapro.com, Simi Valley, CA): the low-voltage bollard, up light and WiFi
 * transformer Green Lion buys through SiteOne. Each is drawn to Vista's own spec sheet (sizes in inches) by
 * builder/vistalights.ts and lit at night by engine/landlights.ts like the Tru-Scapes line (siteplan/truscapes.ts).
 *
 * Sources (all Vista's own):
 *   BR-2500  vistapro.com/lex-cms/product/18266-2500, spec sheet "MODEL 2500 Commercial Series Bollard" REV 12.11.24
 *            (2500-cspec.pdf), landscape spec 2500 6.23.20, install sheet 2500 6.16.20, photometrics 2500-pm.pdf
 *            (residential.vistapro.com/lex-cms/product/262407-2500), product photo 2500-B.jpg.
 *   GR-5006  vistapro.com/lex-cms/product/19623-5006, spec sheet "MODEL 5006 Commercial Series" REV 12.10.24
 *            (5006-ik-cspec.pdf) and dimension drawing 5006-IK-Dims.jpg, landscape spec 5006 8.21.19 (the same head on
 *            the earlier composite knuckle), product photo 5006-B-IK.jpg, finish chart LT1810 (02/24).
 *   TCS-300  vistapro.com/lex-cms/product/292924-tcs-series, spec sheet "TCS Series" REV 06.11.24 (tcs-series-spec.pdf),
 *            mounting template REV 10.15.24, TCS-300 flyer LT20122 (8/20), product photo cropped_TCS-300.jpg.
 *   Lamp     LN16-4.5-W-36-A-LED, Vista's MR-16 LED: 4.5 W, 295 lumens, 85 CRI (lamp spec REV 02.13.24 rates the "Warm"
 *            lamps 3000 K nominal; SiteOne's bill for these fixtures lists them 2950 K, so 2950 K is drawn).
 */

/** Vista's finishes as drawn: matte textured polyester powder coat (Vista finish chart LT1810), clear-coated stainless. */
export const VISTA_FINISHES: Partial<Record<FinishId, { name: string; code: string; color: string; roughness: number; metalness: number; grain: number }>> = {
  // Black (B): a fine sand-texture black, read from the chart's swatch and the product photos.
  black: { name: 'Black (B) textured powder coat', code: 'B', color: '#1d1d1e', roughness: 0.66, metalness: 0.08, grain: 0.3 },
  // The TCS enclosure: 20-gauge 304 stainless, polished and clear powder coated (TCS spec "clear powder coat finish standard").
  stainless: { name: 'Clear powder coat on polished 304 stainless', code: 'Clear', color: '#8e8d88', roughness: 0.44, metalness: 0.8, grain: 0 },
};

const PAGE = 'https://vistapro.com/lex-cms/product/';
const LAMP = 'MR-16 LED, 4.5 W, 295 lumens, 2950 K warm white (Vista LN16-4.5-W-36-A-LED), 9-15 VAC';

export const VISTA: FixtureSpec[] = [
  {
    maker: 'Vista', model: 'BR-2500', series: 'Bollard', category: 'Path lights', family: 'vistaBollard', mount: 'stake',
    // 2-1/8 in dia x 16 in (spec sheet). From the dimension drawing: a 5/8 in die-cast cap with a slight dome, a 2-7/8 in
    // clear machined acrylic column lens, and the extruded post (1/8 in wall) below; the photo shows a frosted inner
    // sleeve about 1-1/2 in across inside the clear acrylic.
    //
    // Light: Vista's photometrics for the 2500 (MR-16, "Horizontal Quarter Spread") chart the ground at 1.4 fc at 1 ft,
    // 0.4 fc at 2 ft and 0.2 fc at 3 ft, dimming past 4 ft. The lamp shines into the cap and the column sends it out and
    // down, the post shading the ground right at its foot: a ring beam (engine/landlights.ts) doubling from straight
    // down to level fits those three readings within a quarter (1.4, 0.5, 0.2 fc). That beam carries 33 lumens of the
    // lamp's 295 below level (the rest leaves level or is lost in the cap); `beamLm` is that fit.
    dims: { height: 16, d: 2.125, capH: 0.625, dome: 0.1, lensH: 2.92, coreD: 1.55, beamLm: 33, spread: 170, cutoff: 176, range: 4 },
    finishes: ['black'], lumens: 295, kelvin: 2950, beamDeg: 170, tiltDeg: 0, watts: 4.5,
    lamp: `${LAMP}, 36 degree flood lamp inside a clear acrylic column lens (light all round)`,
    construction: 'Die-cast A360 aluminum cap and heavy-gauge extruded aluminum post (1/8 in wall), clear machined acrylic lens, stainless fasteners',
    page: `${PAGE}18266-2500`, size: '16 in tall, 2-1/8 in round', footprint: [0.07, 0.07], facts: [],
  },
  {
    maker: 'Vista', model: 'GR-5006', series: 'Up & Accent Light', category: 'Accent lights', family: 'vistaUplight', mount: 'stake',
    // 2-5/8 in dia x 6-1/8 in overall (spec sheet REV 12.10.24, knuckle to shroud tip). From the dimension drawings: a
    // 1-1/4 in tapered rear housing (2-3/16 in at the back), the screwless locking shroud 2-7/8 in long on top and 1-7/8 in
    // underneath with its mouth cut in a soft curve, the glass about 5/16 in inside it, and the Infinity Knuckle: a
    // 1-5/8 in round arm to the pivot 1-1/4 in behind the housing, on a 1-1/2 in square stem block with a 1/2 in NPT
    // stainless stem into the ABS ground stake.
    dims: { d: 2.625, rearD: 2.18, housingL: 1.24, armD: 1.62, armL: 1.22, shroudLong: 2.87, shroudShort: 1.92, lensIn: 0.32, blockW: 1.5, blockH: 1.66, cutoff: 90, range: 10 },
    finishes: ['black'], lumens: 295, kelvin: 2950, beamDeg: 36, beams: [36, 15, 25, 60], tiltDeg: 15, watts: 4.5,
    lamp: `${LAMP}, 36 degree flood (15, 25 and 60 degree lamps offered), behind clear tempered glass`,
    construction: 'Die-cast A360 copper-free aluminum housing and screwless locking shroud, aluminum Infinity Knuckle with a stainless 1/2 in NPT stem, stainless fasteners',
    page: `${PAGE}19623-5006`, size: '6-1/8 in long, 2-5/8 in round', footprint: [0.08, 0.08], facts: [],
  },
  {
    maker: 'Vista', model: 'TCS-300', series: 'TCS WiFi Control System Transformer', category: 'Transformers', family: 'vistaTransformer', mount: 'wall',
    // 10-3/8 in W x 10-3/8 in H (9-7/8 in cabinet over a 1/2 in mounting flange) x 5-1/4 in D (TCS spec REV 06.11.24).
    // The stub antenna on top, the label plate, the hasp, side louvers and knockouts are from the drawing and photo.
    // Mounting template: the bottom at least 18 in above the ground.
    dims: { width: 10.375, height: 10.375, cabinetH: 9.875, depth: 5.25, door: 0.88 },
    finishes: ['stainless'], lumens: 0, kelvin: 2950, beamDeg: 0, tiltDeg: 0, watts: 300,
    lamp: '300 W multi-tap (11-15 V) in four zones: three dimmable app zones with astronomical timing and a 15 V Smart Zone always on; WiFi 2.4 GHz to 100 ft, Vista Cloud app; 6 ft cord',
    construction: '20-gauge 304 stainless steel enclosure, NEMA 3R, clear powder coat, swing-down bottom with cable raceway',
    page: `${PAGE}292924-tcs-series`, size: '10-3/8 in wide x 10-3/8 in tall x 5-1/4 in deep', footprint: [0.264, 0.133], facts: [], mountDefault: 18 * 0.0254,
  },
];

const MOUNT_WORDS: Record<string, string> = {
  'BR-2500': 'Aluminum mounting base on the included ABS ground stake (a concrete footing is Vista\'s recommendation for a permanent install)',
  'GR-5006': 'ABS ground stake (GR); also offered on a wall canopy (WR) or tree-mount box (TR)',
  'TCS-300': 'Wall or post mount on #10 screws, the bottom at least 18 in above the ground (Vista mounting template)',
};

for (const fx of VISTA) {
  const fin = fx.finishes.map((f) => VISTA_FINISHES[f]?.name.toLowerCase() ?? f).join(' or ');
  const light = fx.lumens > 0
    ? `${fx.lumens} lumen lamp, ${fx.kelvin} K, ${fx.family === 'vistaBollard' ? 'light all round from the column lens, out and down' : `${fx.beamDeg} degree beam`}${fx.beams && fx.beams.length > 1 ? ` (${fx.beams.slice().sort((a, b) => a - b).join(', ')} degree lamps)` : ''}`
    : `${fx.watts} W low-voltage WiFi transformer`;
  fx.facts = [fx.size, light, fx.lamp, `${fx.construction}; ${fin}`, MOUNT_WORDS[fx.model] ?? ''];
}

/** The catalog entries, in the Lighting group after the Tru-Scapes line. */
export function vistaFeatures(): Omit<FeatureSpec, 'placeholder'>[] {
  return VISTA.map((fx) => ({
    id: `vista-${fx.model.toLowerCase()}`,
    name: `Vista ${fx.series} ${fx.model}`,
    group: 'Lighting',
    kind: 'landscapeLight',
    footprint: fx.footprint,
    maker: 'Vista Professional Outdoor Lighting',
    page: fx.page,
    about: `Vista ${fx.series} (${fx.model}): ${fx.construction}. ${fx.lamp}.`,
    facts: fx.facts,
    fixture: fx,
  }));
}
