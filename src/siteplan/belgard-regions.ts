/**
 * Which Belgard colors are sold in Northern California, where Green Lion works: Belgard's Pacific Stockton region
 * (region 187 on belgard.com; Pacific Fontana is Southern California). Read on 2026-11-18 from each product page's
 * color swatches, which list the regions that carry each color (or mark it national), and checked against Green Lion's
 * supplier bills (California Landscape Supply, Resource Building Materials): every Belgard color on those bills is here.
 *
 * Where a page and the bills disagree the bills win: Melville Wall Midnight is bought here though its page lists it for
 * another region only. Antiqued Flat Top's Brown Beige Charcoal and Tan Red Charcoal are on Belgard's Pacific Stockton
 * cut sheet but not on the web page. A line listed with no colors is not sold in the region at all.
 *
 * A Belgard look of a line listed here whose color is not in its list is out of area (`isOutOfArea` in catalog.ts): it
 * is left off every picker unless approved in the Library, and its description says so in bold.
 */
export const NORCAL_REGION = 'Pacific Stockton';

/** Line name (the catalog's `line`) to the colors Belgard sells in its Pacific Stockton region. */
export const PACIFIC_STOCKTON: Record<string, string[]> = {
  'Catalina Grana': ['Anthracite', 'Aspen', 'Bella', 'Brown Beige Charcoal', 'Cream Tan Brown', 'Gray Charcoal', 'Gray Charcoal Tan', 'Hickory', 'Riviera', 'Scandina Gray', 'Sepia', 'Shaded Gray', 'Tan Brown Charcoal', 'Tan Red Charcoal', 'Toscana', 'Victorian'],  // bought: Riviera, Scandina Gray, Victorian
  'Avalon Slate': ['Toscana', 'Victorian'],
  'Antiqued Flat Top': ['Brown Beige Charcoal', 'Cream Tan Brown', 'Gray Charcoal', 'Gray Charcoal Tan', 'Midnight', 'Shaded Gray', 'Tan Brown Charcoal', 'Tan Red Charcoal'],  // bought: Tan Brown Charcoal
  'Dimensions 6': [],
  'Dimensions 12 60mm': ['Anthracite', 'Hickory', 'Riviera', 'Scandina Gray', 'Sepia', 'Toscana', 'Victorian'],
  'Dimensions 12 80mm': ['Anthracite', 'Hickory', 'Scandina Gray', 'Sepia', 'Shaded Gray'],
  'Dimensions 18': ['Anthracite', 'Riviera', 'Shaded Gray', 'Toscana', 'Victorian'],
  'Dimensions Antiqued': [],
  'Dimensions Single Units': ['Anthracite', 'Aspen', 'Bella', 'Bourbon', 'Brown Beige Charcoal', 'Cream Tan Brown', 'Fog', 'Graphite', 'Gray Charcoal', 'Gray Charcoal Tan', 'Hickory', 'Iron Bay', 'Midnight', 'Pearl', 'Riviera', 'Rosewood', 'Scandina Gray', 'Sepia', 'Shaded Gray', 'Shaded Grey', 'Tan Brown Charcoal', 'Tan Red Charcoal', 'Toscana', 'Victorian'],  // bought: Graphite, Scandina Gray, Victorian
  'Dimensions Slabs': ['Anthracite', 'Aspen', 'Hickory', 'Riviera', 'Scandina Gray', 'Sepia', 'Shaded Gray', 'Victorian'],  // bought: Anthracite
  'AB Classic': ['Brown Beige Charcoal', 'Gray', 'Gray Charcoal Tan', 'Grey', 'Tan', 'Tan Brown Charcoal'],
  'Artforms': ['Anthracite', 'Hickory', 'Scandina Gray'],
  'Ashlar Tandem Wall': ['Riviera', 'Toscana', 'Victorian'],  // bought: Victorian
  'Belair Wall': [],
  'Belair Wall 2.0': ['Shaded Gray', 'Toscana', 'Victorian'],
  'Brisa': [],
  'Castlemanor Grana': [],
  'Castlemanor Rustic': [],
  'Coventry Wall III': [],
  'Easton Stone': [],
  'Highland Stone': ['Bella', 'Toscana'],
  'Lamina Tandem': [],
  'Melville Tandem Wall': ['Riviera', 'Toscana', 'Victorian'],
  'Melville Wall': ['Anthracite', 'Hickory', 'Linen', 'Midnight', 'Riviera', 'Shaded Gray', 'Victorian'],  // bought: Midnight, Riviera
  'Papyrus Artforms': ['Hickory', 'Scandina Gray'],
  'Melville Curb': ['Fog', 'Midnight', 'Pearl'],
  'Dimensions Slabs 24 x 24': ['Anthracite', 'Aspen', 'Hickory', 'Riviera', 'Scandina Gray', 'Sepia', 'Shaded Gray', 'Victorian'],  // bought: Anthracite
};
