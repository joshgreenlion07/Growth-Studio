# Green Lion Growth Studio

A 3D landscape design tool for Green Lion Landscape. Drop in a blueprint or a
yard photo, check what was read on a 2D plan, and see the finished yard in 3D:
plants growing from install to 10 years, four lighting moods, wind, water,
night lighting, and a camera with focus blur.

## What's in V1
- **Plan or photo to scene.** Claude reads the plan and returns a SitePlan.
  Low-confidence items are outlined in amber for checking. Without Claude, the
  image goes under the plan to trace by hand, with a scale tool.
- **Plan editor.** Draw areas (pavers, porcelain, concrete, turf, beds),
  fences, walls, curbs, water, plants and features. Drag to move, drag corners
  to reshape, R to turn a feature, Delete to remove, Ctrl+Z to undo.
- **Catalog from Green Lion's work:** 42 plants, 55 surfaces (multi-size
  pavers with charcoal soldier borders and inset lights, porcelain plank,
  stamped and broom concrete, artificial turf and putting green, black mulch,
  black pebble, cobble), 9 fence styles, raised planters with caps, 27
  features (fire tables, louvered pergolas, L-shaped kitchens, hot tubs,
  saunas, three water wall styles, corten, copper bowls, brass path lights,
  uplights).
- **Water:** ponds, pools with a tanning ledge, fountains, streams and
  pondless waterfalls with lit falls.
- **Growth:** install, 1, 3, 5 and 10 years, from each plant's nursery and
  mature size.
- **Light:** real sun position for the property's latitude, north arrow and
  month. Afternoon, golden hour, blue hour and night.
- **Output:** 4K still images, a saved plan file, and a plant and material
  list with quantities.

## Run it
```
npm install
npm run dev              # local development
npm run check            # type-check
npm run build:artifact   # dist/growth-studio.html and dist/index.html
ANTHROPIC_API_KEY=... npm run server   # dist/ plus plan reading at /api/read-plan
```

## Embedding
Another page can show the 3D view in an iframe and send it a plan. Area
Planner does this.

Open the built page with `?embed=1` (for example
`https://<host>/index.html?embed=1`). Embed mode shows only the 3D scene, its
control dock and a Save image button, and fills the frame. It starts with an
empty yard and the note "Draw areas in the Design tab to see them here" until
a plan with at least one area, line or water item arrives.

Messages use `window.postMessage`:

| Direction | Message |
| --- | --- |
| Studio to parent, once it has started | `{ source: 'growth-studio', type: 'ready', materials }` |
| Studio to parent, when the scene is clicked | `{ source: 'growth-studio', type: 'select', id }` |
| Parent to studio | `{ source: 'area-planner', type: 'siteplan', plan, name, refit }` |
| Studio to parent, after each plan it applies | `{ source: 'growth-studio', type: 'built', ok: true }` or `{ source: 'growth-studio', type: 'built', ok: false, message }` |
| Studio to parent, when the plan names an uploaded file it does not have | `{ source: 'growth-studio', type: 'need-asset', id }` |
| Parent to studio, in answer | `{ source: 'area-planner', type: 'asset', id, kind: 'glb' or 'image', data: Blob }` (`data: null` when the parent no longer has the file) |
| Studio to parent, once that file is read | `{ source: 'growth-studio', type: 'asset', id, ok: true }` or `{ ..., ok: false, message }` |
| Parent to studio, to get plant pictures | `{ source: 'area-planner', type: 'plant-thumbs', ids? }` (`ids` are catalog plant ids; leave it out for all) |
| Studio to parent, one per plant as each is drawn | `{ source: 'growth-studio', type: 'plant-thumb', id, url }` (`url` is a small JPEG data URL of the plant at mature size) |

- `plan` is SitePlan JSON (`src/siteplan/types.ts`), in meters. It is cleaned
  by `cleanPlan` first, so missing fields get defaults. When the cleanup
  changed or dropped something, the `built` reply also carries
  `warnings: string[]`. `site.streetEdge` and `structures` can be left out.
