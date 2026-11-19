/**
 * Belgard lines, generated from the color lists on belgard.com.
 * Color names are Belgard's. The four colors per entry are averages read from Belgard's swatch
 * thumbnails (lightest to darkest): close, not exact; the mapped walls are re-read from the full-size swatch photos (4-means
 * in linear light, 120 px, 12 px inset). No Belgard image ships with the app.
 * `shelf` is where the line sits in the catalogue; `sizes` are the paver sizes in inches.
 */
import type { UnitFace, WallUnit } from './catalog';

export interface MakerLine {
  slug: string;
  name: string;
  shelf: 'Pavers' | 'Retaining walls' | 'Garden walls' | 'Curb';
  sizes?: [number, number][];
  /** Paver face and joint width (in), when the line differs from the usual textured face and 0.2 in joint. */
  face?: 'smooth' | 'textured' | 'woodgrain' | 'slate' | 'antiqued';
  joint?: number;
  /** Colors sold in other sizes than the line's (Antiqued Flat Top Midnight: 6 x 9 only). */
  colorSizes?: Record<string, [number, number][]>;
  /** The line sells a matching 6 x 9 border stone, offered in every color. */
  border?: boolean;
  /** Wall lines: the face and the unit's real sizes (see WallUnit in the catalog). */
  wall?: { face: 'smoothUnit' | 'roughHewn' | UnitFace; unit: WallUnit };
  /**
   * A face mix for the colors that give their tones' shares (a third entry per color): the drifts' spatial frequency
   * (cycles per meter, along and across), their soft edge and break-up, and each piece's end-to-end shading and lean
   * (see PaverPattern's mix fields in the catalog).
   */
  mix?: { scale: [number, number]; edge: [number, number]; shade: [number, number] };
  /** Color name, its tones (photo colors) and, for a face mix, each tone's share of the face (the first is the base). */
  colors: [string, string[], number[]?][];
}

