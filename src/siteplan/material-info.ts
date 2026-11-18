/**
 * Plain-language notes for the material panel: what each surface is and how it is usually put in. These are
 * typical install details for the Central Valley, as a starting point for talking a client through a design; Green
 * Lion's own install specs replace them where they differ. No prices.
 *
 * Also the names of things the material pointer can land on that are not catalog materials: plants, water features,
 * structures, features and uploaded models. The pointer reports those as `<kind>:<id>` (see `pointKind`).
 */
import { featureById, materialById, plantById, type ConcreteFinish, type MaterialSpec } from './catalog';
import type { ExistingStructure, WaterKind } from './types';

export interface MaterialInfo {
  /** Group the panel shows above the name: "Mulch and rock", "Concrete", "Synthetic turf". */
  group: string;
  /** One or two plain sentences. */
  about: string;
  /** Typical install, one line each. */
  spec: string[];
}

const STAMP: Record<string, string> = {
  ashlar: 'an ashlar slate stamp: random rectangular stones 12 to 36 in, pressed about 3/8 in deep',
  cobble: 'a European fan cobblestone stamp: 24 in fans of small stones, pressed about 3/8 in deep',
  plank: 'a wood plank stamp: boards 6 to 8 in wide with grain, pressed about 1/4 in deep',
};
const FINISH: Record<ConcreteFinish, string> = {
  broom: 'broom finish (a light brushed texture for grip)',
  smooth: 'smooth steel-trowel finish',
  stamped: 'stamped pattern with color hardener and release',
  exposed: 'exposed aggregate (the top paste washed off to show the stone)',
};

const FENCE_ABOUT: Record<NonNullable<MaterialSpec['fence']>, string> = {
  boardOnBoard: 'A board-on-board wood fence: boards overlap on both rails, so there are no gaps to see through.',
  grayLattice: 'A solid board fence with a lattice band along the top that lets light through.',
  grayBoardLattice: 'Gray-painted board-on-board to the fence height, with a 1 ft cedar lattice topper above it between natural cedar posts, under a cedar cap.',
  dogEar: 'A dog-ear picket fence: wood pickets with clipped top corners, the classic backyard privacy fence.',
  horizontal: 'A horizontal slat fence: wood boards run sideways between posts for a clean, modern line.',
  vinyl: 'A vinyl privacy fence: solid panels that never need paint or stain.',
  steelPicket: 'An ornamental steel picket fence: open, secure and low-maintenance.',
  metalPicket: 'A powder-coated ornamental metal picket fence: flush-top pickets about 4 in on center between two rails, square posts every 6 ft, on a low concrete mow curb. See-through, secure and fade-resistant.',
  chainlinkSlat: 'A chain-link fence with privacy slats woven through it.',
};

