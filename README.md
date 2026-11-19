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
- **Catalog from Green Lion's work:** 92 plants, 55 surfaces (multi-size
  pavers with charcoal soldier borders and inset lights, porcelain plank,
  stamped and broom concrete, artificial turf and putting green, black mulch,
  black pebble, cobble), 9 fence styles, raised planters with caps, 27
  features (fire tables, louvered pergolas, L-shaped kitchens, hot tubs,
  saunas, three water wall styles, corten, copper bowls, brass path lights,
  uplights).
- **Houses:** a straight-skeleton hip or gable roof over any footprint with
  eaves, fascia, soffit and caps; flat concrete tile, S-tile, architectural
  shingle or standing-seam metal in color blends; stucco, trim, window, door
  and garage door colors; a raised entry crown and a chimney; detailed windows,
  entry, sliding and garage doors. The sample "Single-story ranch with hip roof"
  shows them.
- **Water:** ponds, pools with a tanning ledge, fountains, streams and
  pondless waterfalls with lit falls.
- **Fire:** gas flames drawn as many flickering flame tongues standing on each
  burner's real shape (`builder/fire.ts`): the linear fire pit's 28 in line
  burner, the round pit's ring under lava rock, the fire table's line, the
  Cazo fire and water bowl's 12 in ring, and a grill's burner tubes (short
  blue flames, off until lit by hand). The flames lick, flicker and tear into
  loose tips, lean downwind with the Wind setting, glow at night and read
  orange by day; each fire's light flickers on its own beat. The sample
  "Fire" shows every kind.
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
| Parent to studio, cut away (removed 2026-11-19; ignored, kept so an older parent does no harm; the studio no longer sends it) | `{ source: 'area-planner', type: 'cutaway', on }` |
| Parent to studio, to ask for the look of a plant or feature it offers as a switch | `{ source: 'area-planner', type: 'look', id, item? }` (`id` is `plant:<catalog id>` or `feature:<catalog id>`; `item` is the placed item it would replace) |
| Studio to parent, in answer | `{ source: 'growth-studio', type: 'look', id, item?, material }` (`item` echoes the request's) (`material` is the same Look the pointer sends) |
| Parent to studio, to make the view read-only or not | `{ source: 'area-planner', type: 'mode', viewer }` (also `viewer=1` on the embed address) |
| Parent to studio, to turn touch mode (on-screen joystick, Orbit / Walk / Fly, Home, Use; fingers only) on or off | `{ source: 'area-planner', type: 'touch', on }` (also `touch=1` on the embed address) |

- **View-only mode** (`viewer: true`, or `?embed=1&viewer=1`): for a parent
  page showing the 3D view to someone who may look but not change the plan.
  The Library button is hidden and the Library will not open; nothing that
  would change the saved plan or the team's settings is sent back (no
  `approve`, no `action`, no `marks`); the Mark quick tool is left out of the
  D-pad. A feature's door or light used by hand still moves in the view, as a
  preview. Looking around, walk and fly, build stages, growth, light,
  measurements, plant labels, the material pointer (`point`), `select` and
  Save image all work. Without the flag the studio behaves as before.
- `plan` is SitePlan JSON (`src/siteplan/types.ts`), in meters. It is cleaned
  by `cleanPlan` first, so missing fields get defaults. When the cleanup
  changed or dropped something, the `built` reply also carries
  `warnings: string[]`. `site.streetEdge` and `structures` can be left out.