export const BELGARD_LINES: MakerLine[] = [
  // Avalon Slate: 3-piece set, 2 3/8 in thick, "natural slate texture with a unique rippled face" (belgard.com). Colors with a
  // swatch on Belgard's product page (Rainier and Victorian read from the swatch photos the color picker loads).
  // Toscana and Victorian, the two colors Belgard's Pacific (Stockton) region sells, are re-read from Belgard's full-size
  // photos (Toscana's Pattern A modular photo, Victorian's swatch): 5-means in CIELAB over 6 px cells in linear light,
  // joints masked, with each tone's share of the face. The stones cloud through those tones in soft patches 10 to 25 cm
  // across (Toscana: mocha brown with charcoal-gray and tan patches; Victorian: taupe gray with golden ochre and dark
  // gray patches), and each stone shades from end to end. The tones are spread 25% wider than the cluster means (the
  // soft blend averages them back) and set so the stone renders at the photo's mean color in the default afternoon
  // light (the sun warmed it about 6 b* over the photo).
  { slug: 'avalon-slate', name: "Avalon Slate", shelf: 'Pavers', sizes: [[6, 12], [9, 12], [12, 12]], face: 'slate', joint: 0.12, border: true, mix: { scale: [3, 3], edge: [0.16, 0], shade: [0.08, 0.06] }, colors: [
    ["Autumn", ['#806d5a', '#736356', '#665a52', '#554b45']],
    ["Bella", ['#8d7b66', '#837260', '#7a6b5b', '#6e6355']],
    ["Midnight", ['#4f4e4c', '#4a4947', '#474644', '#434240']],
    ["Rio", ['#78746e', '#6d6a65', '#63605b', '#54514d']],
    ["Sierra", ['#7c6c5f', '#746458', '#6c5d52', '#584e45']],
    ["Sonoran Gray", ['#817b77', '#77706c', '#6c6561', '#595450']],
    ["Toscana", ['#766a63', '#6e645e', '#7e7169', '#655e59', '#877a70'], [0.286, 0.254, 0.227, 0.137, 0.096]],
    ["Rainier", ['#736455', '#6d6052', '#665c51', '#5f574f']],
    ["Victorian", ['#746f6b', '#817d7b', '#67625d', '#736a60', '#7f756b'], [0.334, 0.182, 0.18, 0.153, 0.151]],
  ] },
  // Antiqued Flat Top (Heritage Collection), from Belgard's Pacific (Stockton) cut sheet, 01/2025: a 60 mm (2 3/8 in)
  // 3-piece set of 6 x 9, 9 x 9 and 9 x 12, and a 6 x 9 accent piece for borders. "Gently weathered smooth face".
  // Pallet layer: 8 of 6 x 9, 8 of 9 x 9, 6 of 9 x 12 (25%, 37.5%, 37.5% by area); Midnight is sold in 6 x 9 only.
  // Colors are the 8 the Pacific region lists. Six are read from Belgard's web swatch photos; Brown Beige Charcoal and
  // Tan Red Charcoal have no web photo and are read from the cut sheet's swatches, matched to the web photos through the
  // six colors both show (the print is within 1% of the photos on average).
  { slug: 'antiqued-flat-top', name: "Antiqued Flat Top", shelf: 'Pavers', sizes: [[6, 9], [9, 9], [9, 12]], face: 'antiqued', joint: 0.15, border: true, colorSizes: { Midnight: [[6, 9]] }, colors: [
    ["Brown Beige Charcoal", ['#93857c', '#857871', '#756964', '#635a57']],
    ["Cream Tan Brown", ['#8f7a66', '#86715e', '#7f6958', '#766152']],
    ["Gray Charcoal", ['#7f7f7a', '#767571', '#6b6a67', '#5f5e5c']],
    ["Gray Charcoal Tan", ['#7d7872', '#817162', '#756c64', '#68645f']],
    ["Midnight", ['#4e4e4c', '#4a4947', '#474644', '#444341']],
    ["Shaded Gray", ['#86817b', '#817c75', '#7d7871', '#78736d']],
    ["Tan Brown Charcoal", ['#836c59', '#77665a', '#6f6158', '#665c56']],
    ["Tan Red Charcoal", ['#906d59', '#86614e', '#7c5a47', '#6d4f3e']],
  ] },
  // The Dimensions lines (6, 12 60mm, 12 80mm, 18, Single Units, Slabs): Belgard lists a smooth finish with clean lines
  // (Single Units: a 3 mm micro-chamfer), and the swatch photos show smooth faces with the tones clouded through each
  // piece. Dimensions Antiqued instead has a weathered, gently distressed surface with antiqued (worn, rounded) edges,
  // drawn with the Antiqued Flat Top face. (belgard.com product pages, read 2026-11-18.)
  { slug: 'dimensions-6', name: "Dimensions 6", shelf: 'Pavers', sizes: [[3, 6], [6, 6], [6, 9]], face: 'smooth', colors: [
    ["Anthracite", ['#5d5957', '#565250', '#524e4c', '#4d4947']],
    ["Aspen", ['#e2d3be', '#d9c9b3', '#d0c0a9', '#b9a992']],
    ["Avondale", ['#c8b5a2', '#b6a492', '#a08f80', '#85766b']],
    ["Bella", ['#9c7b69', '#8a6b5d', '#7d6053', '#6b5147']],
    ["Cheswick", ['#9d9990', '#959188', '#8f8b82', '#858077']],
    ["Danville", ['#9e8a7b', '#968374', '#917e6f', '#897567']],
    ["Dune", ['#ceb69d', '#c7b097', '#c0a890', '#b19a81']],
    ["Hatteras", ['#bbaea5', '#aea198', '#a3978f', '#8c837d']],
    ["Hickory", ['#b8ac9c', '#aea191', '#a79b8a', '#9e9181']],
    ["Iron Bay", ['#6f6861', '#69635c', '#665f58', '#605952']],
    ["Lueders Gray", ['#938a80', '#887f75', '#81786e', '#766e65']],
    ["Magnolia", ['#c0b7b2', '#aaa4a0', '#9a9492', '#837f7e']],
    ["Napoli", ['#b09f91', '#9e8b7e', '#958275', '#887467']],
    ["Newport Gray", ['#75726b', '#69665f', '#615f59', '#575650']],
    ["Potomac", ['#7e6f62', '#776a5e', '#72665c', '#6a6158']],
    ["Rio", ['#aca8a3', '#9e9a96', '#928f8a', '#827e7a']],
    ["Savannah", ['#a18e78', '#94816e', '#8c7b69', '#837463']],
    ["Scandina Gray", ['#a9a397', '#a39d90', '#9d978b', '#948e82']],
    ["Scandina Grey", ['#656463', '#5f5e5c', '#5a5957', '#555352']],
    ["Sepia", ['#a79989', '#a19282', '#9d8f7e', '#968777']],
    ["Shaded Gray", ['#847f79', '#807b75', '#7d7872', '#79746e']],
    ["Sierra", ['#af907e', '#a18372', '#957767', '#876a5b']],
    ["Sonoran Gray", ['#a9a2a0', '#9b9291', '#8f8786', '#7b7574']],
    ["Victorian", ['#847a6d', '#7f7467', '#786d60', '#6c6256']],
  ] },
  { slug: 'dimensions-12-60mm', name: "Dimensions 12 60mm", shelf: 'Pavers', sizes: [[6, 12], [12, 12], [12, 18]], face: 'smooth', colors: [
    ["Amber Beige", ['#cbb18f', '#c7ad8b', '#c4a987', '#bca27f']],
    ["Anthracite", ['#5a5655', '#534f4e', '#504c4b', '#4c4847']],
    ["Ashwood", ['#797067', '#70675e', '#6b625a', '#655c54']],
    ["Aspen", ['#b19d8d', '#a38e7c', '#978270', '#88725f']],
    ["Aspen Blend", ['#ac9a7f', '#a5937a', '#9e8c72', '#8f7b64']],
    ["Avondale", ['#c8b5a2', '#b6a492', '#a08f80', '#85766b']],
    ["Bella", ['#725c4f', '#6b574c', '#68544a', '#655048']],
    ["Cheswick", ['#9e9a8f', '#959087', '#8f8a81', '#858178']],
    ["Cliffside", ['#c2a792', '#b89c88', '#b29581', '#a58673']],
    ["Danville", ['#a8907e', '#978070', '#867162', '#705c50']],
    ["Dune", ['#ceb69d', '#c7b097', '#c0a890', '#b19a81']],
    ["Galway", ['#bdb0a5', '#b1a49a', '#a99d93', '#9a9089']],
    ["Hatteras", ['#beb19e', '#a89c8d', '#92877a', '#76716a']],
    ["Hickory", ['#6c635b', '#685f57', '#645b52', '#5e554b']],
    ["Iron Bay", ['#7a736a', '#756e65', '#716961', '#69625a']],
    ["Limestone", ['#8f8478', '#877d71', '#82786b', '#7b7063']],
    ["Linen", ['#a08e76', '#9c8a71', '#99876e', '#948269']],
    ["Lueders Gray", ['#92887e', '#877c71', '#7d756c', '#726b62']],
    ["Magnolia", ['#b1aa9c', '#a29c91', '#959087', '#8a857d']],
    ["Napoli", ['#a9978a', '#9b897c', '#938074', '#847265']],
    ["Newport Gray", ['#777874', '#737470', '#6f6f6c', '#6a6a67']],
    ["Potomac", ['#a8947a', '#a18e74', '#9d8a70', '#97846a']],
    ["Rio", ['#b6ae9f', '#a69e90', '#9b9386', '#8e8679']],
    ["Riviera", ['#928b81', '#8a8379', '#847d73', '#7b746a']],
    ["Savannah", ['#b19079', '#a58671', '#9e7f6b', '#91725e']],
    ["Scandina Gray", ['#c8c0b9', '#bdb6af', '#b6afa8', '#a9a29b']],
    ["Sepia", ['#c8c9c8', '#c3c2c0', '#bebdba', '#b5b2b0']],
    ["Shaded Gray", ['#8b8880', '#85827a', '#807d75', '#79766e']],
    ["Sonoran Gray", ['#aaa2a0', '#9b9391', '#908887', '#7c7575']],
    ["Teak", ['#696058', '#5d5450', '#59504c', '#534b47']],
    ["Toscana", ['#88725d', '#816c58', '#7d6955', '#786450']],
    ["Victorian", ['#c1b49f', '#b8aa96', '#ada18d', '#a09481']],
  ] },
  { slug: 'dimensions-12-80mm', name: "Dimensions 12 80mm", shelf: 'Pavers', sizes: [[6, 12], [12, 12], [12, 18]], face: 'smooth', colors: [
    ["Anthracite", ['#61625f', '#585956', '#555654', '#515250']],
    ["Aspen", ['#b3a288', '#a7967c', '#a09075', '#97876d']],
    ["Cheswick", ['#9f9b91', '#969288', '#908c82', '#878379']],
    ["Hickory", ['#736d61', '#706a5e', '#6e685c', '#696357']],
    ["Iron Bay", ['#706961', '#6b645c', '#676059', '#635c54']],
    ["Rio", ['#78756e', '#737069', '#6f6c65', '#69665f']],
    ["Scandina Gray", ['#c8c0b9', '#bdb6af', '#b6afa8', '#a9a29b']],
    ["Sepia", ['#a28a72', '#9c846c', '#988068', '#937b63']],
    ["Shaded Gray", ['#a1a5a2', '#949794', '#8a8d89', '#7d7f7b']],
    ["Victorian", ['#867968', '#827665', '#7f7363', '#796e5e']],
  ] },
  { slug: 'dimensions-18', name: "Dimensions 18", shelf: 'Pavers', sizes: [[9, 18], [18, 18], [18, 27]], face: 'smooth', colors: [
    ["Amber Beige", ['#cbb18e', '#c8ad8a', '#c4a987', '#bba07e']],
    ["Anthracite", ['#7a7b78', '#747572', '#6e6f6c', '#676865']],
    ["Aspen", ['#b09f85', '#a09076', '#998a70', '#918369']],
    ["Aspen Blend", ['#aa977d', '#9f8d74', '#94816b', '#8a7560']],
    ["Avondale", ['#c8b5a2', '#b6a492', '#a08f80', '#85766b']],
    ["Cheswick", ['#a79f95', '#9b938a', '#918b82', '#837d76']],
    ["Cliffside", ['#b8a992', '#b3a48d', '#afa089', '#a79881']],
    ["Danville", ['#a8907e', '#978070', '#867162', '#705c50']],
    ["Dune", ['#ceb69d', '#c7b097', '#c0a890', '#b19a81']],
    ["Galway", ['#827463', '#7c6e5d', '#786a5a', '#736555']],
    ["Hatteras", ['#b7aa9b', '#a99d90', '#9b8f82', '#867c72']],
    ["Hickory", ['#83756a', '#7c6e64', '#77695f', '#71645a']],
    ["Iron Bay", ['#716a62', '#6c655d', '#686159', '#645d55']],
    ["Linen", ['#9c8c7a', '#978876', '#948574', '#908271']],
    ["Magnolia", ['#b6b1a4', '#a9a298', '#9b958d', '#8b8680']],
    ["Napoli", ['#ab998c', '#99867a', '#917f72', '#847367']],
    ["Newport Gray", ['#716a62', '#6d665e', '#69635b', '#635d55']],
    ["Rio", ['#b6ae9f', '#a69e90', '#9b9386', '#8e8679']],
    ["Riviera", ['#9a938b', '#8e8780', '#847d77', '#77726b']],
    ["Savannah", ['#b19f90', '#a69486', '#9a8a7d', '#85766a']],
    ["Scandina Gray", ['#c0b9ae', '#b9b3a7', '#b4ada2', '#a9a297']],
    ["Sepia", ['#cccdcd', '#c6c7c7', '#c3c2c1', '#bcbbb9']],
    ["Shaded Gray", ['#a9aba9', '#a3a6a3', '#9fa19e', '#8c8e8c']],
    ["Teak", ['#615a58', '#5b5452', '#58514f', '#544d4b']],
    ["Toscana", ['#b29778', '#a1886d', '#937d66', '#86705c']],
    ["Victorian", ['#c1b49f', '#b8aa96', '#ada18d', '#a09481']],
  ] },
  { slug: 'dimensions-antiqued', name: "Dimensions Antiqued", shelf: 'Pavers', sizes: [[3, 6], [6, 6], [6, 9]], face: 'antiqued', colors: [
    ["Anthracite", ['#635f5d', '#5b5755', '#565250', '#4f4b4a']],
    ["Ashwood", ['#857d74', '#776f67', '#706860', '#686058']],
    ["Avondale", ['#b8a792', '#a89783', '#988977', '#857769']],
    ["Bourbon", ['#6f5b4f', '#69554a', '#665247', '#614d42']],
    ["Cheswick", ['#b1ada2', '#a5a196', '#9c988e', '#918c83']],
    ["Danville", ['#897c6f', '#807366', '#7a6d61', '#72675d']],
    ["Danville Beige", ['#9e8b7c', '#978475', '#927f70', '#8d7a6b']],
    ["Hickory", ['#908275', '#857769', '#7e7063', '#76685b']],
    ["Iron Bay", ['#7d766e', '#746d65', '#6f6860', '#686159']],
    ["Lueders Gray", ['#9e958a', '#8f867b', '#857d72', '#797067']],
    ["Midnight", ['#5c5d5f', '#565759', '#535456', '#4e4f51']],
    ["Newport Gray", ['#868682', '#7b7b77', '#757571', '#6c6c69']],
    ["Potomac", ['#85796c', '#7b7065', '#746a61', '#6b635b']],
    ["Savannah", ['#ac9983', '#9f8b76', '#98846f', '#8e7a66']],
    ["Scandina Gray", ['#ada79b', '#a29c90', '#9b9589', '#938c81']],
    ["Sepia", ['#b19f8b', '#a69480', '#a08e7a', '#998773']],
    ["Shaded Gray", ['#78756e', '#706d66', '#6b6861', '#65625b']],
  ] },
  // Dimensions Single Units: the colors Belgard lists for the Pacific Stockton region (the 6 x 9 x 2 3/8 in unit is sold
  // there) were re-read from each swatch photo as four clustered tones; the rest are still thumbnail averages.
  // Scandina Gray (here and in Dimensions Slabs) and Slabs Hickory: the darkest cluster was the photo's joint lines (2 to
  // 4% of the photo) drawn as a quarter of the pieces; re-clustered without them (2026-11-18).
  { slug: 'dimensions-single-units', name: "Dimensions Single Units", shelf: 'Pavers', sizes: [[6, 9]], face: 'smooth', colors: [
    ["Anthracite", ['#5e5c58', '#575451', '#514f4c', '#4c4a48']],
    ["Aspen", ['#d2cbc7', '#bbb5b2', '#a09c98', '#686563']],
    ["Autumn", ['#b39a87', '#9f8675', '#8e7667', '#786155']],
    ["Bella", ['#bb8d74', '#a57d6d', '#8c6b62', '#5e4b48']],
    ["Bella Blend", ['#715d52', '#6c584e', '#69554c', '#665249']],
    ["Black Diamond", ['#524e4d', '#504c4b', '#4e4a49', '#4b4746']],
    ["Bourbon", ['#5c554b', '#524b41', '#50493f', '#463f38']],
    ["Brown Beige Charcoal", ['#8e8076', '#82756e', '#7a6c65', '#6c6461']],
    ["Charcoal", ['#5a5a5a', '#515251', '#4c4c4c', '#434444']],
    ["Cheswick", ['#a19d93', '#9a968c', '#949087', '#8a867d']],
    ["Cream Tan Brown", ['#8c7663', '#836d5a', '#7a6554', '#705d50']],
    ["Fog", ['#7d7972', '#78746d', '#747068', '#66635d']],
    ["Graphite", ['#8c847a', '#817970', '#776f66', '#6c645d']],
    ["Gray Charcoal", ['#c0c1c2', '#adaeaf', '#97989b', '#7f8084']],
    ["Gray Charcoal Tan", ['#7e7871', '#757069', '#7d6d5f', '#6a6560']],
    ["Hickory", ['#655e55', '#615a51', '#5e574f', '#5a534b']],
    ["Iron Bay", ['#726c64', '#6d665e', '#676159', '#615a53']],
    ["Linen", ['#9d8d7d', '#988978', '#958675', '#918271']],
    ["Midnight", ['#585858', '#515151', '#4b4b4b', '#3f3f3f']],
    ["Montecito", ['#a58f6e', '#9f8968', '#9b8564', '#97805f']],
    ["Moonlight", ['#ae9d83', '#ae9d83', '#ad9c82', '#ad9c82']],
    ["Napoli", ['#ab998c', '#99867a', '#917f72', '#847367']],
    ["Pearl", ['#a4a094', '#9b978c', '#989489', '#75726a']],
    ["Rio", ['#756f69', '#706a64', '#6d6761', '#69645e']],
    ["Riviera", ['#9f9990', '#928b84', '#847e78', '#746e68']],
    ["Rosewood", ['#5f4e47', '#5a4942', '#594841', '#54453e']],
    ["Scandina Gray", ['#bec0c4', '#bababd', '#b5b4b6', '#aeacac']],
    ["Sepia", ['#ad9c83', '#a49279', '#9b8970', '#917f68']],
    ["Shaded Gray", ['#807e77', '#76746e', '#6f6d67', '#686560']],
    ["Shaded Grey", ['#62615f', '#5d5c5a', '#5a5957', '#565553']],
    ["Sierra", ['#af907e', '#a18372', '#957767', '#876a5b']],
    ["Sonoran Gray", ['#797670', '#72706a', '#6f6c66', '#696760']],
    ["Suede", ['#7b675b', '#6f5c50', '#69564a', '#604d41']],
    ["Tan Brown Charcoal", ['#836b57', '#796657', '#706158', '#675d57']],
    ["Tan Red Charcoal", ['#876751', '#82604d', '#7c5b49', '#735848']],
    ["Toscana", ['#8e7660', '#846f5d', '#7c695a', '#706257']],
    ["Victorian", ['#a49177', '#948c7e', '#837a6d', '#68625a']],
  ] },
  { slug: 'dimensions-slabs', name: "Dimensions Slabs", shelf: 'Pavers', sizes: [[12, 24], [24, 24], [24, 36]], face: 'smooth', colors: [
    ["Anthracite", ['#5f5c58', '#575451', '#504e4c', '#4b4847']],
    ["Aspen", ['#e2d2bd', '#d6c5ae', '#c5b39c', '#a89782']],
    ["Bella", ['#ac846b', '#967362', '#816458', '#675149']],
    ["Cheswick", ['#a39e92', '#99948a', '#8f8a81', '#817d76']],
    ["Fog", ['#7b7871', '#78756d', '#757169', '#716d64']],
    ["Hickory", ['#aea696', '#a89f8f', '#a19787', '#938a7b']],
    ["Iron Bay", ['#746e66', '#6e685f', '#68625a', '#5e5952']],
    ["Linen", ['#9f8e7c', '#998977', '#938473', '#796e60']],
    ["Midnight", ['#4a4a48', '#474644', '#444341', '#42413f']],
    ["Pearl", ['#b5afa3', '#b1ac9f', '#ada79a', '#a6a194']],
    ["Rio", ['#979491', '#858482', '#706f6f', '#59595a']],
    ["Riviera", ['#9b9588', '#928b80', '#868077', '#79726b']],
    ["Scandina Gray", ['#d1d0d2', '#c6c5c7', '#b9b9bc', '#acacaf']],
    ["Sepia", ['#cbced0', '#c6c6c6', '#c1bebc', '#aaa8a6']],
    ["Shaded Gray", ['#8c8781', '#847f78', '#7f7a73', '#77726c']],
    ["Sonoran Gray", ['#aea7a4', '#9c9392', '#898181', '#696262']],
    ["Suede", ['#615046', '#5f4f42', '#5f4e44', '#5d4c42']],
    ["Victorian", ['#9a9285', '#a28c6e', '#877e71', '#6b645c']],
  ] },
  // AB Classic (Allan Block, sold by Belgard): 8 x 18 x 12 in split-face blocks with beveled edges in 8 in courses, laid
  // in half bond; AB Capstone 4 x 18 x 12 in. Real walls step back 6 degrees per course; drawn plumb here.
  { slug: 'ab-classic', name: "AB Classic", shelf: 'Retaining walls', wall: { face: 'roughHewn', unit: { course: 8, lengths: [18], bond: 'half', capIn: 4, capOver: 0.5 } }, colors: [
    ["Brown Beige Charcoal", ['#a89483', '#917d6e', '#7b6b60', '#625851']],
    ["Buff", ['#93836d', '#877762', '#7d6e5a', '#6e6250']],
    ["Charcoal", ['#8b8070', '#706960', '#615a52', '#4f4943']],
    ["Dakota Blend", ['#b99b88', '#a88875', '#927566', '#705a50']],
    ["Danville Blend", ['#baa38c', '#a88d75', '#937a66', '#766355']],
    ["Driftwood", ['#887d70', '#7b7166', '#6f675d', '#5f5850']],
    ["Granite Gray", ['#878078', '#6e6863', '#57534f', '#393634']],
    ["Gray", ['#a5a9ac', '#999b9b', '#8d8e8d', '#767776']],
    ["Gray Charcoal Tan", ['#9c907d', '#887c6c', '#756b5e', '#5a554d']],
    ["Grey", ['#9a9996', '#8a8a87', '#7c7d7a', '#6e6f6d']],
    ["Mocha", ['#a7937f', '#95826f', '#867464', '#726354']],
    ["Pewter Blend", ['#bebab0', '#a9a59b', '#8e8b84', '#6e6c68']],
    ["Rocky Mountain", ['#a8917c', '#887464', '#6a594d', '#473b33']],
    ["Sable", ['#a8a195', '#8f8980', '#75706a', '#56524d']],
    ["Sable Blend", ['#a9a294', '#908a80', '#75706a', '#56534f']],
    ["Silverado", ['#908f8c', '#7f7f7e', '#727373', '#616364']],
    ["Tan", ['#b2997e', '#9d846c', '#89735d', '#715e4c']],
    ["Tan Brown Charcoal", ['#a58e78', '#8f7a67', '#79695c', '#5c544d']],
    ["Thunderhead", ['#ada397', '#988f84', '#867e75', '#706a63']],
    ["Toccoa", ['#99856d', '#8a7964', '#7a6f62', '#67625c']],
  ] },
  // Artforms: smooth 18 x 36 x 3 in panels bolted together, set horizontal with the joints in line (stack bond), up to
  // 42 in; optional coping of the 6 x 36 x 3 in panel laid flat. (Panels set upright, 36 x 18, are not drawn yet.)
  { slug: 'artforms', name: "Artforms", shelf: 'Garden walls', wall: { face: 'smoothUnit', unit: { course: 18, lengths: [36], bond: 'stack', capIn: 3, capOver: 0.5 } }, colors: [
    ["Anthracite", ['#64625e', '#5d5a57', '#575451', '#514e4c']],
    ["Hickory", ['#897e72', '#84786c', '#807467', '#7c6f63']],
    ["Rockland Black", ['#585858', '#565756', '#555554', '#535352']],
    ["Scandina Gray", ['#b5aea4', '#aea89e', '#a9a399', '#a39c92']],
  ] },
  // Ashlar Tandem Wall: 7 in Tandem faces (13 3/16, 15 13/16, 18 7/16 in) at random, each scored across and up into
  // several chiseled ashlar stones; Tandem cap 3 1/4 x 24 x 15 in, chiseled front edge, about 1 1/2 in over.
  { slug: 'ashlar-tandem-wall', name: "Ashlar Tandem Wall", shelf: 'Garden walls', wall: { face: 'ashlar', unit: { course: 7, lengths: [13.1875, 15.8125, 18.4375], capIn: 3.25, capOver: 1.5 } }, colors: [
    ["Avondale", ['#ccb093', '#ad957f', '#8a7667', '#3c3028']],
    ["Cheswick", ['#aba599', '#989288', '#837e76', '#65615b']],
    ["Newport Gray", ['#8f897f', '#78746e', '#64625d', '#4d4c48']],
    ["Pewter", ['#7d7b7a', '#696767', '#555354', '#313030']],
    ["Rainier", ['#958779', '#7d7165', '#675e55', '#37322e']],
    ["Rio", ['#948f87', '#7b7771', '#66635e', '#373633']],
    ["Riviera", ['#c4c1bc', '#b3b0ac', '#9e9b98', '#4c4b48']],
    ["Scandina Gray", ['#8b8172', '#82796b', '#776f64', '#676056']],
    ["Shelby", ['#c5b2a4', '#ae9b8c', '#938275', '#49413b']],
    ["Sierra", ['#a98c7c', '#9a7f6f', '#896d5e', '#30231d']],
    ["Toscana", ['#c4a489', '#ac937c', '#967e6a', '#493e35']],
    ["Victorian", ['#c5b19a', '#b7a28b', '#a08e78', '#544b40']],
  ] },
  // Belair Wall: hand-chiseled 6 in courses of 8 and 16 in units mixed about 1:1; trapezoid cap 3 x 13 1/2 in deep,
  // about 1 1/4 in over. (Half the 16s carry a micro joint about 6 in from one end; not drawn.)
  { slug: 'belair-wall', name: "Belair Wall", shelf: 'Garden walls', wall: { face: 'roughHewn', unit: { course: 6, lengths: [8, 16], capIn: 3, capOver: 1.25 } }, colors: [
    ["Ashwood", ['#a99c85', '#948a77', '#82796a', '#6a655c']],
    ["Hickory", ['#827161', '#796859', '#6d5e4f', '#594c3f']],
    ["Iron Bay", ['#90877a', '#817a6f', '#736c64', '#635d57']],
    ["Newport Gray", ['#9e988f', '#89857d', '#79766f', '#65625c']],
    ["Shaded Gray", ['#8d8b86', '#7c7b77', '#6e6d6b', '#5e5f5e']],
  ] },
  // Belair Wall 2.0: the chiseled face in 6 in courses of 6, 10 and 16 in units (sold 2 x 16 + 10 + 6), laid in
  // Belgard's 48 in three-course pattern; the Belair cap.
  { slug: 'belair-wall-2-0', name: "Belair Wall 2.0", shelf: 'Garden walls', wall: { face: 'roughHewn', unit: { course: 6, lengths: [16, 10, 6], pattern: [{ start: 10, lengths: [16, 6, 16, 10] }, { start: 6, lengths: [6, 16, 10, 16] }, { start: 0, lengths: [16, 10, 16, 6] }], capIn: 3, capOver: 1.25 } }, colors: [
    ["Midnight", ['#595552', '#56534f', '#55514d', '#534f4c']],
    ["Napoli", ['#cdbba7', '#b4a493', '#9a8b7d', '#776c62']],
    ["Rio", ['#928b80', '#888277', '#7e786c', '#6f6a5f']],
    ["Shaded Gray", ['#91897c', '#7d766b', '#6d665f', '#5a5550']],
    ["Slate", ['#989791', '#878682', '#777774', '#656564']],
    ["Toscana", ['#88745f', '#7f6e5b', '#766757', '#695d4f']],
    ["Victorian", ['#a3927b', '#8d7f6d', '#7c7263', '#6a6155']],
  ] },
  // Brisa: crisp units with broad, shallow chisel scoops, 6 in courses of 6, 10 and 16 in laid in Belgard's 48 in
  // three-course pattern (shared with Belair Wall 2.0); the Belair cap.
  { slug: 'brisa', name: "Brisa", shelf: 'Garden walls', wall: { face: 'chiseled', unit: { course: 6, lengths: [16, 10, 6], pattern: [{ start: 10, lengths: [16, 6, 16, 10] }, { start: 6, lengths: [6, 16, 10, 16] }, { start: 0, lengths: [16, 10, 16, 6] }], capIn: 3, capOver: 1.25 } }, colors: [
    ["Heritage", ['#857c71', '#7e756a', '#786e63', '#6b6258']],
    ["Moonlight", ['#c8b498', '#bfac92', '#b5a38a', '#a29179']],
    ["Newport Gray", ['#888175', '#74726b', '#686762', '#5c5c58']],
  ] },
  // Castlemanor Grana: tumbled units, smooth faces with rounded, chipped edges, 6 in courses of 6, 12 and 16 in faces at
  // random; tumbled cap 3 x 10 x 12 in, about 1 in over. (Napoli and Slate are also sold untumbled in one region.)
  { slug: 'castlemanor-grana', name: "Castlemanor Grana", shelf: 'Garden walls', wall: { face: 'tumbled', unit: { course: 6, lengths: [6, 12, 16], capIn: 3, capOver: 1 } }, colors: [
    ["Avondale", ['#c1af9b', '#b6a48f', '#a39481', '#73695c']],
    ["Colonial", ['#927f6b', '#7e6e5e', '#716253', '#42362b']],
    ["Midnight", ['#7d7a76', '#6d6c69', '#62615f', '#43413e']],
    ["Misty Mountain", ['#a79f96', '#968e85', '#888077', '#625c56']],
    ["Napoli", ['#d5cbc7', '#c8b7ac', '#c6a28a', '#624c42']],
    ["Oxford", ['#969088', '#857f77', '#75706b', '#524d48']],
    ["Potomac", ['#9b8a7b', '#897b6f', '#7b6e65', '#4d453e']],
    ["Savannah", ['#b9ac9f', '#ac9e8f', '#9f8f80', '#635c53']],
    ["Slate", ['#96928b', '#85817b', '#76736f', '#52514e']],
    ["Teak", ['#6c645d', '#625a56', '#5c5351', '#564e4c']],
  ] },
  // Castlemanor Rustic: the same units with a rough, pitted, tumbled face; tumbled cap about 1 1/2 in over.
  { slug: 'castlemanor-rustic', name: "Castlemanor Rustic", shelf: 'Garden walls', wall: { face: 'tumbledRough', unit: { course: 6, lengths: [6, 12, 16], capIn: 3, capOver: 1.5 } }, colors: [
    ["Colonial", ['#907f6e', '#7d6d5c', '#6c5e50', '#52483e']],
    ["Misty Mountain", ['#a69e95', '#958d84', '#878077', '#615b55']],
    ["Napoli", ['#cdc5bb', '#b9b1a7', '#a29990', '#6f6760']],
    ["Potomac", ['#958474', '#807163', '#6d5f53', '#41372f']],
    ["Slate", ['#c8c3be', '#b3aeaa', '#9b9793', '#6c6764']],
  ] },
  // Coventry Wall III: quarried split face, white-flecked two-tone blends, 6 in courses of 8, 10 and 16 in units;
  // its own 3 x 12 x 16 in cap, about 1 in over.
  { slug: 'coventry-wall-iii', name: "Coventry Wall III", shelf: 'Garden walls', wall: { face: 'roughHewn', unit: { course: 6, lengths: [8, 10, 16], capIn: 3, capOver: 1 } }, colors: [
    ["Dakota Blend", ['#938473', '#877767', '#786e64', '#66615b']],
    ["Harvest Blend", ['#a1866f', '#927963', '#826d5c', '#6e5d50']],
    ["Pewter Blend", ['#a29c91', '#938f86', '#84817b', '#6d6c67']],
  ] },
  // Easton Stone: smooth, eased-edge units, 4 in courses of 8, 12 and 16 in faces in equal counts; capped with its
  // 4 x 12 x 8 in block laid across the wall. (Midnight, Rainier and Victorian come tumbled in one region.)
  { slug: 'easton-stone', name: "Easton Stone", shelf: 'Garden walls', wall: { face: 'smoothUnit', unit: { course: 4, lengths: [8, 12, 16], capIn: 4, capOver: 1 } }, colors: [
    ["Amaretto", ['#d7bda3', '#cbae95', '#b99c85', '#a0856f']],
    ["Anthracite", ['#615e5a', '#5a5754', '#53504d', '#3c3a38']],
    ["Bella", ['#9a816d', '#897664', '#766b62', '#625b57']],
    ["Danville Beige", ['#a89687', '#a08d7d', '#968373', '#847264']],
    ["Hickory", ['#83786c', '#796d61', '#6f6358', '#4d453d']],
    ["Lueders Gray", ['#979085', '#8d867d', '#837d74', '#746e67']],
    ["Midnight", ['#827b75', '#6e6964', '#5f5b58', '#54504e']],
    ["Napoli", ['#b7a99b', '#9f9286', '#918377', '#7a7068']],
    ["Rainier", ['#8d8070', '#7e7366', '#73695e', '#52483d']],
    ["Rio", ['#94948b', '#898982', '#7d7d77', '#676661']],
    ["Shaded Gray", ['#837d75', '#7a746c', '#716b64', '#504d48']],
    ["Sierra", ['#917b6a', '#877364', '#806d5f', '#715f54']],
    ["Slate", ['#aca69c', '#9a9690', '#8c8884', '#7d7a76']],
    ["Victorian", ['#9d8f7a', '#928470', '#827665', '#574e42']],
  ] },
  // Highland Stone: a rough-hewn split face, 6 in courses of 18 in units, each with a virtual joint so it reads as two
  // stones (6 + 12 or 12 + 6); 3 x 18 x 13 in cap. Belgard: "rough-hewn, rustic split stone ... deep shadow lines".
  { slug: 'highland-stone', name: "Highland Stone", shelf: 'Garden walls', wall: { face: 'roughHewn', unit: { course: 6, lengths: [18], split: [6, 12], capIn: 3, capOver: 1 } }, colors: [
    ["Ashwood", ['#8a7f72', '#7a6f64', '#6c6259', '#5b524a']],
    ["Bella", ['#98806b', '#84705e', '#716053', '#534840']],
    ["Brittany Beige", ['#736658', '#6d6257', '#685f55', '#635b53']],
    ["Brownstone", ['#938373', '#857566', '#786a5c', '#675b4f']],
    ["Carriage House", ['#a79280', '#97816f', '#877362', '#665648']],
    ["Cliffside", ['#c1b19b', '#b3a28b', '#a5937d', '#8c7c69']],
    ["Graystone", ['#7c7770', '#6d6862', '#615e59', '#54514d']],
    ["Iron Bay", ['#9a9082', '#8a8276', '#7a746c', '#5e5b56']],
    ["Misty Mountain", ['#a49787', '#93887a', '#82796e', '#665f55']],
    ["Oxford", ['#948c7e', '#847d72', '#756f66', '#5f5b54']],
    ["Oxford Charcoal", ['#948c7e', '#847d72', '#756f66', '#5f5b54']],
    ["Potomac", ['#978473', '#817366', '#70645a', '#5a4f46']],
    ["Rio", ['#998f80', '#8a8273', '#797267', '#625d56']],
    ["River Blend", ['#978f80', '#837e73', '#716f67', '#5d5b56']],
    ["Sandstone", ['#948879', '#887c6c', '#7c7162', '#595349']],
    ["Savannah", ['#ad9d85', '#9d8d78', '#8c7e6c', '#716555']],
    ["Shaded Gray", ['#8e8a81', '#7d7a74', '#6d6c67', '#51504e']],
    ["Shadow", ['#928a7c', '#7c7469', '#675f56', '#36322c']],
    ["Sheffield", ['#9f876c', '#8d7962', '#7b6f5f', '#695f52']],
    ["Timberline", ['#897c71', '#756b63', '#635c56', '#4a4440']],
    ["Toscana", ['#93755b', '#7d736a', '#72655c', '#62554c']],
    ["Victorian", ['#bfb3a0', '#a19584', '#7e7569', '#454039']],
  ] },
  // Lamina Tandem: Z-shaped Tandem faces, two 3 1/2 in halves offset 2 5/8 in, each one stone or two thin strips with
  // deep joints; the Tandem cap. Scandina Gray's swatch on belgard.com shows another product, so it takes Melville
  // Tandem's Scandina Gray (the same Tandem color).
  { slug: 'lamina-tandem', name: "Lamina Tandem", shelf: 'Garden walls', wall: { face: 'lamina', unit: { course: 7, lengths: [13.1875, 15.8125, 18.4375], halfShift: 2.625, capIn: 3.25, capOver: 1.5 } }, colors: [
    ["Pewter", ['#857e75', '#6c6761', '#58544f', '#262522']],
    ["Scandina Gray", ['#aea89c', '#a19b90', '#958f85', '#54504a']],
    ["Sienna", ['#8f7965', '#7a6858', '#645649', '#2c251f']],
  ] },
  // Melville Tandem Wall: smooth, linear faces 7 in tall in three lengths (13 3/16, 15 13/16, 18 7/16 in) laid at
  // random, tight joints; capped with the Melville cap (2 x 20 x 13 in). Belgard: "smooth face and linear design".
  { slug: 'melville-tandem-wall', name: "Melville Tandem Wall", shelf: 'Garden walls', wall: { face: 'smoothUnit', unit: { course: 7, lengths: [13.1875, 15.8125, 18.4375], capIn: 2, capOver: 0.75 } }, colors: [
    ["Anthracite", ['#524e4b', '#4c4844', '#45413e', '#36322f']],
    ["Midnight", ['#6b6663', '#5b5652', '#544f4b', '#33302d']],
    ["Newport Gray", ['#7e7a72', '#74706a', '#666460', '#585754']],
    ["Rio", ['#b3afad', '#9e9b9b', '#8a8888', '#646264']],
    ["Riviera", ['#a39f96', '#928e87', '#807c77', '#5c5953']],
    ["Scandina Gray", ['#aea89c', '#a19b90', '#958f85', '#54504a']],
    ["Toscana", ['#b09882', '#9f8977', '#8b7869', '#594b41']],
    ["Victorian", ['#bfac96', '#ab9f90', '#93897e', '#575048']],
  ] },
  // Melville Wall: smooth 4 x 20 x 10 in double-sided blocks in half bond (each course shifted 10 in); Melville
  // cap 2 x 20 x 13 in, about 1 1/2 in over.
  { slug: 'melville-wall', name: "Melville Wall", shelf: 'Garden walls', wall: { face: 'smoothUnit', unit: { course: 4, lengths: [20], bond: 'half', capIn: 2, capOver: 1.5 } }, colors: [
    ["Amber Beige", ['#c5b091', '#bba485', '#96836a', '#373025']],
    ["Anthracite", ['#73716e', '#605e5b', '#54514f', '#494644']],
    ["Bella", ['#897264', '#76645a', '#645a56', '#483a33']],
    ["Cliffside", ['#c3b39c', '#baa991', '#ae9c85', '#695f52']],
    ["Hatteras", ['#b8b1a3', '#a99d8d', '#9b8b78', '#6a6055']],
    ["Hickory", ['#8a7b6f', '#726559', '#6d5f54', '#453c36']],
    ["Linen", ['#c8c0b0', '#bbb2a1', '#aea494', '#7a7162']],
    ["Lueders Gray", ['#969085', '#8d867c', '#837c74', '#756f67']],
    ["Midnight", ['#545454', '#4f4f4f', '#4b4a4b', '#2c2c2c']],
    ["Napoli", ['#c7bfb3', '#afa59a', '#9b8f85', '#7a7067']],
    ["Rio", ['#a19e9a', '#8c8b88', '#7f7d7a', '#5d5a58']],
    ["Riviera", ['#a39f96', '#928e87', '#7f7c77', '#5c5953']],
    ["Scandina Gray", ['#d4cec5', '#c6c0b9', '#b4aea6', '#8b847c']],
    ["Shaded Gray", ['#8f8b84', '#86827c', '#7e7a74', '#4e4c48']],
    ["Slate", ['#868680', '#7a7a75', '#6c6d68', '#494844']],
    ["Sonoran Gray", ['#8d8580', '#7d7571', '#726a66', '#433c38']],
    ["Victorian", ['#958c7b', '#8a8172', '#7e7769', '#4f473b']],
  ] },
  // Papyrus Artforms: Artforms panels set upright (18 wide, 36 in tall, joints in line) with a shallow cut crosshatch
  // of mostly vertical strokes; plain coping. Colors read from the panel face of Belgard's renders (Scandina Gray
  // looks warmer and lighter in the cut sheet photo).
  { slug: 'papyrus-artforms', name: "Papyrus Artforms", shelf: 'Garden walls', wall: { face: 'papyrus', unit: { course: 36, lengths: [18], bond: 'stack', capIn: 3, capOver: 0.5 } }, colors: [
    ["Hickory", ['#918878', '#8b8273', '#857b6d', '#7b7266']],
    ["Scandina Gray", ['#999b99', '#8f918f', '#868887', '#797c7d']],
  ] },
  // Melville Curb: 4 in thick, 24 in long, 6 1/2 in tall (belgard.com). Colors re-read from each swatch photo as four
  // clustered tones (4-means in linear light, 120 px, 12 px inset).
  { slug: 'melville-curb', name: "Melville Curb", shelf: 'Curb', colors: [
    ["Anthracite", ['#6a6c69', '#626361', '#5c5d5b', '#575856']],
    ["Bourbon", ['#5e5448', '#5d5349', '#5d5347', '#5c5247']],
    ["Fog", ['#9b978b', '#9a968a', '#999589', '#989488']],
    ["Hatteras", ['#b6ab9c', '#a69b8e', '#988a7e', '#84776d']],
    ["Hickory", ['#6e675d', '#6a6258', '#665f55', '#635c52']],
    ["Midnight", ['#444341', '#434240', '#42413f', '#41403e']],
    ["Pearl", ['#9d9b8f', '#9c9a8e', '#9b998d', '#9a988c']],
    ["Rio", ['#b4b0ab', '#a5a19d', '#95918e', '#74726f']],
    ["Toscana", ['#776656', '#6e5d4e', '#675e55', '#645748']],
    ["Victorian", ['#ad9f87', '#a1927b', '#92856e', '#7e725e']],
  ] },
];