- Area Planner sends a drawn house as a `structures` item with `openings`
  (the doors and windows marked on it; each is moved onto the nearest wall).
  A structure of kind `cover` is a roofed patio on posts. A cover can carry
  `walls: boolean[]` to make it a California room: one entry per polygon edge,
  edge `i` running from `polygon[i]` to `polygon[(i + 1) % n]`. `true` is a
  solid stucco wall along that edge from the ground to the roof, built inside
  the outline; `false` is open, on posts under a header. Send `false` for an
  edge against the house (an edge along a house wall is never walled anyway).
  Without `walls` the cover is open on every side, as before. A `walls` array
  that is not all booleans or does not have one entry per edge is ignored
  with a warning, and the cover is shown open. A pool can carry
  `coping` (width in meters, 0 for none) and is cut out of any paving that
  fully surrounds it.
- `materials` lists the paver, border and wall looks the parent can offer:
  `{ id, name, use, maker, line, shelf, color, sw }[]`: who makes it, its
  product line, the catalogue shelf it sits on (Pavers, Retaining walls,
  Garden walls, Curb), the color name alone and one swatch color. Generic
  looks have an empty `maker`. Each maker paver color also has a matching
  border, `border-of-<id>`, which is not listed. Only offered lines are
  listed: a maker paver or wall line is offered once it is mapped in depth from
  the maker's specs (sizes, faces, colors, patterns), by adding its line name to
  `OFFERED_LINES` in `src/siteplan/catalog.ts` (today Catalina Grana, Avalon
  Slate, Melville Tandem Wall and Highland Stone). Generic looks, curbs and
  fences are always listed. Hidden lines stay in the catalog, so a plan that
  already uses one still loads and renders, and `point` still describes it.
  `select` carries the id of the plan item that was clicked, or `null` for bare
  ground.
- A turf zone with `catalogId: 'synthetic-turf'` is synthetic grass: an even,
  bright artificial turf, labeled "Synthetic grass". `lawn` is natural grass.
  An unknown turf id that names synthetic, artificial, fake or astro turf falls
  back to synthetic grass; any other unknown turf id falls back to `lawn`, with a
  warning.
- A hardscape zone's `border` can carry `course: 'sailor'` to lay the border
  pavers end to end; a wall line can carry `cap: 'same' | 'midnight'`.
- A fence line can carry `topper: 'lattice' | 'cap'`, added above its height.
- A hardscape zone can carry `elevation` (meters above grade): it is built on solid
  sides at that height. A line of kind `steps` is a flight of stairs: the line is the
  top edge, `height` the total rise, `riser` and `tread` in meters; it goes down away
  from the raised zone it touches and uses its hardscape `catalogId`.
- A plant can carry `container` ('1g', '2g', '5g', '15g', '24b', '36b', '48b'): the
  nursery container it is installed from. It sets the install size and where the
  plant starts on its growth curve (see `installSize` and `sizeAt` in `catalog.ts`).
- `plan.models` places a designer's own rendering on a drawn footprint:
  `{ id, polygon, asset, kind: 'glb' | 'image', height?, turn: 0-3, fit: 'contain' | 'stretch' }`.
  The file is not in the plan. `asset` is an id; the studio asks for each file
  once per plan with `need-asset` and shows a plain block on the footprint
  until it arrives. A `.glb` is sized to the box the footprint sits in
  (`contain` keeps its proportions, `stretch` fills the drawn width, depth and
  `height` exactly) with its front (+z) on the long side that faces down the
  page; `turn` adds quarter turns. An `image` stands up as a flat board across
  the footprint. Files over 60 MB and Draco-compressed models are refused with
  a message. A file is forgotten when a later plan no longer names it.
- `plan.rulers` carries dimensions the person drew with Area Planner's ruler:
  `{ id, a: [x, y], b: [x, y], label? }`, in meters like everything else.
  They show in the 3D view's Totals and Every edge measurements as a gold
  line with end ticks, the label (if any) and the length, above all other labels.
  Plans without the key load as before.