- Area Planner sends a drawn house as a `structures` item with `openings`
  (the doors and windows marked on it; each is moved onto the nearest wall).
  Marked windows replace the automatic windows; marked doors replace the
  automatic doors (a marked garage door alone keeps both). An opening can carry
  `style`: for a door `entry` (the front door: a framed door with a glass insert
  and raised panels, a lever and deadbolt, tall sidelights each side when the
  mark is wide enough, two concrete steps up to it), `slider` (a sliding glass
  door: frame, threshold and two rails, 2 or 3 panels, the fixed ones on the
  outer track and the sliding one on the inner track overlapping at the
  interlock, a pull, glass with the room and blinds behind it), `garage` (a
  four-section garage door in the look's style) or `door` (a plain door); for
  a window `slider` (the default) or `picture`. Left out, a door up to 1.5 m is
  a plain door and a wider one a slider. `height` (a slider 2.03 or 2.44 m, a
  garage door 2.13 or 2.44 m) and `panels` (2 or 3) are optional.
- A house, garage or shed can also carry (all optional, `src/siteplan/types.ts`):
  `roof: 'hip' | 'gable' | 'flat'` (hip and gable are a straight-skeleton roof
  over any footprint, `src/builder/roofskeleton.ts`: hips over convex corners,
  valleys over reflex ones, ridges, faceted hips over bay windows; `gable`
  puts gable ends on the wings' end walls), `pitch` (rise in 12: 4, 5, 6 or 8;
  default 5), `eave` (overhang in meters, 0.15 to 0.9; default 0.5) with fascia,
  a soffit under the overhang and ridge and hip caps, `crown: true` (a taller
  hip over the front entry, over its whole recess when it is set back in one),
  `chimney: true` (a stucco chase with a cap and spark arrestor on a side wall),
  `stepDoors: false` (see below) and `look` (colors and finishes, every key
  optional, ids from `src/siteplan/houselooks.ts`: `wall`, `trim`, `window`,
  `roof` (`concrete-flat`, `concrete-s`, `shingle`, `metal`), `roofColor` (a
  blend of that roof), `door`, `garage`, `garageStyle`, `blinds`). Unknown ids
  are dropped. The `ready` message carries `houseLooks`, every list with ids,
  names and swatches. A cover takes the walls and roof of the plan's first house.
- A house with no marked windows gets them by itself (`src/builder/openingplan.ts`):
  white thin-framed sliders and picture windows 5 to 6 ft wide on a 2 1/2 ft sill
  on the yard and street sides, 3 to 4 ft bedroom windows on a 3 1/2 ft sill on
  the sides, one window on each bay facet, interior blinds behind about half of
  them, a sliding door on the yard side and the entry (in a recess when there is
  one) on the wall facing away from the yard, always clear of wall ends, other
  buildings and cover walls and posts.
- Where a flight of `steps` is drawn along a house wall (the house floor is then
  its top: it goes down away from the house), a door is put there by itself: a
  sliding glass door centered on the step, the widest of 12, 9, 8, 6 or 5 ft that
  the step and the wall allow, its threshold on the step's top, or a 3 ft plain
  door when no sliding door fits. Collinear pieces on one wall at the same top are
  one run, and one plan item gets at most one door per wall. A small raised paving
  stoop does the same (not a deck; 4 in to 2 1/2 ft up, no bigger than about 130
  sq ft, an edge up to 5.2 m), but only while no door is marked on the house; a
  raised patio or deck along the house gets no door of its own. A marked door
  there takes its place and stands on the step; `stepDoors: false` turns it off.
  The entry stands on a landing or drawn steps it meets (no steps of its own), and
  at grade under a cover or where a zone is drawn in front of it.
- Deploy order: Growth Studio must be deployed before an Area Planner that sends
  house looks, door styles or steps against a house (older studios ignore the new
  fields; Area Planner holds back the steps it rose to a house wall until the
  studio's `ready` carries `houseLooks`).
- The pointer's `point` message carries `sub` for a house: the part pointed at
  (`walls`, `roof`, `trim`, `windows`, `door`, `garage`, `chimney`, `steps`), and
  the look carries `house: { sub, look }` with every look key filled in.
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
- Soil fills: Black humus (compost mix) (`humus`), Compost (`compost`) and Dirt /
  topsoil (`topsoil`), shelf `Bed fill`, `crumb` on the look, are drawn as spread
  soil whose surface is made of soft clods (`builder/humus.ts`,
  `engine/humus-field.ts`): a finely divided sheet over each bed, raised in the
  vertex shader by a clod relief (lumps of 1-5 cm touching and overlapping, crumbs,
  loose heaps, stretches of finer soil; each fill its own colors, clod size and
  share, and fiber) and by the fill's larger lie (shovel and rake heaps, ridges,
  a few mounds), wearing the ground's own texture for that fill, which is painted
  from the same relief (its height rides in the texture's roughness channel). Near
  tiles are finely divided (2 cm at Balanced; Light uses the coarse 4-5 cm grid
  everywhere and half the loose pieces), and the relief sinks into
  the textured ground at 7-10 m. A few loose clods and short shreds of bark lie on
  top. Draft quality shows the texture alone. The sample "Soil fills: black humus,
  compost, dirt" has a 10 x 10 ft bed of each and a long humus bed along a lawn.
- Every bed look in the `ready` list carries `fillType` (`bark`, `humus` for
  humus, compost and dirt, `rock` for rock, gravel and pebble, `dg`), `depthIn`
  (the usual spread depth) and, for rock, gravel and DG, `tonsPerCuYd`.
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
- A composite deck is a hardscape zone whose `catalogId` is a maker's deck board
  (shelf `Decking`, `trex-enhance-naturals-<color>`, `trex-enhance-basics-<color>`,
  `trex-transcend-island-mist`; see `src/siteplan/decking.ts`). It is built board by
  board (`src/builder/deck.ts`, layout in `deck-layout.ts`): `elevation` is the top of
  the boards above grade (left out, 8 in), with fascia on the sides and dark framing
  under the gaps. `deck` (all optional) sets how it is laid:
  `{ pattern?: 'straight' | 'diagonal' | 'chevron', angleDeg?, boardIn?, frame?, divider?, seamOffset?, fascia?, tub?, holes? }`.
  `angleDeg` is the board direction (straight) or the seam direction (diagonal and
  chevron boards run at 45 degrees to it), degrees from plan x toward plan y; left out,
  the longest side. `frame` (default true) is a one-board picture frame along the edge
  and around each opening, mitered at the corners. `seamOffset` moves the chevron seam
  across the deck (meters from the middle); `divider` adds a board along it. `holes` are
  openings framed like the edge. A hot tub feature placed with its center on a deck gets
  its own framed opening and stands at the deck's height, its whole cabinet above the
  boards (`tub: 'level'`, the default), or on the ground below them (`tub: 'sunk'`);
  every other feature and uploaded model on a deck stands on the boards. The looks carry `sizeText` (board and fascia
  sizes), `page` and `image` (Trex's own swatch photo, loaded live).
- A plant can carry `container` ('1g', '2g', '5g', '15g', '24b', '36b', '48b'): the
  nursery container it is installed from. It sets the install size and where the
  plant starts on its growth curve (see `installSize` and `sizeAt` in `catalog.ts`).
- Tru-Scapes landscape lighting (`truscapes-<model>` features in the Lighting
  group, e.g. `truscapes-ts-b301`, `truscapes-ts-b102`, `truscapes-ts-a6000`,
  `truscapes-ts-tssa-200`; the list is `TRUSCAPES` in `src/siteplan/truscapes.ts`)
  are drawn to the maker's spec sheets and light the yard after dusk with their
  published lumens, beam angle and color temperature. A feature placement can
  carry `fixture: { finish?, beamDeg?, kelvin?, tiltDeg?, mountHeight? }`:
  `finish` is a finish the fixture is sold in (`black`, `bronze`, `brown`,
  `white`, `gray`, `stainless`, or the maker's code `BLK`, `BRZ`, ...),
  `beamDeg` and `kelvin` snap to the lamp or color choices it offers (others are
  dropped), `tiltDeg` (0-90, wells 0-20) tips an aimed head from straight up
  toward the placement's front (`rotationDeg` turns it), and `mountHeight` is
  meters above grade for a cap, riser or wall fixture (a cap light's is the
  underside of the cap). A cap or face light sent without `mountHeight` within
  0.75 m of a wall or raised planter moves onto that face, turns out from it and
  takes the cap's height. Stake and in-grade fixtures stand on the paving where a
  hardscape zone covers them. The sample "Night lighting: Tru-Scapes" lights the
  modern backyard; its look is closest to Tru-Scapes' own photos about an hour
  after sunset.
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
  two). Basalite Premier Smooth takes `'combo3' | 'combo4'`: Basalite's 3 Piece
  Combo Pattern and 4 Piece Pattern #4 (the combo with the 12 x 18), traced from
  its pattern brochure and laid on the line's real 11.79 in module (11.73 in
  faces plus spacer joints). Basalite Premier Slab takes
  `'stack' | 'halfBond' | 'halfBond45'`: Stacked Bond, Running Bond (half bond)
  and 45 degree Running Bond, the three patterns in its brochure, laid on the
  24 x 24 slab's real 23.54 in module (cut sheet: 594 x 594 x 60 mm with
  spacers, 3 mm chamfer). Left out, or not one the paver offers, the paver's first. The looks in
  the `ready` message carry `laying: true` and `layings: { id, name }[]` (the
  default first) when they take a laying pattern.
- The material pointer (controller Y, or P) marks the center of the view. In
  embed mode the studio sends `{ source: 'growth-studio', type: 'pointer', on }`
  when it is turned on or off, and `{ source: 'growth-studio', type: 'point',
  id, part, material }` when what it is on changes. Everything built from the
  plan can be pointed at. `part` is `main`, `border`, `edge` (paver edging),
  `wall`, `cap`, `curb`, `fence`, `steps`, `stone` or `deck` (a composite deck's boards) for a catalog surface;
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
  thicknessIn?, face?, image?, page?, laying?, layings?, mix?, pallets?,
  botanical?, swatch? }`. For ordering pavers: each of `layings` (`{ id, name,
  mix? }`) and a paver laid one way only (`mix`) give the share of the area
  each piece size covers, `[short side, long side, share]` in nominal inches,
  read from the pattern's own drawn module (`layingMix` in
  `src/engine/surfaces.ts`; left out for random ashlar and plain multi-size
  lines, which are laid as the pallet comes); `pallets` (`{ label, sqft,
  pieces: [short, long, count][], lb?, source }`) is how the maker
  palletizes it, from its cut sheet, for the lines listed in
  `src/siteplan/pallets.ts` (Avalon Slate, Catalina Grana and their 6 x 9
  borders, Dimensions 12 60mm, Premier Slab, Premier Smooth). Area Planner
  counts pieces and pallets from these. The other fields:
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
- Stepping stones are `features` of kind `steppingStone`, in the sizes usually set (sizes are along the stone's own x,
  then z; a path turns x along the walk, so a long stone lies across it):
  - Belgard Dimensions Slabs, 2 3/8 in thick, top about 1/2 in above grade: `stepping-stone-12x24`,
    `stepping-stone-24`, `stepping-stone-24x36`; `materialId` one of the `dimensions-slab-24-*` looks (18 Dimensions
    Slabs colors, whatever the size).
  - Green Lion poured concrete pads, 4 in thick, top 1 in above grade, no saw cuts: `stepping-pad-36` (3 x 3 ft) and
    `stepping-pad-48` (4 x 4 ft); `materialId` a concrete look (Area Planner offers smooth, broom and exposed aggregate
    in the six integral colors). No maker sells a precast stepping slab this big; pads this size are poured in place.
  - Natural flagstone steppers, one piece each, top about 1/2 in above grade: `flagstone-stepper-18-24` and
    `flagstone-stepper-24-36`; `materialId` one of the flagstones Green Lion buys (`flagstone-cold-water-canyon`,
    `flagstone-az-classic-oak`, `flagstone-sui-black-slate`), and an optional `outline` (meters about the center, in
    the stone's own frame) so the 3D stone is the one drawn in the plan; left out, an outline is made from the
    placement's id within the size range.
  A `materialId` that does not suit the stone falls back to that stone's default. The pointer reports them as part
  `stone`. Pebbles are cleared from under each stone by its own outline. The **Stepping stones** sample shows them all.
- A feature with on/off options (its catalog entry lists `options: { key, label, default }[]`, sent in the
  `catalog` message) takes `options: { [key]: boolean }` on its placement; keys the feature does not offer
  are dropped. The SaunaLife CL5G sauna (`saunalife-cl5g`) offers `doorOpen` (default off) and `lightsOn`
  (default on: LED light bars inside, and a warm light through the glass at night).
- A feature that comes in sizes (the catalog's `sizes`: the tall corten planter, the concrete fire pit, the tree of
  life screen) takes an optional `size: [length, depth, height]` in meters; left out, the catalog's standard size. A
  planter (`plantable`) is drawn with its own planting (counted with the plan's plants) unless `planted: false`.
  Plants placed inside a planter sit on its soil.
- Rock for water features (group Water, in the Library's Water and spa): moss rock boulders in three shapes
  (`moss-rock-rounded`, `moss-rock-tall`, `moss-rock-flat-top`), the Canyon Tech boulder (`canyon-tech-boulder`), and
  flagstone pieces (`flagstone-lip-stone`, `flagstone-ledge`, `flagstone-edge-piece`). Every one comes in sizes: `size`
  is `[length, depth, height]` in meters, and a boulder's height is what shows above the ground (about a fifth of the rock is
  buried under that). The boulders offer the option `moss` (default on: moss, lichen and rust; off is clean stone). Each placed
  boulder is its own shape, seeded by its id. A flagstone piece is cut from one of the three flagstones Green Lion buys: its
  `materialId` is `flagstone-cold-water-canyon`, `flagstone-az-classic-oak` (the default) or `flagstone-sui-black-slate`, drawn with
  the same cleft face and broken edges as the flagstone steppers; a piece is as thick as its stone (2 in, or 1 in for the slate), so
  a lip stone's or edge piece's `size` height is ignored, and a ledge's height is its stack of slabs.
- Side-yard pieces (`siteplan/yard.ts`, built by `builder/yard/`; the sample **Side yard with shed, raised bed and urn
  fountain** shows them all). Each stands on the top of paving it is set on, like decor:
  - `suncast-bms7481-brown`: Suncast Modern 7 x 4 ft resin shed BMS7481, Brown option (85.5 x 49.25 x 78.5 in; doors
    on its +y side before `rotationDeg`). Option `doorsOpen` (default off); the doors swing by hand (action `doors`).
  - `garden-bench-wood-5ft`: a 5 ft hardwood bench with back and arms, seat 18 in; sizes 5 ft and 4 ft (24 in deep).
  - `raised-bed-cedar`: a custom cedar raised bed, sizes 6 x 3 ft and 8 x 4 ft, 18 in tall; no planting of its own:
    plants placed inside it stand on its soil.
  - `pot-trellis-star-jasmine`: a 24 in tall brown tapered pot with a star jasmine on its 48 in metal trellis
    (`plantable`; `planted: false` leaves the pot empty). The vine faces the placement's front. The same vine in the
    ground is the plant `star-jasmine-metal-trellis`: it stands with its back to the nearest fence or wall.
  - `ac-screen-cedar-slat`: a cedar slat screen, 4 ft tall, sizes 4, 5 1/2 and 6 ft long.
  - `urn-fountain-bubbler-24-<glaze>` (`rust`, `charcoal`, `cobalt`, `celadon`): a 24 in glazed urn bubbling over
    into a 7 ft circle of black Mexican beach pebble over a hidden 4 ft vault (footprint 8 1/2 ft). Options `ring`
    (default off: a soldier ring of Catalina Grana Scandina Gray 6 x 9 pavers round the pebbles, for when no paving
    borders it), `boulders` and `uplight` (default on). Water and its sound switch by hand like the other fountains.
  - Ground: MSI Caldera Blanca porcelain, `msi-caldera-blanca-plank-8x47` (3/8 in plank) and
    `msi-caldera-blanca-paver-16x47` (2 cm outdoor paver), both laid staggered by a third.
- The Cal Spas Tropical Plus PPZ-743BC hot tub is a feature with `catalogId:
  'calspas-ppz-743bc'` (84 x 84 in; its front, with the control panel and the
  steps, faces +y on the plan before `rotationDeg`). Optional `cover`: `'open'`
  (folded up on the lifter behind the spa, the default), `'closed'` or `'off'`,
  and `steps: false` to leave the steps out. The cover folds and lifts as an animation (about 4 s); a spa whose footprint is stretched away from 84 x 84 in falls back to swapping the two poses with no animation. The `catalog` message marks such hot tubs with `cover: true, steps: true`.
- The three-pillar stucco water feature (`three-pillar-water-feature`) offers the option `bowls` (default on: a patina
  bowl planter with a blue agave on each pillar); the bowl planter on its own (`patina-bowl-planter`) is `plantable`.
  The ids `three-pillar-water-feature-no-bowls` and `patina-bowl-planter-empty` from the first version still load, as
  `options: { bowls: false }` and `planted: false`.
- The cedar slat water wall (`cedar-slat-travertine-water-wall`, 12 x 2 1/2 ft footprint, its back on the footprint's
  back edge) offers the option `pots` (default on: a potted Gardenia 'Veitchii' in front of each cedar wing). Its stone
  panel is MSI Silver Travertine ledger (`ww-ledger-silver` texture), its sconces Tru-Scapes Traditional Up/Down.
- The four-fall rock waterfall (`rock-waterfall-4-fall`) comes in sizes. A placement's `size` is
  [outline width, outline depth, height] in meters, and its `position` is the middle of that outline, which includes the
  planted soil behind the top stones. One size is a wider build: a 17 ft front, a 7 1/2 ft basin, and a short 1 ft top
  fall (top stones about 6 1/2 ft up). Its mound's soil takes the bed the waterfall stands in: black humus, compost or
  dirt by their crumb colors, bark by its palette. Any other bed keeps the module's own bark.
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
- Build stages (the dock's Build stage control, the Stage menu over the 3D view, which stays in full screen, or `[` and `]`): Demo (bare
  ground, white marking paint around each dig, trench routes in APWA colors),
  Excavate, Trench (open trenches with the pipes at their cover, tracer wire on
  plastic gas pipe), Backfill, Base rock, Sand and Finished. Labels give
  depths, covers and amounts. (Cut away, the button and `C` key that sliced the
  yard open, was removed on 2026-11-19 at the owner's request; the builder's
  `section()` slice is still in `construction.ts`, unused.)
  Fences stay up in every stage. Before Finished, measurement labels show only
  Melville curb, rock beds, ruler dimensions and plants that were already there.
- Controller (any "standard" pad, e.g. Xbox) and keys, in every camera mode:
  left stick move, right stick look, LT / RT zoom, LB / RB sink / rise, hold LS
  faster; X measurements (Off, Totals, Every edge; `M`); B plant labels (`N`, or
  the Plants button next to Measure); Y material pointer (`P`); right stick click
  locks its material (`L`); A walk / fly in first person (`V`); Menu (Start)
  goes home (`Home` in first person) when let go, and held half a second shows
  the on-screen buttons for 4 s; View (the two-squares button) uses what the
  view is on (`G`), with any quick tool picked, when let go, and held half a
  second opens or closes the Library.
- On-screen controls (`src/app/scenecontrols.ts`, looks in `page.html` under
  "Scene controls"): frosted Charcoal groups over the 3D view with inline SVG
  icons and short labels. Top left, the camera views (one Views menu when the
  3D view is narrower than 1300 px). Top right, in groups: Library, Second
  screen, Touch; Orbit / Walk / Fly; Measure Off / Totals / Every edge with
  Plants; Focus, Wind, Sound; Stage; Full screen. A chosen segment is Leaf
  green with Charcoal text, a switch that is on has a Lime icon. Under 1700 px
  the switches show only their icon (the tooltip names them). Touch mode makes
  every target 44 px; a TV-sized window (1800 x 900 and up) makes them larger.
- Auto-hide: after 2.5 s with no mouse move, wheel, touch or key, the camera
  views, the control groups, the full-screen key hint and the height meter
  fade and slide off screen (280 ms) and the cursor hides over the view; any of
  those inputs brings them straight back. Controller input does not, so a
  controller gives a clean view; hold Menu to see them. They stay while the
  pointer is over them, while their Stage or Views menu is open, while a
  dialog or the Library is open. In touch mode the joystick, rise / sink and
  the Orbit / Walk / Fly bar never hide and touching them does not wake the
  rest; a tap anywhere else does. The quick-tool chip and the pointer label
  show and hide on their own as before. With reduced motion they hide without
  the slide.
- Library in full screen: the Library button stays in full screen and the
  Library opens inside the full-screen element (full screen stays) as the open
  left page of a Green Lion design book, with the sample filling the rest. The
  opening (`src/app/librarybook.ts`, under 2 s): the camera tilts down to the
  ground, the closed book appears (Deep green cover, the Green Lion logo on a
  Charcoal plate, "Growth Library" in Tinos), the cover turns open, and the
  left page grows into the Library. Closing plays it backwards and the camera
  tilts back up to where it was, in walk again. Pressing Library again,
  holding View or Esc skips it; Esc closes the Library before it leaves full
  screen. With reduced motion the Library only fades. The Library always
  frames its samples in orbit; closing goes back to the movement mode it was
  opened from. Outside full screen it opens as before, with no animation.
- Plant labels (each hand-placed plant's name, height and spread at the growth
  year shown) are their own switch, apart from the measurements: Measure Off,
  Totals and Every edge show only areas, edges, walls, runs, structures,
  features and `plan.rulers`; Plants shows or hides the plant labels in any of
  them. The switch is remembered on the device.
- Every edge labels each run as a dimension on the run itself (turned along it
  when it is near level on screen, else level, with a leader when it has to move
  off it), names walls, fences, curbs and shared area edges ("Wall 18 in · 35 ft"),
  puts curved runs' labels on the visible part nearest the middle of the view
  ("along curve"), and drops labels hidden behind walls and buildings, too far for
  the camera's height, or under 40 px on screen. Hovering or tapping a label
  shows its whole run in lime; tapping elsewhere clears it.
- Quick tools (D-pad): left / right pick the tool (`,` and `.`), up / down use it
  (`=` and `-`; holding down or `-` about a second is a long press; the keys, and
  `N`, act only while the 3D view has the keyboard, not a button or the plan pane). A chip at the
  bottom of the 3D view names the tool and what up and down do, and fades. The
  last tool is remembered. The tools are one table in `src/app/quicktools.ts`:
  - Dig layers: up digs one build stage deeper (Finished, Sand, Base rock,
    Backfill, Trench, Excavate, Demo), down goes back toward Finished. Picking
    it builds the stage views ahead, while the view is idle.
  - Mark: up throws a dirt clod from the camera to the center of the view,
    where it lands as a dirt pile with an orange flag and ring (flags grow with
    distance so they stay visible); down removes the last one, a long press
    clears them all. Marks are kept for the session (not in the plan).
  - Tape measure: up drops point A at the center of the view, up again drops B
    and shows the straight distance (feet and inches; level run and rise on a
    slope); down clears.
  - Hand: up opens or turns on, down closes or turns off what the view is on;
    a label by the aim cross names it ("Sauna door: Closed"). While the Hand is
    picked, a click on the thing does the same and the pointer turns to a hand
    over it. What can be used (`builder/actions.ts`, registered as features are
    built, switched and animated without a rebuild): the SaunaLife sauna's door
    and its lights (the LED remote inside by the door); a kitchen's grill lid,
    its doors and its burners (off until lit); any fire (fire pits and tables,
    the linear fire pit, the Cazo fire and water bowl, a patio heater: out, or
    lit even by day); a water wall's, fountain's or fire and water bowl's water; path
    lights and uplights; each Tru-Scapes fixture (its beams and lens); the
    Stratus pergola's LED lights; the Cal Spas spa's
    cover (folded up or closed), jets (bubbles round the seats and steam off the
    water while the cover is open) and lights. Of several things on one feature,
    the one nearest the aim point is used. What is set by hand stays through
    rebuilds until the plan itself changes that thing; the sauna's door and
    lights are its placement `options`, so the studio's own editor saves them,
    and in embed mode the studio sends `{ type: 'action', id, key, on, option? }`
    (`option` names the placement option it mirrors) for the parent to keep.
  - Light: Afternoon, Golden hour, Blue hour, Night. Growth: Install, 1, 3, 5,
    10 years. Views: the saved camera views (formerly D-pad left / right).
- **Library and approvals.** The Library button (top right of the 3D view) opens a panel listing every product:
  plants, trees, turf, bark/mulch/rock, maker paver, wall and curb lines, concrete, and the features
  (pergolas, gazebo, kitchens, fire, water, spa, accents) with the attached roof and California room. Each
  opens on a sample in the 3D view (a 10 x 10 ft patio, a 10 ft wall or curb run, a plant at Install to 10
  years) with its colors, laying patterns and scenes. Generic paver, wall and curb looks are listed apart as
  testers and can be removed. Its Approve toggle decides what the parent offers; the parent saves the choices:
  - Studio to parent: `{ type: 'approve', key, on }` when the person toggles Approve or removes a tester, and
    `{ type: 'library', open }` when the Library opens or closes.
  - Parent to studio: `{ source: 'area-planner', type: 'approvals', approvals: { on: string[], off: string[] } }`
    (send after `ready` and after every change; `null` means the defaults) and `{ ..., type: 'library', open }`.
  - After `ready` and after each `approvals`, the studio sends `{ type: 'catalog', approvals, plants, features,
    structures }`: approved plant ids, approved placeable features `{ id, name, group, swap, footprint, options?, sizes?, size?,
    plantable?, cover?, steps? }` (`sizes` = `{ label, size: [length, depth, height] }[]`, `size` = the standard one's index) and
    `{ cover, calroom }`; after `approvals` it also sends `{ type: 'materials', materials }`, the same list as
    `ready`, now filtered to approved looks.
  - `swap` is the class a feature switches within (`swapClassOf` in `catalog.ts`: "Pergolas and gazebos", "Fire
    features", "Outdoor kitchens", "Hot tubs", "Saunas", "Path lights", "Furniture sets"...). The parent's material
    panel offers a placed feature only other approved features of the same `swap`, and a placed plant only other
    approved plants of the same group. The `swatch` message also answers for `plant:<id>` and `feature:<id>`
    (a picture drawn by the studio), and `look` returns the full Look for the panel to show a candidate before the
    switch is saved. Nothing about a switch is sent from the studio: the parent changes the item in its own plan
    and sends the plan again.
  - Keys (`src/siteplan/approval.ts`): `line:<maker>|<line>` (a line's paver edge is `line:<maker>|<line> 6 x 9 edge`), `mat:<id>`, `plant:<id>`, `feature:<id>`,
    `structure:cover`, `structure:calroom`. Without an override a maker paver or wall line is approved when
    it is in `OFFERED_LINES`; everything else is approved. The toggle waits for the parent's `approvals` echo
    and goes back if none comes. On the studio's own site the Library is view-only.
  - Out of area: a Belgard color not sold in Northern California (Belgard's Pacific Stockton region, listed per line
    in `src/siteplan/belgard-regions.ts`, read from belgard.com and checked against Green Lion's supplier bills) is
    approved apart from its line, under `line:Belgard|<line>|out-of-area`, which is off unless turned on. The Library
    lists those colors as their own row, "<line> (out of area)", and every look of one carries `notice`, a bold
    "Out of area product: ..." line shown above its description in the Library, the second screen and Area Planner's
    material panel.
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
- Marks thrown with the Mark quick tool: after each one lands, is removed or
  all are cleared, the studio sends `{ source: 'growth-studio', type: 'marks',
  marks: [{ x, z, y }] }` (every mark, oldest first, in 3D world meters: x and
  z on the plan, y the height) to the origin that sent the plan. The parent may
  keep them; the studio does not take marks back yet. After a rebuild each mark
  is set back on the surface under it and the updated list is sent again.
- Plant labels (B, `N`, the Plants button) are the studio's own switch; the
  measurement levels and `plan.rulers` are unaffected.
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
- Wall veneers (shelf 'Wall veneer') are wall looks like any other, so a wall changes finish by its look:
  `msi-arctic-golden-ledger` (MSI Arctic Golden Splitface Panel 6x24, split quartzite, on a 10 1/2 in veneered
  block wall capped with MSI Arterra Caldera Blanca 13 x 24 x 2 cm coping, `msi-caldera-blanca-coping`; Coala is
  `msi-caldera-coala-coping`; a Midnight or matching cap choice still overrides),
  `stucco-santa-barbara-sw-agreeable-gray` and `stucco-sand-finish-sw-agreeable-gray` (Green Lion's stucco finishes in
  Sherwin-Williams SW 7029 Agreeable Gray, #D1CBC1, LRV 60; the old `-warm-gray` ids load as these; a stucco wall's cap
  is the same stucco). Columns are features, one per finish
  (`veneer-column-<look id>`): a Basalite 16 in column block core clad in the veneer under a Basalite Column Cap
  24 x 24 x 2 in, heights in whole 8 in block courses (`sizes`), option `pewterCap`. They share the swap class
  'Columns', so a placed column switches finish like any feature. Sample: "Wall veneers".
- A wall's cap overhangs both faces and its open ends by the same amount: the
  maker's own overhang where its cap and block sizes give one (`capOver` on
  the line's wall unit), else 2 1/2 in (the usual 2 to 3 in). Raised planters
  follow the same rule.
- Curbs (`kind: 'edging'` with a curb look) are Belgard Melville Curb units:
  4 in thick, 24 in long with a joint between units, 6 1/2 in tall. `reveal`
  is how much stands above grade in meters (0 to 0.1651); left out, 3 in.
  A curb drawn within 1 ft of a seam between two surfaces (pavers and lawn,
  lawn and pebble) is built on that seam, following its corners: one face
  flush with the higher surface's edge (a patio's soldier course stays in
  full view), the body on the lower side. A line that crosses an edge or a
  notch's mouth stays as drawn. Curb lengths (labels, linear ft) are measured
  along the line as built.
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
  would be thinner than about 0.4 pixel (a third at Max), and lawn tiles
  past that distance or out of view are skipped.
- GPU budget while moving (`engine/framebudget.ts`): while the camera moves,
  depth of field fades out and the scene is drawn at a lower resolution
  (0.6 to 1 of the full size, chosen from the GPU's own frame time, in small
  steps) and scaled up with a light sharpen. When the camera stops, the view
  eases back to full resolution and the focus blur fades back in, so a still
  view always looks the same. Max keeps the full resolution. Diagnostics
  shows the render scale, GPU time, depth of field and what the water
  mirror did.
- The water mirror is drawn only while mirroring water is in view and more
  than a few pixels tall, only over the part of the screen it covers, at 40%
  of the view's size at Balanced, on every other frame while moving at a
  reduced scale, and on every third while the camera is at rest (only swaying
  plants change in it then). Likewise the focus blur is gathered on every
  other frame while the camera and focus hold still; anything else changing
  (a restyle, the sun) redraws both at once.
- Plants with many triangles (maples, yew pines, shade trees) switch to
  fewer leaves at a larger size on screen; far copies keep little wood; wind
  motion under about half a pixel (leaf flutter a few dozen meters out) is
  skipped in the shader; night lights that are off cost nothing per pixel.
- Losing WebGL (Safari can take it away under memory pressure) shows
  "Restoring the 3D view" and rebuilds the yard when it comes back.

## Sound

Sound effects generated with ElevenLabs.

`src/engine/audio.ts` (Web Audio) gives the 3D scenes sound; the clips are in `public/sounds/` (about 0.68 MB in all;
the single-file build `npm run build:artifact` embeds them as base64 in `#sound-data`, the normal build copies them to
`sounds/`).

