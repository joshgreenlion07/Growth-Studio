// Shelves inside a feature group, for the planner's feature picker (Area Planner's Feature tool shows them as chips
// under a group: Lighting > Path lights, Accents > Planters and pots, ...). Pure: name and group only, no 3D.
import type { FeatureSpec } from './catalog';

/** The feature's shelf within its group, or '' for a group too small to need shelves (Fire, Kitchens, ...). */
export function featureShelf(f: Pick<FeatureSpec, 'name' | 'group'>): string {
  const n = f.name.toLowerCase();
  switch (f.group) {
    case 'Lighting':
      if (/transformer|control system/.test(n)) return 'Transformers';
      if (/path light|bollard|walkway/.test(n)) return 'Path lights';
      if (/well light/.test(n)) return 'In-ground lights';
      if (/paver light|dot light|puck/.test(n)) return 'Paver and dot lights';
      if (/hardscape|cap wall|riser/.test(n)) return 'Wall and step lights';
      return 'Accent and up lights';
    case 'Water':
      if (/boulder|flagstone|moss rock/.test(n)) return 'Waterfall rocks';
      if (/urn|vase|birdbath|basalt/.test(n)) return 'Fountains and birdbaths';
      return 'Water walls and falls';
    case 'Shade':
      if (/heater|fan/.test(n)) return 'Heaters and fans';
      if (/shed/.test(n)) return 'Sheds';
      return 'Pergolas and covers';
    case 'Accents':
      if (/raised bed/.test(n)) return 'Raised beds';
      if (/planter|pot\b|bowl/.test(n)) return 'Planters and pots';
      if (/screen|trellis/.test(n)) return 'Screens and trellis';
      if (/column/.test(n)) return 'Columns';
      if (/boulder|moss rock/.test(n)) return 'Boulders';
      if (/outlet/.test(n)) return 'Outlets';
      return 'Play and other';
    case 'Rock library':
      return /dark gray/.test(n) ? 'Dark gray' : 'Tan-brown';
    default:
      return '';
  }
}
