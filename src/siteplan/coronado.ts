import type { MaterialSpec } from './catalog';
import type { Vec2 } from './types';

/*
 * Coronado Stone products bought for a customer job's front entry (Resource Building Materials, 2026): Honey Ledge
 * manufactured stone veneer in Huron (Dura-Pak flats and corners), and the Chiseled Stone Sill in Light Grey, set as
 * the coping along a raised landing's edge over the veneer. Every number is Coronado's, from coronado.com:
 *
 *   Honey Ledge       product page https://coronado.com/coronadohoneyledge/ and its spec sheet
 *                     https://coronado.com/mt-content/uploads/2025/10/coronadohoneyledge_specsheet_925.pdf (p. 1; the
 *                     June 2026 sheet, .../2026/06/coronadohoneyledge_specsheet_626.pdf, gives the same sizes, Huron
 *                     still a Standard color): "a combination of individual stones and panelized stones"; individual
 *                     stones 2 to 4 in tall and up to 20 in long, a small share 5 to 6 in tall and no longer than 10 in;
 *                     stones in the panels 1/2 to 4 in tall; standard stones 1 in thick on average (optional stick-out
 *                     stones 1 1/4 to 2 in); 7 to 10 lb per sq ft; corner returns 3 to 11 in; dry-stacked over a
 *                     polymer-modified mortar; Dura-Pak = 12.5 sq ft of flats or 12.5 ln ft of corners.
 *   Huron color       Coronado's Honey Ledge Huron swatch photo
 *                     (https://coronado.com/mt-content/uploads/2025/06/coronadohoneyledge_manufacturedstone_huron_6-25.jpg):
 *                     a cool gray ledge of mid gray, charcoal and light greige strips with a few taupe, mauve-brown and
 *                     rust stones. Tones and shares: 6 px cells, the darkest tenth dropped as joints and shadow, 8-means
 *                     in CIELAB; average albedo: the photo's mean over the whole swatch, joints and all, through the wall
 *                     calibration (WALL_GAIN, engine/surfaces.ts), as the MSI ledger panels are.
 *   Chiseled Stone    product page https://coronado.com/chiseledstonesill/ (its photo carries the profile drawing:
 *   Sill              24 in long, 2 1/2 in tall at the back, 3 in deep); one size only. The Houston stocking sheet
 *                     (.../2026/08/coronado_houstonstockingwarehouse_2025.pdf) lists the same piece at 3 1/2 in "outside";
 *                     the profile is drawn to the product page's 3 in. Light Grey from the product photo (white masked).
 *                     Overhang: Coronado's own cap detail (.../2022/06/wall_cap_typical_framed_wall.pdf) and install guide
 *                     (.../2023/09/2023-standardstoneinstallguide.pdf, p. 10) give "1 IN. MINIMUM" past the veneer face,
 *                     and its catalog photo of this sill on a ledgestone wainscot shows about 1 in: so 1 in here (the
 *                     maker's own figure, which the 2 to 3 in rule gives way to).
 */

const IN = 0.0254;

export const HONEY_LEDGE_HURON_ID = 'coronado-honey-ledge-huron';
export const CHISELED_SILL_LIGHT_GREY_ID = 'coronado-chiseled-stone-sill-light-grey';

/**
 * A coping laid along one face's top edge (a raised landing's riser, a wainscot), as its maker draws it: the piece's
 * length, its profile ([out from the back, up from the back's bottom], inches, the back at x = 0 and its top at y =
 * `backIn`, the nose to +x), how far its front runs past the face below it, and its joint (inches).
 */
export interface CopingProfile {
  lengthIn: number;
  backIn: number;
  depthIn: number;
  overIn: number;
  jointIn: number;
  outline: Vec2[];
  /** The look's color as photographed (sRGB hex): its painted texture's average. */
  swatch: string;
}

/**
 * The Chiseled Stone Sill's profile, traced from Coronado's drawing (about 44 px to the inch on the product photo): a
 * plumb back 2 1/2 in tall; the top falling about 0.45 in to the front ("stone sill with sloped top", Coronado's
 * window detail); a rounded front edge of about 1/2 in radius; a rock-faced front leaning back toward the bottom; and
 * a drip under the nose, which hangs about 1/2 in below the back's bottom. 3.07 in deep at the most.
 */
