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
| Parent to studio | `{ source: 'area-planner', type: 'siteplan', plan, name, refit, frame? }` |
| Studio to parent, after each plan it applies | `{ source: 'growth-studio', type: 'built', ok: true }` or `{ source: 'growth-studio', type: 'built', ok: false, message }` |
| Studio to parent, when the plan names an uploaded file it does not have | `{ source: 'growth-studio', type: 'need-asset', id }` |
| Parent to studio, in answer | `{ source: 'area-planner', type: 'asset', id, kind: 'glb' or 'image', data: Blob }` (`data: null` when the parent no longer has the file) |
| Studio to parent, once that file is read | `{ source: 'growth-studio', type: 'asset', id, ok: true }` or `{ ..., ok: false, message }` |
| Parent to studio, to get plant pictures | `{ source: 'area-planner', type: 'plant-thumbs', ids? }` (`ids` are catalog plant ids; leave it out for all) |
| Studio to parent, one per plant as each is drawn | `{ source: 'growth-studio', type: 'plant-thumb', id, url }` (`url` is a small JPEG data URL of the plant at mature size) |
| Parent to studio, to show a build stage | `{ source: 'area-planner', type: 'stage', stage }` (`'demo'`, `'excavate'`, `'trench'`, `'backfill'`, `'base'`, `'bedding'` or `'finished'`) |
| Studio to parent, when the person picks a stage in the dock | `{ source: 'growth-studio', type: 'stage', stage }` |
| Parent to studio, to cut away the near side of the yard | `{ source: 'area-planner', type: 'cutaway', on }` |
| Studio to parent, when the cutaway is turned on or off | `{ source: 'growth-studio', type: 'cutaway', on }` |

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
  Garden walls, Curb, Paver edge), the color name alone and one swatch color. Generic
  looks have an empty `maker`. Each maker paver color also has a matching
  border, `border-of-<id>`, which is not listed. Only offered lines are
  listed: a maker paver or wall line is offered once it is mapped in depth from
  the maker's specs (sizes, faces, colors, patterns), by adding its line name to
  `OFFERED_LINES` in `src/siteplan/catalog.ts` (today Catalina Grana, Avalon
  Slate, Antiqued Flat Top, Melville Tandem Wall and Highland Stone). Generic looks, curbs and
  fences are always listed. Hidden lines stay in the catalog, so a plan that
  already uses one still loads and renders, and `point` still describes it.
  `select` carries the id of the plan item that was clicked, or `null` for bare
  ground.
- A turf zone with `catalogId: 'synthetic-turf'` is synthetic grass: an even,
  bright artificial turf, labeled "Synthetic grass". `lawn` is natural grass.
  An unknown turf id that names synthetic, artificial, fake or astro turf falls
  back to synthetic grass; any other unknown turf id falls back to `lawn`, with a
  warning.
- Mexican beach pebble, black, in the three sizes Green Lion buys
  (`mexican-beach-pebble-half-1`, `-1-2`, `-2-3`: 1/2-1, 1-2 and 2-3 in;
  shelf `Rock`, `pebble` on the look) is drawn as individual stones
  (`builder/pebbles.ts`): hard, smooth, flat-topped ovals with a full rim, in cool
  gray to charcoal (the dry stone), at the sold
  size range, piled and tipped, in 1.5 m tiles that show detailed stones up
  close, plainer ones farther off and none past where a stone is a couple of
  pixels; the ground's pebble texture fills the gaps and the distance, matched
  to the stones' average color. Draft quality shows the texture alone. The
  sample "Mexican beach pebble sizes" has a 10 x 10 ft bed of each.
