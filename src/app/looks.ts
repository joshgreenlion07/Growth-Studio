// A catalog material as the parent page (Area Planner) sees it: what it is, its colors and sizes, a plain description
// and typical install, and, for a maker's line, the maker's product page and swatch photo. Used by the `ready` looks
// list and the material pointer, which also describes plants, water, structures, features and uploaded models
// (lookOfPoint) and adds a picture rendered from the 3D material itself (swatches.ts).
import { CONTAINERS, featureById, layingName, layingsFor, materialById, plantById, type MaterialSpec } from '../siteplan/catalog';
import { BELGARD_MEDIA, makerImage } from '../siteplan/belgard-media';
import { BASALITE_MEDIA, basaliteImage } from '../siteplan/basalite-media';
import { deckMedia } from '../siteplan/decking';
import { STRUCTURE_NAMES, WATER_NAMES, materialInfo, pointKind } from '../siteplan/material-info';
import type { SitePlan, WaterKind } from '../siteplan/types';

export interface Look {
  id: string;
  name: string;
  /** What it is: 'material' (a catalog surface) or 'plant', 'water', 'structure', 'feature', 'model'. */
  kind: 'material' | 'plant' | 'water' | 'structure' | 'feature' | 'model';
  /** Catalog use (turf, bed, hardscape, border, wall, fence, edging), or the kind for things that are not materials. */
  use: string;
  /** The group it sits in: "Mulch and rock", "Concrete", "Synthetic turf", "Shrubs", "Water". */
  group: string;
  /** A sentence or two in plain language. */
  about: string;
  /** Typical install or plant facts, one line each ("3 in deep, raked even"). */
  spec: string[];
  /** Botanical name, for a plant. */
  botanical?: string;
  maker: string;
  line: string;
  shelf: string;
  color: string;
  sw: string;
  laying?: true;
  /** A generic large-format cast slab: the look a one-slab pad takes when no maker's unit is its size. For pads only. */
  padSlab?: true;
  /** The laying patterns the paver offers, the default first. */
  layings?: { id: string; name: string }[];
  /** Four colors, light to dark, averaged from the maker's swatch. */
  palette: string[];
  /** Bed fills: 'bark', 'humus' (humus, compost, dirt), 'rock' (rock, gravel, pebble) or 'dg'. */
  fillType?: 'bark' | 'humus' | 'rock' | 'dg';
  /** Bed fills: the depth it is usually spread, inches. */
  depthIn?: number;
  /** Rock, gravel and DG: tons per cubic yard (left out for bark and soil, ordered by the yard). */
  tonsPerCuYd?: number;
  /** Piece face sizes in inches. */
  sizes?: [number, number][];
  /** Sizes as the maker lists them, with thickness. */
  sizeText?: string[];
  thicknessIn?: number;
  face?: string;
  /** The maker's swatch photo for this color, loaded live from the maker's site. */
  image?: string;
  /** The maker's product page. */
  page?: string;
  /**
   * A picture made by the studio from the 3D material itself (its painted texture, or a rendered plant), as a
   * data: URL. Sent in a second `point` message once it is ready; never in the `ready` list.
   */
  swatch?: string;
}

const IN = 0.0254;
/** The shelf a generic look sits on, by use (beds by recipe, below). */
const SHELF: Record<string, string> = { wall: 'Retaining walls', edging: 'Curb', fence: 'Fences', hardscape: 'Pavers', border: 'Pavers' };

/** MSI Evergrass turf product pages (no photos are loaded for turf). */
const TURF_PAGE: Record<string, string> = {
  'msi-summer-gold-96': 'https://www.msisurfaces.com/evergrass-turf/summer-gold-96/',
  'msi-viridian-91': 'https://www.msisurfaces.com/evergrass-turf/viridian-turf-91oz/',
  'msi-viridian-pet-96': 'https://www.msisurfaces.com/evergrass-turf/viridian-turf-96oz/',
};

/** Lines that take their maker page and photos from another line. */
const MEDIA_LINE: Record<string, string> = { 'Dimensions Slabs 24 x 24': 'Dimensions Slabs' };
/** Sizes Belgard lists on a page where the size picker is empty. */
const SIZE_TEXT: Record<string, string[]> = { 'Dimensions Slabs 24 x 24': ['24 x 24 x 2 3/8"'] };

