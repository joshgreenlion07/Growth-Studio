// A catalog material as the parent page (Area Planner) sees it: what it is, its colors and sizes, and, for a maker's
// line, the maker's product page and swatch photo. Used by the `ready` looks list and the material pointer.
import { layingName, layingsFor, materialById, type MaterialSpec } from '../siteplan/catalog';
import { BELGARD_MEDIA, makerImage } from '../siteplan/belgard-media';

export interface Look {
  id: string;
  name: string;
  use: string;
  maker: string;
  line: string;
  shelf: string;
  color: string;
  sw: string;
  laying?: true;
  /** The laying patterns the paver offers, the default first. */
  layings?: { id: string; name: string }[];
  /** Four colors, light to dark, averaged from the maker's swatch. */
  palette: string[];
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
}

const IN = 0.0254;

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
  const media = maker === 'Belgard' ? BELGARD_MEDIA[mediaLine] : undefined;
  const sizes = m.pattern?.sizes;
  const border = m.use === 'border';
  // Belgard lists every set of a line together (the main set, a small set, the border stone); keep the listing whose
  // pieces are exactly this material's pieces, compared without order.
  const want = (border ? [[6, 9]] : sizes ?? []).map(([a, b]) => `${Math.min(a, b)}x${Math.max(a, b)}`).sort().join(' ');
  const piecesOf = (t: string) => [...t.matchAll(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x/g)].map((x) => { const a = +x[1], b = +x[2]; return `${Math.min(a, b)}x${Math.max(a, b)}`; });
  const sizeText = want ? media?.sizes.filter((t) => [...new Set(piecesOf(t))].sort().join(' ') === want) : undefined;
  const look: Look = {
    id: m.id,
    name: m.name,
    use: m.use,
    maker,
    line,
    shelf: tag.shelf ?? (m.use === 'wall' ? 'Retaining walls' : m.use === 'edging' ? 'Curb' : m.use === 'fence' ? 'Fences' : 'Pavers'),
    color,
    sw: m.palette[1] ?? m.palette[0],
    palette: m.palette.slice(0, 4),
  };
  const lays = layingsFor(m);
  if (lays.length) {
    look.laying = true;
    look.layings = lays.map((k) => ({ id: k, name: layingName(m, k) }));
  }
  if (sizes?.length) look.sizes = sizes.map(([a, b]) => [a, b]);
  if (sizeText?.length) look.sizeText = sizeText;
  else if (SIZE_TEXT[line]) look.sizeText = SIZE_TEXT[line];
  if (m.thickness) look.thicknessIn = Math.round((m.thickness / IN) * 8) / 8;
  if (m.pattern?.face) look.face = m.pattern.face;
  else if (m.wall?.face) look.face = m.wall.face;
  const image = maker === 'Belgard' ? makerImage(mediaLine, color) : undefined;
  if (image) look.image = image;
  if (media) look.page = media.page;
  return look;
}
