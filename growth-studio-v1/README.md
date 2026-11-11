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