- A hardscape zone in a 3-piece paver set (6 x 12, 9 x 12, 12 x 12) can carry
  `laying: 'a' | 'b' | 'random'`: Belgard's 3-Piece Pattern A (12 in courses),
  Pattern B, or the old random ashlar. Left out, Pattern A. The looks in the
  `ready` message carry `laying: true` when they take a laying pattern.
- The material pointer (controller Y, or P) marks the center of the view. In
  embed mode the studio sends `{ source: 'growth-studio', type: 'pointer', on }`
  when it is turned on or off, and `{ source: 'growth-studio', type: 'point',
  id, part, material }` when what it is on changes: `part` is `main`, `border`,
  `wall`, `cap`, `curb`, `fence` or `steps`; `material` is the look (below), or
  null. The parent can send `{ source: 'area-planner', type: 'pointer', on }`.
- Pressing the right stick (or L) locks the pointed material: the studio sends
  `{ source: 'growth-studio', type: 'point-lock', locked }` and no `point`
  messages while locked; letting go sends what the pointer is on at once. The
  parent can send `{ source: 'area-planner', type: 'point-lock', locked }`.
- Looks (in `ready` and `point`) are `{ id, name, use, maker, line, shelf,
  color, sw, palette, sizes?, sizeText?, thicknessIn?, face?, image?, page?,
  laying? }`: `image` is the maker's swatch photo and `page` its product page,
  both on the maker's site (`src/siteplan/belgard-media.ts`).
- Full screen in embed mode: the studio sends `{ type: 'fullscreen-request' }`;
  a parent that answers `{ source: 'area-planner', type: 'fullscreen', on: true }`
  within 300 ms takes over (so its own panels stay on screen), later sends
  `{ ..., on: false }` when it leaves full screen, and gets `{ type:
  'fullscreen-exit' }` when the person leaves it from inside 3D. Without an
  answer the studio goes full screen by itself.
- Stepping stones are `features` with `catalogId: 'stepping-stone-24'` (a Belgard
  Dimensions Slab 24 x 24 x 2 3/8 in, set with its top about 1/2 in above
  grade) and an optional `materialId`: one of the `dimensions-slab-24-*`
  looks (18 Dimensions Slabs colors). The pointer reports them as part `stone`.
- `name` is used for the saved image's file name.
- `refit: true` re-frames the camera on the new plan. `refit: false` keeps the
  camera where it is as long as `site.boundary` is unchanged. If the boundary
  changed, the view is re-framed anyway, so nobody is left looking at bare
  ground. The first plan is always framed.
- Messages that arrive within 150 ms of each other are applied as one
  rebuild, using the newest plan. Each rebuild gets one `built` reply.
- Wait for `ready` before sending. It is sent to any parent (`'*'`) and holds
  no private data. `built` goes only to the origin that sent the plan.
- A wall, fence or curb drawn as a closed shape is a line whose last point
  repeats its first. Walls can be up to 6.5 m tall.
- Plans are accepted only from the iframe's parent, and only from the origins
  listed in `EMBED_ALLOWED_PARENT_ORIGINS` in `src/app/main.ts`: local
  development (`http://localhost:*`, `http://127.0.0.1:*`),
  `https://area-planner*.vercel.app`, and `https://greenlionlandscape.com` and
  its subdomains. Anything else is ignored silently.
- If the iframe has a `sandbox` attribute, it needs `allow-scripts`, and
  `allow-downloads` for Save image.

## Next steps
1. Replace the starter catalog with Green Lion's plant list (names, container
   sizes, mature sizes) and the paver and wall lines it installs.
2. Test plan reading on 5 real Green Lion blueprints and tune the prompt in
   `src/app/reader.ts`.
3. Add a phone quality tier and test on real phones.
4. Add share links for customers (needs hosting and login).

Plant sizes are typical starting values, not a horticultural reference.
Surface looks are modeled after common manufacturer lines; the app draws its
own textures and ships no manufacturer images.