/** Notes for one bed or ground material, by id. */
const BED: Record<string, Omit<MaterialInfo, 'group'>> = {
  'black-mulch': {
    about: 'Shredded wood mulch dyed black. Holds moisture, keeps weeds down and gives beds a clean, dark finish that makes plants stand out.',
    spec: ['3 in deep, raked even', 'Kept 2 to 3 in back from stems and trunks', 'Top up about 1 in a year as it fades and breaks down'],
  },
  'brown-mulch': {
    about: 'Red-brown shredded bark. A warm, natural-looking bed cover that holds moisture and keeps weeds down.',
    spec: ['3 in deep, raked even', 'Kept 2 to 3 in back from stems and trunks', 'Top up about 1 in a year'],
  },
  'fir-bark': {
    about: 'Natural fir bark, not dyed. Chunky brown pieces that break down slowly and feed the soil as they go.',
    spec: ['3 in deep, raked even', 'Kept 2 to 3 in back from stems and trunks', 'Top up about 1 in a year'],
  },
  humus: {
    about: 'Black humus: a dark, fine compost mix, spread loose and crumbly. A rich near-black finish that holds moisture, feeds the soil and makes plants stand out; it settles a little over the first weeks and is worked in when beds are replanted.',
    spec: ['Black humus / compost mix, spread 2 to 3 in', 'Raked even, crowned slightly and settled against the edging', 'Kept 1 to 2 in back from stems and trunks', 'Ordered by the cubic yard; top up about 1 in a year'],
  },
  compost: {
    about: 'Compost: dark brown, fully broken-down organic matter with plenty of woody bits and shredded fiber. Coarser and a little lighter than black humus; spread on beds it feeds the soil, holds water and keeps weeds down.',
    spec: ['Compost, spread 2 to 3 in', 'Raked even, crowned slightly and settled against the edging', 'Kept 1 to 2 in back from stems and trunks', 'Ordered by the cubic yard'],
  },
  topsoil: {
    about: 'Dirt / topsoil: screened, medium-brown soil, fine and dry with few clods or fibers. Used to fill and level beds and low spots before planting or seeding.',
    spec: ['Topsoil, spread 2 to 4 in', 'Raked smooth and lightly firmed', 'Graded to drain away from the house', 'Ordered by the cubic yard'],
  },
  'decomposed-granite': {
    about: 'Decomposed granite (DG): crushed granite fines that pack down into a firm, natural tan surface for paths, patios and between stepping stones.',
    spec: ['3 in deep, compacted in two lifts', 'Over weed fabric on compacted subgrade', 'Stabilizer added for walking paths', 'Held by edging along every side'],
  },
  'black-pebble': {
    about: 'Smooth black beach pebbles. A dark, polished accent rock for modern beds and around water features.',
    spec: ['2 to 3 in deep, 3/4 to 1 in pebbles', 'Over commercial weed fabric'],
  },
  'lava-rock': {
    about: 'Black lava rock: light, porous volcanic stone. A dark bed cover that stays put and does not break down.',
    spec: ['2 to 3 in deep', 'Over commercial weed fabric'],
  },
};

const IN = 0.0254;

/**
 * River rock and cobble, by line and size (siteplan/catalog.ts): what they are and how deep they go. The stone is a
 * sample look until Green Lion's own is photographed.
 */
function sizedRockInfo(m: MaterialSpec): Omit<MaterialInfo, 'group'> | undefined {
  if (!m.pebble || (m.line !== 'River rock' && m.line !== 'River cobble' && m.line !== 'White and tan cobble')) return undefined;
  const size = m.color ?? `${m.pebble.minIn}-${m.pebble.maxIn} in`;
  const depth = `${m.depthIn ?? 3} in deep`;
  if (m.line === 'River rock') {
    return {
      about: `River rock, ${size}: natural water-worn stone, rounded, in a mixed blend of tan, buff, gray and brown. A low-water bed cover that never needs replacing, the classic dry creek bed, and the lining of streams and pondless waterfalls (the larger sizes along the edges, the smaller in the run).`,
      spec: [`${depth}, ${size} stones`, 'Over commercial weed fabric (a liner under a water feature)', 'Held by edging along lawns and paths', 'Sample stone and colors, to be replaced with the stone Green Lion buys'],
    };
  }
  const white = m.line === 'White and tan cobble';
  return {
    about: white
      ? `White and tan cobble, ${size}: large rounded stones in cream, white and light tan that brighten a bed and read clearly from a distance.`
      : `River cobble, ${size}: large rounded stones in warm gray, tan and brown, for dry creek beds, borders, the banks of water features and low-water beds.`,
    spec: [`${depth}, ${size} stones, about one stone deep`, 'Over commercial weed fabric', 'Sample stone and colors, to be replaced with the stone Green Lion buys'],
  };
}

