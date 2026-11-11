# Green Lion Growth Studio

Growth Studio turns a landscape blueprint or yard photo into a 3D scene of
the finished Green Lion install, with plants growing from install to 10 years.
It is written from scratch on Three.js. The look follows Green Lion's own
finished-work photos in `reference/green-lion-style/`.

## How it fits together
- `src/siteplan/` — the SitePlan JSON contract (`types.ts`), the catalog
  (`catalog.ts`), cleanup of any input (`validate.ts`), geometry helpers and
  sample yards. Everything talks through the SitePlan.
- `src/engine/` — renderer: sky and real sun position (`sky.ts`), procedural
  PBR textures (`textures.ts`, `surfaces.ts`), plant growth and wind shaders
  (`foliage.ts`), water and planar reflections (`water.ts`), camera look with
  focus blur, bloom and grade (`post.ts`), generated camera views (`views.ts`),
  and the runtime that ties it together (`studio.ts`).
- `src/builder/` — SitePlan to 3D: ground splat, turf, hardscape with borders,
  walls and fences, water features and waterfalls, structures, features,
  procedural plants, and the neighborhood context.
- `src/app/` — the UI: page markup and styles (`page.html`), app logic
  (`main.ts`), the 2D plan editor (`planeditor.ts`), the plan reader prompt
  (`reader.ts`) and PDF import (`pdf.ts`).
- `server/read-plan-server.mjs` — optional plan reader for hosting outside
  Claude. Keeps the Anthropic API key on the server.

## Rules
- The SitePlan is the only contract between reader, editor, builder and
  renderer. Change `types.ts` and `validate.ts` together, and keep old saved
  plans loading (see `LEGACY_IDS` in the catalog).
- No hardcoded scene coordinates in `engine/`. Views, water, sun and lights
  come from the SitePlan.
- No image files ship with the app. Surfaces are drawn by recipes in
  `engine/surfaces.ts`. Manufacturer photos (Belgard, Basalite) are color and
  pattern references only; do not embed them.
- Use only real Green Lion content. Plant sizes and the catalog are starting
  values until Green Lion's own plant and material list replaces them. Never
  invent prices, reviews or project details.
- UI: plain, professional, calm. No gradients, glassmorphism, pill buttons,
  glowing or floating elements, heavy animation or generic SaaS layouts. The
  3D scene is the hero.
- The Anthropic API key lives on the server only.

## Commands
- `npm install`, then `npm run dev` for local development.
- `npm run check` type-checks. Run it before finishing any change.
- `npm run build:artifact` writes `dist/growth-studio.html` (single file, used
  for the published demo) and `dist/index.html`.
- `ANTHROPIC_API_KEY=... npm run server` serves `dist/` with plan reading.

## Before calling a change done
Type-check, build, open the app, and look at the sample yards in all four
lighting moods and at install and 10 years.
