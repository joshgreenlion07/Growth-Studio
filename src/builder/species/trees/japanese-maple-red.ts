import type { SpeciesBuilder } from '../kit';
import { buildMaple } from './maple-shared';

/**
 * Red Japanese maple, modeled on Acer palmatum 'Bloodgood': a rounded,
 * layered small tree with deep burgundy-red seven-lobed leaves, brighter red
 * new growth at the shoot tips, dark red young twigs and smooth gray bark.
 */
export const build: SpeciesBuilder = (spec) =>
  buildMaple(
    spec,
    {
      key: 'red',
      leafDark: '#2c060d',
      leafMid: '#470913',
      leafLight: '#5f0d19',
      leafNew: '#a3121c',
      vein: 'rgba(30,4,8,0.5)',
      petiole: '#7a1420',
      twig: '#3a1516',
      tintInner: '#9a8a80',
      tintOuter: '#ffffff',
      tintNew: '#ffd0b8',
      bark: ['#5f5850', '#3a332d', '#a59f93'],
    },
    { lobes: 7, leafSize: 0.08, crownBase: 0.2, crownWide: 0.52, stemLean: 0.58, layering: 0.62, trunk: 0.0165, gap: 0.95 },
  );