export function lookOf(m: MaterialSpec): Look {
  // A "same color" border (border-of-<paver>) takes its line and color from the paver it follows.
  const base = m.id.startsWith('border-of-') ? materialById.get(m.id.slice('border-of-'.length)) : undefined;
  const tag = base ?? m;
  const maker = tag.maker ?? '', line = tag.line ?? '', color = tag.color ?? m.name;
  // A line made from part of a Belgard line (the 24 x 24 slab of Dimensions Slabs) shares that line's page and photos.
  const mediaLine = MEDIA_LINE[line] ?? line;
  const media = maker === 'Belgard' ? BELGARD_MEDIA[mediaLine] : maker === 'Basalite' ? BASALITE_MEDIA[mediaLine] : undefined;
  const sizes = m.pattern?.sizes;
  const border = m.use === 'border';
  // Belgard lists every set of a line together (the main set, a small set, the border stone); keep the listing whose
  // pieces are exactly this material's pieces, compared without order.
  const want = (border ? [[6, 9]] : sizes ?? []).map(([a, b]) => `${Math.min(a, b)}x${Math.max(a, b)}`).sort().join(' ');
  const piecesOf = (t: string) => [...t.matchAll(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x/g)].map((x) => { const a = +x[1], b = +x[2]; return `${Math.min(a, b)}x${Math.max(a, b)}`; });
  const sizeText = want ? media?.sizes.filter((t) => [...new Set(piecesOf(t))].sort().join(' ') === want) : undefined;
  const info = materialInfo(m);
  const look: Look = {
    id: m.id,
    name: m.name,
    kind: 'material',
    use: m.use,
    group: info.group,
    about: info.about,
    spec: info.spec,
    maker,
    line,
    shelf: tag.shelf ?? SHELF[m.use] ?? (m.use === 'bed' ? (m.recipe === 'mulch' || m.crumb ? 'Bed fill' : m.recipe === 'dg' && m.id === 'decomposed-granite' ? 'Decomposed granite' : 'Rock') : m.group),
    color,
    sw: m.palette[1] ?? m.palette[0],
    palette: m.palette.slice(0, 4),
  };
  if (m.fillType) {
    look.fillType = m.fillType;
    if (m.depthIn) look.depthIn = m.depthIn;
    if (m.tonsPerCuYd) look.tonsPerCuYd = m.tonsPerCuYd;
  }
  const lays = layingsFor(m);
  if (lays.length) {
    look.laying = true;
    look.layings = lays.map((k) => ({ id: k, name: layingName(m, k) }));
  }
  if (m.padSlab) look.padSlab = true;
  if (sizes?.length && !m.padSlab) look.sizes = sizes.map(([a, b]) => [a, b]);
  if (m.padSlab) look.sizeText = ['Cast to the size of the pad, 2 in thick'];
  else if (sizeText?.length) look.sizeText = sizeText;
  else if (SIZE_TEXT[line]) look.sizeText = SIZE_TEXT[line];
  // Basalite lists sizes in millimeters with inches (Premier Slab: 594 x 594 x 60 mm).
  else if (maker === 'Basalite' && media?.sizes.length) look.sizeText = media.sizes.slice();
  // A curb has no paver sizes: show the unit as Belgard lists it (Melville Curb: 4 x 24 x 6 1/2 in).
  else if (m.recipe === 'curb' && media?.sizes.length) look.sizeText = media.sizes.slice();
  // A slab is poured to a whole inch (a 0.1 m slab is a 4 in slab); pieces are listed to the eighth.
  if (m.thickness) look.thicknessIn = m.recipe === 'concrete' ? Math.round(m.thickness / IN) : Math.round((m.thickness / IN) * 8) / 8;
  if (m.pattern?.face) look.face = m.pattern.face;
  else if (m.wall?.face) look.face = m.wall.face;
  const image = maker === 'Belgard' ? makerImage(mediaLine, color) : maker === 'Basalite' ? basaliteImage(mediaLine, color) : undefined;
  if (image) look.image = image;
  if (media) look.page = media.page;
  // Composite deck boards: the board as the maker lists it, its product page and swatch photo.
  if (m.board) {
    const d = deckMedia(m.id);
    look.sizeText = [`${m.board.thicknessIn} x ${m.board.widthIn} in x ${m.board.lengthsFt.join(', ')} ft boards`, `Fascia ${m.board.fasciaIn[0]} x ${m.board.fasciaIn[1]} in`];
    if (d?.line.page) look.page = d.line.page;
    if (d?.image) look.image = d.image;
  }
  // Synthetic turf: its pile and weight as the maker lists them, and the product page.
  if (m.turf) {
    const blade = m.turf.blade === 'mixed' ? 'C, diamond and omega' : m.turf.blade;
    look.sizeText = [`${m.turf.pileMm} mm (${(m.turf.pileMm / 25.4).toFixed(2)} in) pile, ${m.turf.faceOz} oz face weight, ${blade} blade`];
    if (TURF_PAGE[m.id]) look.page = TURF_PAGE[m.id];
  }
  return look;
}

const M_FT = 3.28084;
const ft = (m: number) => {
  const f = m * M_FT;
  return f < 2 ? `${Math.round(f * 12)} in` : `${Math.round(f * 2) / 2} ft`;
};