/** Notes for a catalog material: the bed and rock notes above by id, the rest by what it is. */
export function materialInfo(m: MaterialSpec): MaterialInfo {
  const bed = BED[m.id] ?? sizedRockInfo(m);
  if (bed) return { group: m.group, ...bed };
  if (m.use === 'bed') return { group: m.group, about: `${m.name}: a bed cover.`, spec: ['3 in deep over weed fabric'] };
  switch (m.recipe) {
    case 'lawn':
      return {
        group: 'Sod',
        about: 'Natural lawn laid as sod: a tall fescue blend, the usual Central Valley lawn. Green from the day it is laid and stays green with regular water.',
        spec: ['Soil tilled 4 to 6 in with amendment, graded and rolled', 'Sod laid in a staggered pattern, seams tight', 'Watered in the same day; sprinklers set for head-to-head coverage'],
      };
    case 'turfArtificial': {
      const spec: string[] = [];
      if (m.turf) {
        const blade = m.turf.blade === 'mixed' ? 'C, diamond and omega' : m.turf.blade;
        spec.push(`${m.turf.pileMm} mm (${(m.turf.pileMm / 25.4).toFixed(2)} in) pile, ${m.turf.faceOz} oz face weight`, `${blade} blade`);
      }
      spec.push('3 to 4 in compacted base rock', '1/2 in fines (DG) bedding, laser-graded', 'Seams glued, edges nailed; infill brushed in');
      return {
        group: 'Synthetic turf',
        about: m.id === 'putting-green'
          ? 'Putting turf: a short, dense pile that rolls like a real green.'
          : 'Synthetic grass: green all year with no mowing or watering. Drawn in 3D blade by blade at its real pile height.',
        spec,
      };
    }
    case 'concrete': {
      const t = m.thickness ?? 0.1;
      return {
        group: 'Concrete',
        about: `Poured concrete with ${m.stamp ? STAMP[m.stamp] : `a ${FINISH[m.finish ?? 'broom']}`}.${m.line ? ' Integral color is mixed into the concrete, so it goes all the way through.' : ''}${m.antique ? ' Antiquing release is left darker in the joints and low spots for an aged look.' : ''}`,
        spec: [`${Math.round(t / IN)} in slab`, '4 in compacted base rock', '#3 rebar at 18 in on center each way', 'Control joints about every 8 to 10 ft'],
      };
    }
    case 'flagstone':
      if (m.flag) {
        const what = { rhyolite: 'a porous rhyolite (lava) stone, reddish brown to black, often with lichen on its face', sandstone: 'an Arizona sandstone, pale cream to buff with tan swirls', slate: 'a charcoal to black slate, lightly riven' }[m.flag.stone];
        const t = m.flag.thicknessIn;
        return {
          group: 'Natural stone',
          about: `${m.matches ?? m.name}: ${what}. Natural flagstone, so every piece has its own outline; used one piece at a time as a stepping stone.`,
          spec: [`About ${t === 1 ? '1' : t} in thick`, 'Set in 2 to 3 in of compacted DG or sand, top about 1/2 in above the ground around it', 'Picked by size: 18 to 24 in or 24 to 36 in steppers'],
        };
      }
      return m.id === 'flagstone-dg'
        ? { group: 'Natural stone', about: 'Natural flagstone pieces set with wide gaps of decomposed granite: a relaxed, natural path or patio.', spec: ['1 1/2 to 2 in thick stones', 'Set in 2 to 3 in compacted DG', 'Gaps 1 to 3 in, filled with DG'] }
        : { group: 'Natural stone', about: 'Natural flagstone set tight in a mortar bed: a solid stone patio with irregular, hand-fit pieces.', spec: ['1 1/2 to 2 in thick stones', 'Mortar bed on a 4 in concrete slab', 'Joints grouted'] };
    case 'deck':
      if (m.board) {
        const b = m.board;
        return {
          group: 'Decking',
          about: `${m.maker} ${m.line} composite deck boards${b.grain === 'streak' ? ', streaked in several tones like weathered wood' : ', one tone with an embossed wood grain'}. Built board by board: picture-frame border, field pattern and fascia as drawn.`,
          spec: [`${b.thicknessIn} x ${b.widthIn} in boards, ${b.lengthsFt.join(', ')} ft`, `${b.gapIn === 0.1875 ? '3/16' : b.gapIn} in gaps, hidden fasteners`, `Fascia ${b.fasciaIn[0]} x ${b.fasciaIn[1]} in on the open sides`, 'Joists at 16 in on center (12 in for diagonal and chevron boards)'],
        };
      }
      return { group: 'Decking', about: m.id === 'wood-deck' ? 'A cedar deck: warm natural wood boards on a wood frame.' : 'A composite deck: boards that look like wood and need no staining.', spec: ['Boards on joists at 16 in on center', 'Hidden fasteners', 'Frame on concrete footings'] };
    case 'paver': {
      const porcelain = m.group === 'Porcelain';
      const about = m.padSlab
        ? 'A large-format cast concrete slab poured or cast to the size of the pad: one solid slab with no joints. Used where no maker sells a paver that size.'
        : porcelain
        ? 'Porcelain pavers: dense, stain-resistant and cool underfoot, with a crisp modern look.'
        : m.use === 'border'
          ? 'A row of pavers set along the edge of a paved area, framing it and holding the field pavers in place.'
          : m.maker
            ? `${m.maker} ${m.line} concrete pavers.`
            : 'Concrete pavers: individual units set on sand, so they flex with the ground instead of cracking.';
      const spec = m.padSlab
        ? ['2 in cast concrete, smooth face', 'Set on 4 in compacted base rock and 1 in bedding sand', 'One slab, no joints']
        : porcelain
        ? ['2 cm porcelain', 'Set in sand over 4 to 6 in compacted base rock', 'Or on pedestals over a slab']
        : ['4 to 6 in compacted base rock', '1 in bedding sand', 'Plate-compacted, joints filled with polymeric sand', m.use === 'border' ? 'Edge restraint behind the border' : 'Edge restraint on open sides'];
      return { group: porcelain ? 'Porcelain' : 'Pavers', about, spec };
    }
    case 'wall':
      return {
        group: 'Walls',
        about: m.maker ? `${m.maker} ${m.line} wall block.` : m.wall?.face === 'plaster' ? 'A block wall finished with smooth plaster or stucco.' : m.wall?.face === 'ledgestone' || m.wall?.face === 'stackedStone' ? 'A block wall faced with stone veneer.' : 'A segmental block wall with a cap.',
        spec: ['6 in compacted base, first course below grade', 'Drain rock and a perforated drain behind walls that hold soil', 'Cap glued down'],
      };
    case 'fence':
      return { group: 'Fences', about: FENCE_ABOUT[m.fence ?? 'boardOnBoard'], spec: m.fence === 'steelPicket' || m.fence === 'metalPicket' || m.fence === 'chainlinkSlat' ? ['Posts set in concrete', 'Panels or fabric between posts'] : ['Posts set in concrete about every 6 to 8 ft', 'Rails and boards fastened with exterior screws'] };
    case 'curb':
      return { group: 'Curb', about: m.maker ? `${m.maker} ${m.line}: a solid concrete curb unit that edges beds, lawn and paving.` : 'A concrete curb that edges beds, lawn and paving.', spec: ['Set on compacted base', 'Shows about 3 in above grade unless set otherwise'] };
    case 'steelEdging':
      return { group: 'Edging', about: 'Steel edging: a thin, clean line between lawn, beds and rock that keeps each in its place.', spec: ['3/16 in steel strip', 'Staked about every 30 in, top flush with grade'] };
    case 'mulch': case 'dg': case 'riverRock': case 'blackPebble': case 'cobble':
      return { group: m.group, about: `${m.name}.`, spec: [] };
  }
}

