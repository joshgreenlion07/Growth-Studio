import type { SpeciesBuilder } from '../kit';
import { buildDaylily, type DaylilyLook } from './shared-daylily';

/**
 * Red daylily, a Hemerocallis hybrid, modeled on 'Chicago Apache' (a common
 * midseason tetraploid red): a fountain of long arching strap leaves and
 * branched scapes well above them, carrying big scarlet-red trumpets with a
 * yellow-green throat, a pale midrib on each petal and ruffled, faintly
 * gold-edged petals; buds green flushed red-brown.
 *
 * References and the numbers they give:
 * - Studley's / NetPS plant finder (plants.studleys.com, id 2415, 'Chicago
 *   Apache'): 24 in foliage, 32 in in flower, 24 in spread; scarlet trumpets
 *   with gold throats.
 * - Gertens ('Chicago Apache'): 5 in scarlet flowers with a green throat,
 *   ruffled edges. Oakes Daylilies and Bloomin' Designs: 27 in scapes.
 * - Grimm's Gardens: 24-30 in tall, 18-24 in wide.
 * Targets here: leaves 23-28 in long, about 1 in wide, arching into a mound
 * about 18 in high; scapes 24-28 in to the first fork, 5 in flowers, so
 * 31 in tall in bloom and 26 in across after two years. A 1 gal at install: about 14 in, a few fans with one or
 * two scapes.
 */
const RED: DaylilyLook = {
  key: 'red-apache',
  fans: 14,
  installFans: 5,
  leavesPerFan: [8, 10],
  leafLen: [0.58, 0.72],
  leafWid: [0.022, 0.027],
  crownR: 0.13,
  fanLean: 0.5,
  splay: 0.85,
  arch: [0.8, 2.0],
  leafMid: ['#3d6a29', '#44712e', '#3a6426'],
  leafBase: '#7d8f50',
  leafTip: '#68954a',
  scapes: 10,
  installScapes: 2,
  scapeLen: [0.6, 0.72],
  scapeLean: 0.45,
  scapeR: 0.0042,
  scapeCol: '#5a7a32',
  scapeTop: '#7d7a42',
  arms: [3, 4],
  armLen: [0.04, 0.08],
  buds: [1, 3],
  openChance: 0.5,
  spentChance: 0.15,
  dia: 0.125,
  flare: [0.9, -0.35],
  ruffle: 0.13,
  petalW: 0.6,
  sepalW: 0.42,
  throat: '#c3c23a',
  mid: '#c86a14',
  main: '#9c0c16',
  shade: 'rgba(30,0,6,0.5)',
  sepal: '#900c16',
  rib: 'rgba(200,90,70,1)',
  ribAlpha: 0.35,
  edge: 'rgba(200,140,60,0.4)',
  throatLen: 0.12,
  vein: 'rgba(70,0,10,0.25)',
  budBase: '#5f8034',
  budMid: '#6a7e30',
  budTip: '#8a3a24',
  spent: ['#5e2418', '#3a1a12'],
  filament: '#f0b838',
  anther: '#3a2418',
  roughness: 0.62,
};

export const build: SpeciesBuilder = (spec) => buildDaylily(spec, RED);
