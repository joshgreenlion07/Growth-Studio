import type { SpeciesBuilder } from '../kit';
import { buildDaylily, type DaylilyLook } from './shared-daylily';

/**
 * Daylily 'Stella de Oro', Hemerocallis 'Stella de Oro', in its long summer
 * bloom: a dense, fine-textured mound of arching, keeled strap leaves, and
 * many short branched scapes holding golden-yellow trumpets just above the
 * leaves, several open at once among green-yellow buds.
 *
 * References and the numbers they give:
 * - RHS (rhs.org.uk/plants/43382): to 30 cm tall; rounded canary-yellow
 *   flowers with an orange throat, to 7 cm wide.
 * - White Flower Farm (whiteflowerfarm.com/31132-product.html): 24 in scapes,
 *   spread 15-18 in; golden yellow, mid-June into September.
 * - Moana Nursery plant finder (plants.moananursery.com, id 2490): 12 in
 *   foliage, 18 in in flower, 18 in spread; space 14 in.
 * - Perennials.com: spread 12-23 in; flower about 2.75 in.
 * Targets here: leaves 12-16 in long, 0.6-0.75 in wide, arching into a
 * mound about 12 in high; scapes 9-13 in plus the flowers, so the plant is
 * 18 in tall in bloom and 20 in across after two years in a Modesto bed. A 1 gal at install: about 12 in in
 * bloom, a few fans with two or three scapes.
 */
const STELLA: DaylilyLook = {
  key: 'stella',
  fans: 18,
  installFans: 6,
  leavesPerFan: [7, 9],
  leafLen: [0.32, 0.41],
  leafWid: [0.015, 0.019],
  crownR: 0.1,
  fanLean: 0.5,
  splay: 0.9,
  arch: [0.8, 2.0],
  leafMid: ['#3f6d2a', '#467530', '#3b6628'],
  leafBase: '#82935a',
  leafTip: '#6e9a45',
  scapes: 13,
  installScapes: 3,
  scapeLen: [0.22, 0.33],
  scapeLean: 0.55,
  scapeR: 0.0028,
  scapeCol: '#5d7d34',
  scapeTop: '#6c8a3c',
  arms: [2, 3],
  armLen: [0.025, 0.05],
  buds: [2, 3],
  openChance: 0.55,
  spentChance: 0.25,
  dia: 0.07,
  flare: [1.0, -0.2],
  ruffle: 0.1,
  petalW: 0.66,
  sepalW: 0.5,
  throat: '#d97a00',
  mid: '#e89400',
  main: '#f0a800',
  shade: 'rgba(170,95,0,0.16)',
  sepal: '#eba200',
  rib: 'rgba(255,232,130,1)',
  ribAlpha: 0.35,
  throatLen: 0.3,
  vein: 'rgba(200,120,0,0.16)',
  budBase: '#7f9a3a',
  budMid: '#b8bc40',
  budTip: '#d8c030',
  spent: ['#c08018', '#8a5a18'],
  filament: '#f2c64a',
  anther: '#7a4a1c',
  roughness: 0.62,
};

export const build: SpeciesBuilder = (spec) => buildDaylily(spec, STELLA);
