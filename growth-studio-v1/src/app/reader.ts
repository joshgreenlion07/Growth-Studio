import { FEATURES, MATERIALS, PLANTS } from '../siteplan/catalog';
import { cleanPlan, type CleanResult } from '../siteplan/validate';

/**
 * The plan reader: turns a blueprint or yard photo into a SitePlan.
 * The same prompt is used by the published app (through the viewer's Claude
 * account) and by the optional server in server/read-plan-server.mjs.
 */

export type SourceKind = 'blueprint' | 'photo';

export interface ReadRequest {
  kind: SourceKind;
  /** Notes from the designer: lot size, what to show, plant preferences. */
  notes: string;
  /** Known width and depth of the lot in feet, if the designer gave them. */
  lotFeet?: { width: number; depth: number };
}

function catalogText(): string {
  const plants = PLANTS.map((p) => `${p.id} (${p.name}, ${p.group.toLowerCase()})`).join('; ');
  const mats = MATERIALS.map((m) => `${m.id} [${m.use}] ${m.name}`).join('; ');
  const feats = FEATURES.map((f) => `${f.id} (${f.name}, ${f.footprint[0]}x${f.footprint[1]} m)`).join('; ');
  return `PLANTS: ${plants}\n\nMATERIALS: ${mats}\n\nFEATURES: ${feats}`;
}

export function buildPrompt(req: ReadRequest): string {
  const lot = req.lotFeet ? `The designer says the lot is ${req.lotFeet.width} ft wide and ${req.lotFeet.depth} ft deep. Use that for scale.` : 'If the drawing has a scale bar or written dimensions, use them for scale. Otherwise estimate from typical sizes: a car is about 5 m long, a garage door about 4.9 m wide, a standard paver about 20 cm.';
  const source =
    req.kind === 'blueprint'
      ? 'The image is a landscape plan or blueprint seen from above.'
      : 'The image is a photo of an existing yard. Work out the layout as if seen from above: estimate positions from perspective, and keep confidence low (0.3 to 0.6) on everything you estimate.';
  return `You read landscape plans for Green Lion Landscape and turn them into a JSON SitePlan for a 3D design tool.

${source}
${lot}

Designer notes: ${req.notes.trim() || 'none'}

COORDINATES: meters. x runs left to right across the image, y runs top to bottom, origin at the TOP-LEFT CORNER OF THE IMAGE (not the property). Also give "imageWidthMeters": how many meters the full width of the image covers, so the plan can be laid over the image. Polygons are lists of [x, y] points in order, not repeating the first point.

Use ONLY these catalog ids. Pick the closest match for anything else and say what it really is in "note".
${catalogText()}

Reply with only one JSON object in this shape:
{
  "imageWidthMeters": number,
  "site": { "name": string, "boundary": [[x,y],...], "streetEdge": index of the boundary edge facing the street or null, "northAngleDeg": 0 unless a north arrow says otherwise },
  "structures": [{ "id": string, "kind": "house"|"garage"|"shed", "polygon": [[x,y],...], "height": meters, "roof": "hip"|"flat", "confidence": 0..1 }],
  "zones": [{ "id": string, "kind": "turf"|"bed"|"hardscape", "catalogId": material id, "polygon": [[x,y],...], "confidence": 0..1, "note": string,
              "fill": { "catalogId": plant id, "spacing": meters } (beds with mass planting only),
              "border": { "catalogId": border material id, "width": meters } (hardscape with a border band only),
              "raised": { "wallCatalogId": wall material id, "height": meters } (raised planters only) }],
  "lines": [{ "id": string, "kind": "wall"|"fence"|"edging", "catalogId": material id, "points": [[x,y],...], "height": meters, "confidence": 0..1 }],
  "water": [{ "id": string, "kind": "pond"|"pool"|"fountain"|"stream"|"pondless", "polygon": [[x,y],...] (pond, pool, fountain), "points": [[x,y],...] (stream, pondless, starting at the top of the falls), "width": meters, "depth": meters, "confidence": 0..1 }],
  "plants": [{ "id": string, "catalogId": plant id, "position": [x,y], "existing": true if already there, "confidence": 0..1, "note": string }],
  "features": [{ "id": string, "catalogId": feature id, "position": [x,y] (center), "rotationDeg": degrees, "confidence": 0..1 }]
}

Rules:
- Every zone, line, plant and feature needs a confidence. Use below 0.6 when you are guessing.
- Later zones draw on top of earlier ones: list large beds and lawn first, patios and paths after.
- Plant symbols on plans are usually circles sized to the mature spread. Put one plant at each symbol's center.
- If a plant legend or schedule is shown, use it to pick catalog plants.
- Do not invent features that are not in the image or the notes.`;
}

export type Ask = (prompt: string, image: Blob, signal: AbortSignal) => Promise<unknown>;

export async function readPlan(ask: Ask, req: ReadRequest, image: Blob, signal: AbortSignal): Promise<CleanResult & { imageWidthMeters: number | null }> {
  const raw = await ask(buildPrompt(req), image, signal);
  const result = cleanPlan(raw);
  const iw = raw && typeof raw === 'object' ? Number((raw as Record<string, unknown>).imageWidthMeters) : NaN;
  for (const list of [result.plan.zones, result.plan.lines, result.plan.water, result.plan.plants, result.plan.features, result.plan.structures]) {
    for (const it of list) {
      it.source = 'ai';
      if (it.confidence === undefined) it.confidence = req.kind === 'photo' ? 0.5 : 0.7;
    }
  }
  return { ...result, imageWidthMeters: Number.isFinite(iw) && iw > 1 && iw < 2000 ? iw : null };
}

/** Downscale an image file to a JPEG of at most `max` pixels on the long side. */
export async function prepareImage(file: Blob, max = 1800): Promise<{ blob: Blob; url: string; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The image could not be read.'))), 'image/jpeg', 0.88));
  return { blob, url: URL.createObjectURL(blob), width: w, height: h };
}
