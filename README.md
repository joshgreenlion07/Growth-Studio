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

- `plan` is SitePlan JSON (`src/siteplan/types.ts`), in meters. It is cleaned
  by `cleanPlan` first, so missing fields get defaults. When the cleanup
  changed or dropped something, the `built` reply also carries
  `warnings: string[]`. `site.streetEdge` and `structures` can be left out.
- Area Planner sends a drawn house as a `structures` item with `openings`
  (the doors and windows marked on it; each is moved onto the nearest wall).
  A structure of kind `cover` is a roofed patio on posts. A pool can carry
  `coping` (width in meters, 0 for none) and is cut out of any paving that
  fully surrounds it.
- `materials` lists the paver, border and wall looks the parent can offer:
  `{ id, name, use, maker, line, shelf, color, sw }[]`: who makes it, its
  product line, the catalogue shelf it sits on (Pavers, Retaining walls,
  Garden walls, Curb), the color name alone and one swatch color. Generic
  looks have an empty `maker`. Each maker paver color also has a matching
  border, `border-of-<id>`, which is not listed. `select` carries the id of the
  plan item that was clicked, or `null` for bare ground.
- A hardscape zone's `border` can carry `course: 'sailor'` to lay the border
  pavers end to end; a wall line can carry `cap: 'same' | 'midnight'`.
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