/**
 * The look for whatever the pointer is on (a catalog material, or `<kind>:<id>` for a plant, water feature,
 * structure, feature or uploaded model), or null when it is not known. `itemId` finds the item in the plan for
 * details such as a pool's depth.
 */
export function lookOfPoint(catalogId: string, plan: SitePlan | null, itemId: string): Look | null {
  const [kind, id] = pointKind(catalogId);
  if (kind === 'material') {
    const m = materialById.get(id);
    return m ? lookOf(m) : null;
  }
  const base = (name: string, use: string, group: string, palette: string[], about: string, spec: string[]): Look => ({
    id: catalogId, name, kind: kind as Look['kind'], use, group, about, spec, maker: '', line: '', shelf: group, color: name, sw: palette[0], palette,
  });
  if (kind === 'plant') {
    const p = plantById.get(id);
    if (!p) return null;
    const placed = plan?.plants.find((x) => x.id === itemId);
    const cont = CONTAINERS.find((c) => c.id === placed?.container)?.label ?? p.container;
    const spec = [
      `Planted from: ${cont}`,
      `At planting: about ${ft(p.installHeight)} tall, ${ft(p.installSpread)} wide`,
      `Mature: about ${ft(p.matureHeight)} tall, ${ft(p.matureSpread)} wide, in ${p.yearsToMature} years`,
      `Spacing: about ${ft(p.spacing)} apart`,
      p.evergreen ? 'Evergreen' : 'Deciduous: loses its leaves in winter',
    ];
    const look = base(p.name, 'plant', p.group, [p.foliage, p.foliage2, ...(p.flower ? [p.flower] : []), ...(p.flower2 ? [p.flower2] : [])].slice(0, 4),
      `${p.name} (${p.botanical}). ${p.evergreen ? 'Evergreen' : 'Deciduous'}${p.flower ? ', with flowers' : ''}. Sizes are typical for the Central Valley.`, spec);
    look.botanical = p.botanical;
    return look;
  }
  if (kind === 'water') {
    const w = plan?.water.find((x) => x.id === itemId);
    const name = WATER_NAMES[id as WaterKind] ?? 'Water feature';
    const spec: string[] = [];
    if (w?.depth) spec.push(`About ${ft(w.depth)} deep at the deepest point`);
    if (id === 'pool') spec.push(w?.coping === 0 ? 'No coping' : `Coping about ${ft(w?.coping ?? 0.25)} wide`, 'Tiled waterline, plaster finish');
    if (id === 'pond') spec.push('Rubber liner and underlayment', 'River rock around the edge');
    if (id === 'stream' || id === 'pondless') spec.push('Rubber liner, rock-lined channel', `${w?.falls ?? 1} waterfall drop${(w?.falls ?? 1) === 1 ? '' : 's'}`);
    if (w?.lights) spec.push('Underwater lights');
    const about = id === 'pool' ? 'A swimming pool, set into the paving around it.' : id === 'pond' ? 'A pond with a rock edge.' : id === 'fountain' ? 'A fountain basin.' : 'A recirculating stream with waterfalls.';
    return base(name, 'water', 'Water', ['#4f9fb3', '#2f7f96', '#a8a399', '#5f5b55'], about, spec);
  }
  if (kind === 'structure') {
    const s = plan?.structures.find((x) => x.id === itemId);
    const name = STRUCTURE_NAMES[id as keyof typeof STRUCTURE_NAMES] ?? 'Structure';
    const spec = s ? [`About ${ft(s.height)} to the ${id === 'cover' ? 'underside of the roof' : 'eaves'}`] : [];
    const about = id === 'cover' ? (s?.room === true || s?.walls?.some(Boolean) ? 'A California room: a roofed room with solid walls on its closed sides.' : 'A roofed patio cover on posts.') : `The ${name.toLowerCase()}, shown for context so the yard reads at its real size.`;
    return base(name, 'structure', 'Structures', ['#d8cfbf', '#bfb3a0', '#5c5650', '#3f3a36'], about, spec);
  }
  if (kind === 'feature') {
    const f = featureById.get(id);
    if (!f) return null;
    const look = base(f.name, 'feature', f.group, ['#9a948b', '#6f6a63'], f.about ?? `${f.name}.`, f.facts ?? [`Footprint about ${ft(f.footprint[0])} x ${ft(f.footprint[1])}`]);
    // A maker's product (SunVilla Stratus): its maker and product page; no maker photos are shown for features.
    if (f.maker) look.maker = f.maker;
    if (f.page) look.page = f.page;
    return look;
  }
  if (kind === 'model') return base(id === 'image' ? 'Your picture' : 'Your 3D model', 'model', 'Uploaded', ['#9a948b'], 'The designer\u2019s own rendering, placed at the size drawn on the plan.', []);
  return null;
}