- MSI Evergrass synthetic turf (`msi-summer-gold-96`, `msi-viridian-91`,
  `msi-viridian-pet-96`, shelf `Synthetic turf`, listed in `materials`) is drawn
  from MSI's specs (`turf` on the look): a ground texture painted blade by blade
  in the two yarn colors over curled thatch, and 3D blades at the real pile
  height (45 or 30 mm) leaning one way (`TURF_GRAIN`). Its tone is matched on
  screen to MSI's outdoor photos through the grade of `engine/post.ts`
  (`turfAlbedo`, `TURF_LIGHT`, `TURF_FILL` in `engine/surfaces.ts`); change
  those with the grade.
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
  the footprint. Files over 60 MB, Draco-compressed models and models that
  point to outside files or web addresses (only embedded data is read) are refused with
  a message. A file is forgotten when a later plan no longer names it.
- `plan.rulers` carries dimensions the person drew with Area Planner's ruler:
  `{ id, a: [x, y], b: [x, y], label? }`, in meters like everything else.
  They show in the 3D view's Totals and Every edge measurements as a gold
  line with end ticks, the label (if any) and the length, above all other labels.
  Plans without the key load as before.
- A hardscape zone in a paver that offers laying patterns can carry `laying`.
  The 3-piece set of 6 x 12, 9 x 12 and 12 x 12 (Catalina Grana, Avalon Slate)
  takes `'a' | 'b' | 'random'`: Belgard's 3-Piece Pattern A (12 in courses),
  Pattern B, or the old random ashlar. Antiqued Flat Top (6 x 9, 9 x 9, 9 x 12)
  takes `'a' | 'running3' | 'running' | 'herringbone'`: its own 3-Piece
  Pattern A, 3-Piece Running Bond, and the 1-Piece Running Bond and 45 degree
  Herringbone of 6 x 9 (Midnight is sold in 6 x 9 only, so it takes the last
  two). Left out, or not one the paver offers, the paver's first. The looks in
  the `ready` message carry `laying: true` and `layings: { id, name }[]` (the
  default first) when they take a laying pattern.
- The material pointer (controller Y, or P) marks the center of the view. In
  embed mode the studio sends `{ source: 'growth-studio', type: 'pointer', on }`
  when it is turned on or off, and `{ source: 'growth-studio', type: 'point',
  id, part, material }` when what it is on changes. Everything built from the
  plan can be pointed at. `part` is `main`, `border`, `edge` (paver edging),
  `wall`, `cap`, `curb`, `fence`, `steps` or `stone` for a catalog surface;
  `turf` or `bed` for a lawn, synthetic grass, mulch, bark, humus, rock or DG
  zone (painted on the ground, found by the zone under the hit point); and
  `plant`, `water`, `structure`, `feature` or `model` for the rest. `id` is the
  plan item's id (a mass-planted bed's plants report the bed). `material` is
  the look (below), or null on bare ground or sky. Right after it, once a
  swatch has been drawn from the 3D material, the studio sends the same
  `point` again with `material.swatch` set, if the pointer is still on it (a
  swatch made before goes in the first message). The parent can send
  `{ source: 'area-planner', type: 'pointer', on }`.
- Pressing the right stick (or L) locks the pointed material: the studio sends
  `{ source: 'growth-studio', type: 'point-lock', locked }` and no `point`
  messages while locked; letting go sends what the pointer is on at once. The
  parent can send `{ source: 'area-planner', type: 'point-lock', locked }`.
- Looks (in `ready` and `point`) are `{ id, name, kind, use, group, about,
  spec, maker, line, shelf, color, sw, palette, sizes?, sizeText?,
  thicknessIn?, face?, image?, page?, laying?, botanical?, swatch? }`:
  `kind` is `material`, `plant`, `water`, `structure`, `feature` or `model`
  (the last five have ids `<kind>:<id>`, such as `plant:lavender` or
  `water:pool`); `group` is what the panel shows above the name (Concrete,
  Mulch and rock, Synthetic turf, Shrubs...); `about` is a plain sentence or
  two; `spec` is typical install lines (mulch 3 in deep, DG 3 in compacted,
  concrete 4 in slab with its finish, turf pile and face weight) or, for a
  plant, its container, sizes and spacing (`src/siteplan/material-info.ts`).
  `image` is the maker's swatch photo and `page` its product page, both on the
  maker's site (`src/siteplan/belgard-media.ts`). `swatch` is a 256 px JPEG
  `data:` URL drawn from the material's own painted texture (or the plant's
  rendered picture, or the pool tile), in `point` messages only
  (`src/app/swatches.ts`). A parent can ask for one catalog material's
  swatch with `{ source: 'area-planner', type: 'swatch', id }` and gets
  `{ source: 'growth-studio', type: 'swatch', id, url }` (`url` null when there
  is none). The `ready` list also carries every bed fill and
  rock (shelves `Bed fill`, `Rock`, `Decomposed granite`), so the parent can
  offer them for a bed.
