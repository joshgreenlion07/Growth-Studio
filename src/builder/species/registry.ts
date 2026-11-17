import type { SpeciesBuilder } from './kit';
import { build as shadeTree } from './trees/shade-tree';
import { build as japaneseMapleRed } from './trees/japanese-maple-red';
import { build as japaneseMapleGreen } from './trees/japanese-maple-green';
import { build as crapeMyrtle } from './trees/crape-myrtle';
import { build as oliveTree } from './trees/olive-tree';
import { build as citrusStandard } from './trees/citrus-standard';
import { build as italianCypress } from './trees/italian-cypress';
import { build as bluePointJuniper } from './trees/blue-point-juniper';
import { build as blueJuniperColumn } from './trees/blue-juniper-column';
import { build as blueSpruce } from './trees/blue-spruce';
import { build as boxwood } from './shrubs/boxwood';
import { build as westringia } from './shrubs/westringia';
import { build as euonymusVariegated } from './shrubs/euonymus-variegated';
import { build as rose } from './shrubs/rose';
import { build as floweringShrub } from './shrubs/flowering-shrub';
import { build as dwarfPittosporum } from './shrubs/dwarf-pittosporum';
import { build as goldCypress } from './shrubs/gold-cypress';
import { build as artemisia } from './shrubs/artemisia';
import { build as boxwoodHedge } from './shrubs/boxwood-hedge';
import { build as pittosporum } from './shrubs/pittosporum';
import { build as blueFescue } from './grasses/blue-fescue';
import { build as ornamentalGrass } from './grasses/ornamental-grass';
import { build as lomandra } from './grasses/lomandra';
import { build as fountainGrass } from './grasses/fountain-grass';
import { build as goldCarex } from './grasses/gold-carex';
import { build as flaxLily } from './grasses/flax-lily';
import { build as mondoGrass } from './grasses/mondo-grass';
import { build as lavender } from './perennials/lavender';
import { build as veronicaWhite } from './perennials/veronica-white';
import { build as statice } from './perennials/statice';
import { build as annualColor } from './perennials/annual-color';
import { build as foxtailFern } from './perennials/foxtail-fern';
import { build as variegatedYucca } from './succulents/variegated-yucca';
import { build as blueSedum } from './succulents/blue-sedum';
import { build as foxtailAgave } from './succulents/foxtail-agave';
import { build as agave } from './succulents/agave';
import { build as banana } from './tropicals/banana';
import { build as elephantEar } from './tropicals/elephant-ear';
import { build as ajuga } from './groundcover/ajuga';
import { build as spreadingJuniper } from './groundcover/spreading-juniper';
import { build as verbena } from './groundcover/verbena';
import { build as groundcover } from './groundcover/groundcover';

import { build as yewPineColumn } from './trees/yew-pine-column';
import { build as gaura } from './perennials/gaura';
import { build as liriope } from './grasses/liriope';
import { build as purpleConeflower } from './perennials/purple-coneflower';
import { build as daylilyStellaDeOro } from './perennials/daylily-stella-de-oro';
import { build as daylilyRed } from './perennials/daylily-red';
import { build as fortnightLily } from './perennials/fortnight-lily';
import { build as cannaTropicanna } from './tropicals/canna-tropicanna';
/**
 * Catalog plant id -> its builder. Each plant has its own file under
 * species/<group>/<catalog-id>.ts. A plant with no entry here falls back to
 * the generic builder for its form in builder/plants.ts.
 */
export const SPECIES: Record<string, SpeciesBuilder> = {
  'shade-tree': shadeTree,
  'japanese-maple-red': japaneseMapleRed,
  'japanese-maple-green': japaneseMapleGreen,
  'crape-myrtle': crapeMyrtle,
  'olive-tree': oliveTree,
  'citrus-standard': citrusStandard,
  'italian-cypress': italianCypress,
  'blue-point-juniper': bluePointJuniper,
  'blue-juniper-column': blueJuniperColumn,
  'blue-spruce': blueSpruce,
  'boxwood': boxwood,
  'westringia': westringia,
  'euonymus-variegated': euonymusVariegated,
  'rose': rose,
  'flowering-shrub': floweringShrub,
  'dwarf-pittosporum': dwarfPittosporum,
  'gold-cypress': goldCypress,
  'artemisia': artemisia,
  'boxwood-hedge': boxwoodHedge,
  'pittosporum': pittosporum,
  'blue-fescue': blueFescue,
  'ornamental-grass': ornamentalGrass,
  'lomandra': lomandra,
  'fountain-grass': fountainGrass,
  'gold-carex': goldCarex,
  'flax-lily': flaxLily,
  'mondo-grass': mondoGrass,
  'lavender': lavender,
  'veronica-white': veronicaWhite,
  'statice': statice,
  'yew-pine-column': yewPineColumn,
  'gaura': gaura,
  'liriope': liriope,
  'purple-coneflower': purpleConeflower,
  'daylily-stella-de-oro': daylilyStellaDeOro,
  'daylily-red': daylilyRed,
  'fortnight-lily': fortnightLily,
  'canna-tropicanna': cannaTropicanna,
  'annual-color': annualColor,
  'foxtail-fern': foxtailFern,
  'variegated-yucca': variegatedYucca,
  'blue-sedum': blueSedum,
  'foxtail-agave': foxtailAgave,
  'agave': agave,
  'banana': banana,
  'elephant-ear': elephantEar,
  'ajuga': ajuga,
  'spreading-juniper': spreadingJuniper,
  'verbena': verbena,
  'groundcover': groundcover,
};