- Ambience follows the sky: a daytime backyard loop and a night crickets loop, crossfaded with the sky's darkness
  (Afternoon, Golden hour, Blue hour, Night and the time slider).
- Positional loops at ponds, streams, falls, fountains, water walls (`water` action), lit fires (`fire` action) and
  spa jets that are on (`jets` action): distance gain, stereo pan from the listener (the camera when walking or
  flying, the look-at point from orbit). Only the nearest 3 trickles, 2 falls, 2 fires and 1 spa sound at once; the
  rest are silent and free. Pools are quiet.
- Water switched by hand (Hand tool, G, controller) plays the start or stop one-shot at the water; the loop fades in
  after the start and out on stop. Water is off, fire unlit and everything before the Finished stage is silent.
- The Sound button (over the 3D view) and the Volume slider (Camera group) are kept in `localStorage` (`gs-sound`).
  Sound starts after the first click or key, is on by default (also in `?embed=1` and `?viewer=1`), stops when the tab
  is hidden and on the planner's `pause` message (`resume` restarts it). The second-screen window has no sound.
- `studio.audio.debug()` lists the context state, gains, listener and each voice's distance and gain.

Credits and license: the clips are free-tier ElevenLabs sound effects. The free plan requires attribution ("Sound
effects generated with ElevenLabs", shown in the Sound button and Volume tooltips and here) and does not allow
commercial use: a paid plan is needed before this ships in a commercial product.

Prompts (model `eleven_text_to_sound_v2`, `mp3_44100_64`, loops generated with `loop: true`):

| File | Length | Prompt |
| --- | --- | --- |
| `day.mp3` | 14 s | Peaceful daytime suburban backyard ambience: soft birdsong, a light breeze rustling leaves, very faint distant neighborhood hum. Calm, seamless, no sudden sounds. |
| `night.mp3` | 14 s | Summer night ambience: steady crickets chirping with a gentle breeze. Calm, seamless, no sudden sounds. |
| `trickle.mp3` | 12 s | Small garden water feature, gentle water trickling over a spillway into a stone basin, soft splashing. Seamless loop, steady, no other sounds. |
| `waterfall.mp3` | 12 s | Larger backyard waterfall cascading into a pond, rushing water over rocks, deeper steady flow. Seamless loop, no other sounds. |
| `fire.mp3` | 12 s | Outdoor fire pit crackling softly, gentle wood pops and steady flame hiss. Seamless loop, no voices. |
| `spa.mp3` | 12 s | Hot tub spa jets running, steady bubbling and churning water with a soft motor hum. Seamless loop, no voices. |
| `water-on.mp3` | 4 s | A water pump switching on, motor hum starting, then water begins to flow and splash into a pond, building to a steady stream. |
| `water-off.mp3` | 4 s | A water feature switching off: flowing water slows and stops, pump goes quiet, a few last drips falling into a basin. |

The player also blends each loop's last 0.35 s into its start (equal power) when it decodes it, so the loop point
cannot click.

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