- Full screen in embed mode: the studio sends `{ type: 'fullscreen-request' }`;
  a parent that answers `{ source: 'area-planner', type: 'fullscreen', on: true }`
  within 300 ms takes over (so its own panels stay on screen), later sends
  `{ ..., on: false }` when it leaves full screen, and gets `{ type:
  'fullscreen-exit' }` when the person leaves it from inside 3D. Without an
  answer the studio goes full screen by itself.
- Cover picture: the parent sends `{ source: 'area-planner', type: 'cover' }`
  and gets `{ source: 'growth-studio', type: 'cover', ok: true, data: Blob }` (a
  1600 px JPEG of the yard from the Overview view, drawn off screen: the live
  view does not move, resize or blink),
  or `{ ..., ok: false, message }` before a plan is built.
- Stepping stones are `features` with `catalogId: 'stepping-stone-24'` (a Belgard
  Dimensions Slab 24 x 24 x 2 3/8 in, set with its top about 1/2 in above
  grade) and an optional `materialId`: one of the `dimensions-slab-24-*`
  looks (18 Dimensions Slabs colors). The pointer reports them as part `stone`.
- `plan.utilities` carries underground runs and the equipment they connect:
  `{ lines: { id, points, runs: { kind, label, od, cover, code?, tracer? }[], gap? }[], points: { id, kind, position, label?, rotationDeg? }[] }`.
  `kind` is `electrical`, `lighting`, `gas`, `irrigation`, `water` or `drain`;
  `od` is the pipe's outside diameter and `cover` the top of the pipe to
  finished grade, both in meters. A line with two or more runs is a joint
  trench: runs keep their own cover, stacked shallowest first, and a run that
  would come closer than `gap` (meters, default 0.15) to the one above it is
  pushed down. Every trench is shown 1.5 ft wide. Point kinds: `panel`,
  `subpanel`, `outlet`, `junction`, `transformer`, `gas-meter`, `gas-stub`,
  `water-meter`, `backflow`, `controller`, `valves`, `hose-bib`, `stub`.
  Plans without the key load as before.
- A hardscape or turf zone can carry `layers: { base?, bedding? }` (meters):
  the compacted base rock and the bedding layer under it for the build stages.
  Left out: pavers and flagstone 4 in base under 1 in sand, concrete 4 in
  base, synthetic grass 3 in base under 1 in fines. Other surfaces are not dug.
- Build stages (the dock's Build stage control, `[` and `]`): Demo (bare
  ground, white marking paint around each dig, trench routes in APWA colors),
  Excavate, Trench (open trenches with the pipes at their cover, tracer wire on
  plastic gas pipe), Backfill, Base rock, Sand and Finished. Labels give
  depths, covers and amounts. Cut away (button or `C`) clips the yard on the
  near side of a vertical plane through the point the camera looks at and
  draws the ground in section there for the current stage.
- `name` is used for the saved image's file name.
- `refit: true` re-frames the camera on the new plan. `refit: false` keeps the
  camera where it is as long as `site.boundary` is unchanged. If the boundary
  changed, the view is re-framed anyway, so nobody is left looking at bare
  ground, unless the plan carries the same `frame` string as the last one:
  `frame` names the parent's coordinate frame (Area Planner changes it only
  with a new plan image or scale), so with an unchanged `frame` the camera
  stays even when the lot outline grows. The first plan is always framed.
- `{ source: 'area-planner', type: 'pause' }` stops drawing the 3D view (for a
  hidden tab; plant pictures still render); `{ ..., type: 'resume' }` starts it
  again on the next frame.