/* ------------------------------------------------------------------ */
/* Things that are not catalog materials                                */

export const WATER_NAMES: Record<WaterKind, string> = { pond: 'Pond', pool: 'Swimming pool', fountain: 'Fountain', stream: 'Stream', pondless: 'Pondless waterfall' };
export const STRUCTURE_NAMES: Record<ExistingStructure['kind'], string> = { house: 'House', garage: 'Garage', shed: 'Shed', cover: 'Patio cover' };

/** The kind and id of a pointer id: 'plant:lavender' is ['plant', 'lavender']; a catalog material id is ['material', id]. */
export function pointKind(catalogId: string): [string, string] {
  const m = /^(plant|water|structure|feature|model):(.*)$/.exec(catalogId);
  return m ? [m[1], m[2]] : ['material', catalogId];
}

/** The name the pointer shows for what it is on. */
export function pointName(catalogId: string): string {
  const [k, id] = pointKind(catalogId);
  if (k === 'plant') return plantById.get(id)?.name ?? 'Plant';
  if (k === 'water') return WATER_NAMES[id as WaterKind] ?? 'Water feature';
  if (k === 'structure') return STRUCTURE_NAMES[id as ExistingStructure['kind']] ?? 'Structure';
  if (k === 'feature') return featureById.get(id)?.name ?? 'Feature';
  if (k === 'model') return id === 'image' ? 'Your picture' : 'Your 3D model';
  return materialById.get(id)?.name ?? '';
}
