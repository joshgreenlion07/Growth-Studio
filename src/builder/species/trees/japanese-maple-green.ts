import type { SpeciesBuilder } from '../kit';
import { buildMaple } from './maple-shared';

/**
 * Green Japanese maple, the species type of Acer palmatum: fresh light to
 * mid green leaves with five to seven lobes, yellow-green new growth with a
 * faint red edge, green young twigs with red petioles, and smooth gray bark.
 * A little larger and more upright-spreading than 'Bloodgood'.
 */
export const build: SpeciesBuilder = (spec) =>
  buildMaple(
    spec,
    {
      key: 'green',
      leafDark: '#2f5a1c',
      leafMid: '#4a7c24',
      leafLight: '#6a9a30',
      leafNew: '#8db63a',
      vein: 'rgba(190,215,120,0.55)',
      petiole: '#a04a3a',
      twig: '#4f6a2c',
      tintInner: '#8fa08a',
      tintOuter: '#ffffff',
      tintNew: '#f6f8cc',
      bark: ['#676359', '#403d35', '#aeaa9d'],
    },
    { lobes: 7, leafSize: 0.088, crownBase: 0.22, crownWide: 0.58, stemLean: 0.5, layering: 0.5, trunk: 0.0165, gap: 1.25 },
  );