- The `i` key pressed inside the 3D view (no modifier keys, not in a text
  field) is passed on as `{ source: 'growth-studio', type: 'key', key: 'i' }`
  to the origin that sent the plan.
- Messages that arrive within 150 ms of each other are applied as one
  rebuild, using the newest plan. Each rebuild gets one `built` reply.
  The new yard's shaders are compiled while the old yard stays on screen;
  `built` is sent once the new yard is showing.
- Wait for `ready` before sending. It is sent to any parent (`'*'`) and holds
  no private data. `built` goes only to the origin that sent the plan.
- A wall, fence or curb drawn as a closed shape is a line whose last point
  repeats its first. Walls can be up to 6.5 m tall.
- Curbs (`kind: 'edging'` with a curb look) are Belgard Melville Curb units:
  4 in thick, 24 in long with a joint between units, 6 1/2 in tall. `reveal`
  is how much stands above grade in meters (0 to 0.1651); left out, 3 in.
- Paver edging is a `kind: 'edging'` line whose `catalogId` is a look on the
  `Paver edge` shelf (`paver-edge-<line>-<color>`, use `border`): one row of
  6 x 9 pavers centered on the line, laid paver by paver with mitres at
  corners. `course: 'sailor'` turns the pavers long side along the run; left
  out, a soldier course. The shelf holds every color Belgard sells as a 6 x 9
  unit in its Pacific Stockton region (Dimensions Single Unit and Antiqued Flat
  Top); `PAVER_EDGE_DEFAULT` is Dimensions Single Unit Anthracite.
- Plans are accepted only from the iframe's parent, and only from the origins
  listed in `EMBED_ALLOWED_PARENT_ORIGINS` in `src/app/main.ts`: local
  development (`http://localhost:*`, `http://127.0.0.1:*`),
  `https://area-planner-beta.vercel.app`, Area Planner on the `joshua-jackson`
  Vercel team (`https://area-planner-joshua-jackson.vercel.app`,
  `https://area-planner-git-<branch>-joshua-jackson.vercel.app`,
  `https://area-planner-<hash>-joshua-jackson.vercel.app`), and
  `https://greenlionlandscape.com` (and `www.`). Anything else is ignored silently.
- The build uses relative asset paths, so the studio also works under a
  sub-path, such as Area Planner's `/studio/` rewrite to this deployment
  (same origin as the planner, which Safari does not throttle).
- If the iframe has a `sandbox` attribute, it needs `allow-scripts`, and
  `allow-downloads` for Save image.

## Smooth rendering
- Frame rate readout: add `?fps=1` to the address (or press F9 in the 3D view)
  for frames per second and the slowest frame of the last half second. It
  says "idle" while nothing on screen changes.
- Drawing pauses while nothing moves (Motion off, or no wind, water or fire,
  and the camera at rest) to save battery and heat; the loop keeps running,
  so the next input is drawn in the very next frame.
- A new plan is built and its shaders compiled before it replaces the old
  yard; plants share one shader, and the lighting environment is remade only
  when the sky changes.
- Shadows are cast from the plants' still pose and redrawn only when the yard,
  sun or growth changes. Lawn blades fade into the ground only where they
  would be thinner than a third of a pixel.
- Losing WebGL (Safari can take it away under memory pressure) shows
  "Restoring the 3D view" and rebuilds the yard when it comes back.

## Next steps
1. Replace the starter catalog with Green Lion's plant list (names, container
   sizes, mature sizes) and the paver and wall lines it installs.
2. Test plan reading on 5 real Green Lion blueprints and tune the prompt in
   `src/app/reader.ts`.
3. Add a phone quality tier and test on real phones.
4. Add share links for customers (needs hosting and login).

Plant sizes are typical starting values, not a horticultural reference.
Surface looks are modeled after common manufacturer lines; the app draws its
own textures and ships no manufacturer images. Antiqued Flat Top's face is
smooth with gently worn, chipped edges and a few shallow dents, like the real
weathered paver.