export const CHISELED_SILL: CopingProfile = {
  lengthIn: 24,
  backIn: 2.5,
  depthIn: 3.07,
  overIn: 1,
  // Mortar joint between pieces (they are set in mortar on the riser's top, joints filled).
  jointIn: 0.375,
  outline: [
    [0, 0], [0, 2.5], [1.3, 2.28], [2.6, 2.05], [2.82, 1.97], [2.97, 1.8], [3.05, 1.55], [3.07, 1.2], [3.06, 0.6],
    [3.02, 0], [2.92, -0.28], [2.8, -0.53], [2.27, -0.27], [1.2, -0.12], [0.5, -0.04],
  ],
  // Light Grey, the product photo's mean with the white background masked.
  swatch: '#8c867f',
};

/** Coping profiles by look id (builder/landing.ts draws a clad edge with them). */
export const COPING_PROFILES: Record<string, CopingProfile> = { [CHISELED_SILL_LIGHT_GREY_ID]: CHISELED_SILL };

const M = (s: Omit<MaterialSpec, 'placeholder'>): MaterialSpec => ({ ...s, placeholder: true });

export const CORONADO_LOOKS: MaterialSpec[] = [
  /*
   * Honey Ledge, Huron, as a wall veneer (shelf 'Wall veneer'): courses 1 1/2 to 4 in (the individual stones, and the
   * panels' thinner strips), now and then a 5 1/2 in one (the 5 to 6 in stones), pieces 4 to 20 in long; cleft faces
   * standing proud of each other by up to about 3/4 in (1 in stones, 1 1/4 to 2 in stick-outs), dry-stacked. Set on
   * 1/2 in of mortar: 1 1/2 in in all, so an 8 in block wall clad both faces is 11 in. A free-standing wall takes a
   * plain cap in the sill's gray (Coronado's own caps for a wall this thick are its Chiseled Stone Wall Caps, which were
   * not bought); a raised landing's riser takes the Chiseled Stone Sill along its top (`edge`).
   */
  M({
    id: HONEY_LEDGE_HURON_ID, name: 'Coronado Honey Ledge stacked stone, Huron', use: 'wall', group: 'Walls', recipe: 'wall',
    palette: ['#878181', '#979290', '#787271', '#676161', '#aaa5a2', '#c2bbb5', '#514d4d', '#ada198'],
    wall: { face: 'ledgerPanel', cap: '#938b82' },
    veneer: {
      weights: [0.197, 0.178, 0.17, 0.13, 0.123, 0.078, 0.074, 0.05], rowIn: [1.5, 4], tallRow: 0.05, tallIn: 5.5, pieceIn: [4, 20], rust: 0.35, cast: true,
      albedo: [0.1458, 0.1262, 0.1081], thicknessIn: 1.5, wallIn: 11, edge: CHISELED_SILL_LIGHT_GREY_ID,
    },
    matches: 'Coronado Stone Honey Ledge, Huron (Dura-Pak flats and corners)', maker: 'Coronado Stone', line: 'Honey Ledge', shelf: 'Wall veneer', color: 'Huron',
  }),
  /*
   * The Chiseled Stone Sill, Light Grey, as a coping look: 24 in pieces 3 in deep (the texture's course), joints 3/8 in.
   * Not offered as paving or a border; builder/landing.ts lays it along a clad landing's edge to its real profile.
   */
  M({
    id: CHISELED_SILL_LIGHT_GREY_ID, name: 'Coronado Chiseled Stone Sill, Light Grey, 24 x 3 x 2 1/2 in', use: 'border', group: 'Walls', recipe: 'paver',
    palette: ['#c0bab5', '#a39c94', '#938b82', '#6d655d'],
    pattern: { kind: 'soldier', sizes: [[24, 3]], joint: 0.375, face: 'textured' }, thickness: 2.5 * IN, auto: true,
    matches: 'Coronado Stone Chiseled Stone Sill, 24 x 3 x 2 1/2 in, Light Grey', maker: 'Coronado Stone', line: 'Chiseled Stone Sill', color: 'Light Grey',
  }),
];
