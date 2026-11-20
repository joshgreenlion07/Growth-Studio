import * as THREE from 'three';
import { swing } from '../actions';
import { plainMaterial } from '../materials';
import { blackstoneBuiltIn, blackstoneCart, type BlackstoneCart } from '../../siteplan/blackstone';
import type { FeatureSpec } from '../../siteplan/catalog';
import { IN, bx, cy, rbx, stainless, kitchenMats, type KitchenMats, type KitchenSink, type Mover } from './kit';
import { propaneTank, type PartCtx } from './parts';

/*
 * Blackstone griddles (siteplan/blackstone.ts), drawn to Blackstone's published sizes with the look of its product
 * photos and dimension graphics. Inches throughout, as the rest of the kitchen builder.
 *
 *   Built-in   blackstoneBuiltIn(): the 6128 / 6301 griddle (and the 6138 / 6303, the same at 40.7 in), standing on
 *              its cavity's floor with its front panel out of the counter's notch: a black body; the forward-leaning
 *              brushed stainless control panel between black side caps, its knobs in chrome bezels with white LED
 *              rings and the lighting instructions printed at both ends; the black vent band of diamond perforations
 *              with the boxed BLACKSTONE badge; the cooktop with its wind guards; the brushed stainless hood with
 *              black end caps and the round tube handle on two standoffs (no logo on the hood, as on the real one);
 *              the rear grease cup. The 6029 is the same griddle sitting in the stainless insulating jacket, its
 *              BLACKSTONE plate on the jacket's front lip.
 *   Cart       griddleStation(): the 2287 (28 in) and 2322 (36 in) Original Omnivore griddles with hood on their carts.
 *
 * Sizes Blackstone does not publish (the parts of the overall height and depth, knob sizes, the cart's shelves, wheels
 * and cooking height) are scaled from its dimension graphics against the published overall sizes.
 */

type Add = (m: THREE.Material, g: THREE.BufferGeometry) => void;

/* ------------------------------------------------------------------ */
/* Materials and printed faces                                          */
/* ------------------------------------------------------------------ */

const ORANGE = '#e8662c';
const cache = new Map<string, THREE.Material>();
const coat = () => plainMaterial('bs-coat-black', { color: '#1f1f1f', roughness: 0.5, metalness: 0.2 });
const hoodCoat = () => plainMaterial('bs-hood-black', { color: '#2a2a2a', roughness: 0.46, metalness: 0.25 });
const frameCoat = () => plainMaterial('bs-frame-black', { color: '#1b1b1a', roughness: 0.55, metalness: 0.2 });
const charcoal = () => plainMaterial('bs-knob-charcoal', { color: '#3a3a3a', roughness: 0.35, metalness: 0.1 });
const orange = () => plainMaterial('bs-orange', { color: ORANGE, roughness: 0.45, metalness: 0 });
const ledRing = () => plainMaterial('bs-led-ring', { color: '#e9ecef', roughness: 0.2, metalness: 0 });
const rubber = () => plainMaterial('bs-rubber', { color: '#141414', roughness: 0.9 });
const plateSteel = () => plainMaterial('bs-plate', { color: '#171615', roughness: 0.74, metalness: 0.3 });
const brushed = () => stainless('bs-ss', '#9a9894', 1, 0.75);

/** A canvas-drawn face, cached by key; null without a document (a worker). */
function canvasMat(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, opts: THREE.MeshStandardMaterialParameters & { physical?: boolean } = {}): THREE.Material | null {
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const { physical, ...rest } = opts;
  const m = physical ? new THREE.MeshPhysicalMaterial({ map: t, ...rest }) : new THREE.MeshStandardMaterial({ map: t, ...rest });
  cache.set(key, m);
  return m;
}

/** Blackstone's three-tongue flame, standing on (x, y), `s` tall. */
function flame(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  for (const [dx, hh, w, lean] of [[-0.3, 0.62, 0.24, -0.1], [0, 1, 0.3, 0.12], [0.3, 0.7, 0.24, 0.16]]) {
    const bx0 = x + dx * s;
    g.beginPath();
    g.moveTo(bx0 - (w * s) / 2, y);
    g.quadraticCurveTo(bx0 - w * s * 0.7, y - hh * s * 0.5, bx0 + lean * s, y - hh * s);
    g.quadraticCurveTo(bx0 + w * s * 0.6, y - hh * s * 0.45, bx0 + (w * s) / 2, y);
    g.closePath();
    g.fill();
  }
}

/**
 * The BLACKSTONE wordmark: wide geometric capitals, the flame rising from the S, a small (R) after the E. Centered at
 * (cx, cy), cap height h. `flameColor` null leaves the flame off (the big orange wordmark on a cart's front plate).
 */
function wordmark(g: CanvasRenderingContext2D, cx: number, cyy: number, h: number, color: string, flameColor: string | null, reg = true) {
  g.save();
  g.font = `700 ${Math.round(h * 1.38)}px "Avenir Next", Futura, "Century Gothic", Montserrat, "Helvetica Neue", Arial, sans-serif`;
  g.textBaseline = 'alphabetic';
  const text = 'BLACKSTONE', sx = 1.16;
  const w = g.measureText(text).width * sx;
  g.translate(cx - w / 2, cyy + h / 2);
  g.scale(sx, 1);
  g.fillStyle = color;
  g.fillText(text, 0, 0);
  if (flameColor) {
    const before = g.measureText('BLACK').width, sw = g.measureText('S').width;
    g.fillStyle = flameColor;
    flame(g, before + sw * 0.55, -h * 1.02, h * 0.62);
  }
  if (reg) {
    g.fillStyle = color;
    g.font = `500 ${Math.round(h * 0.32)}px Arial, sans-serif`;
    g.fillText('®', w / sx + h * 0.08, -h * 0.62);
  }
  g.restore();
}

/** Lines of small print (lighting instructions), left-aligned in a box. */
function smallPrint(g: CanvasRenderingContext2D, x: number, y: number, w: number, lineH: number, color: string, lines: string[]) {
  g.save();
  g.fillStyle = color;
  g.font = `800 ${Math.round(lineH * 0.82)}px Arial, sans-serif`;
  g.fillText(lines[0], x, y, w);
  g.font = `600 ${Math.round(lineH * 0.74)}px Arial, sans-serif`;
  lines.slice(1).forEach((l, i) => g.fillText(l, x, y + (i + 1) * lineH, w));
  g.restore();
}

const LIGHTING = ['LIGHTING INSTRUCTIONS', '1. Read all instructions before lighting.', '2. Open hood prior to lighting.', '3. Push the control knob in, turn to start gas flowing.', '4. Turn knob to HIGH to ignite the burner.', '5. Adjust to the desired heat level.', '6. If ignition does not occur in 5 seconds, return to OFF.', 'WARNING: Do not touch faceplate while cooking.'];
const ALLUMAGE = ['INSTRUCTIONS POUR L\'ALLUMAGE', '1. Lisez toutes les instructions avant d\'allumer.', '2. Ouvrez le couvercle avant l\'allumage.', '3. Enfoncez le bouton, tournez pour le gaz.', '4. Tournez a HIGH pour allumer le bruleur.', '5. Reglez la chaleur voulue.', '6. Sans allumage en 5 secondes, revenez a OFF.', 'AVERTISSEMENT: Ne touchez pas la facade.'];

/** The built-in's vent band: diamond perforations each side of the boxed badge. */
function ventBand(widthIn: number): THREE.Material | null {
  const W = 2048, H = Math.round(2048 * (2 / widthIn));
  return canvasMat(`bs-vent-${widthIn}`, W, H, (g) => {
    g.fillStyle = '#242424';
    g.fillRect(0, 0, W, H);
    const px = W / widthIn, d = 0.2 * px, gap = 0.3 * px;
    g.fillStyle = '#080808';
    for (let row = 0; row < 3; row++) {
      const yy = H * (0.28 + row * 0.22);
      for (let xx = W * 0.03 + (row % 2) * gap / 2; xx < W * 0.97; xx += gap) {
        if (Math.abs(xx - W / 2) < W * 0.12) continue;
        g.beginPath();
        g.moveTo(xx, yy - d / 2);
        g.lineTo(xx + d / 2, yy);
        g.lineTo(xx, yy + d / 2);
        g.lineTo(xx - d / 2, yy);
        g.closePath();
        g.fill();
      }
    }
    // The badge: a white outline box, the white wordmark, a gray flame.
    const bw = 5.3 * px, bh = H * 0.62;
    g.strokeStyle = '#e8e8e6';
    g.lineWidth = Math.max(2, px * 0.05);
    g.strokeRect(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh);
    wordmark(g, W / 2, H / 2 + bh * 0.08, bh * 0.34, '#ecebe8', '#8d8d8b', false);
  }, { roughness: 0.55, metalness: 0.2 });
}

/** The print on the built-in's stainless panel: instructions at both ends, the off mark and ignition icon by each knob. */
function panelPrint(widthIn: number, heightIn: number, knobsAt: number[]): THREE.Material | null {
  const W = 2048, H = Math.round((W * heightIn) / widthIn);
  return canvasMat(`bs-panel-print-${widthIn}-${knobsAt.length}`, W, H, (g) => {
    g.clearRect(0, 0, W, H);
    const px = W / widthIn;
    smallPrint(g, px * 1.2, H * 0.22, px * 5.4, px * 0.36, '#151515', LIGHTING);
    smallPrint(g, W - px * 6.7, H * 0.16, px * 5.4, px * 0.36, '#151515', ALLUMAGE);
    g.fillStyle = '#151515';
    g.strokeStyle = '#151515';
    g.lineWidth = px * 0.07;
    for (const u of knobsAt) {
      const kx = (u / widthIn + 0.5) * W, ky = H * 0.5;
      g.beginPath();
      g.arc(kx, ky - px * 1.75, px * 0.09, 0, Math.PI * 2);
      g.stroke();
      flame(g, kx - px * 1.62, ky + px * 0.15, px * 0.3);
    }
  }, { transparent: true, alphaTest: 0.12, roughness: 0.5, metalness: 0 });
}

/** A cart's black front panel: small logo over the igniter, instructions, knob tick arcs, the gray plate's wordmark. */
function cartPanel(c: BlackstoneCart, widthIn: number, heightIn: number, knobsAt: number[], knobY: number): THREE.Material | null {
  const W = 2048, H = Math.round((W * heightIn) / widthIn);
  return canvasMat(`bs-cart-panel-${c.model}`, W, H, (g) => {
    const px = W / widthIn;
    g.fillStyle = '#171717';
    g.fillRect(0, 0, W, H);
    // The gray plate: a trapezoid along the bottom, its left side slanting, the orange wordmark on it.
    const pl = W * 0.2, pr = W * 0.86, ptop = H - px * 4.1;
    g.fillStyle = '#5d5c58';
    g.beginPath();
    g.moveTo(pl, H);
    g.lineTo(pl + px * 2.6, ptop);
    g.lineTo(pr - px * 1.4, ptop);
    g.lineTo(pr, ptop + px * 1.4);
    g.lineTo(pr, H);
    g.closePath();
    g.fill();
    wordmark(g, (pl + pr) / 2 + px * 0.6, (ptop + H) / 2 + px * 0.1, px * 1.45, ORANGE, null, false);
    // Small logo top-left, with its orange flame; the instructions under it and at the right.
    const lx = px * 4.6;
    g.save();
    g.translate(0, 0);
    wordmark(g, lx, px * 1.6, px * 0.48, '#f1f1ef', ORANGE, true);
    g.restore();
    smallPrint(g, px * 1.2, px * 4.3, px * 6, px * 0.32, '#e6e6e4', LIGHTING);
    smallPrint(g, W - px * 7.2, px * 1.3, px * 6, px * 0.32, '#e6e6e4', ALLUMAGE);
    // Each knob's tick arc (white dashes, the first ones orange: low to high) and its off mark.
    for (const u of knobsAt) {
      const kx = (u / widthIn + 0.5) * W, ky = H - (knobY / heightIn) * H;
      const r0 = px * 1.45, r1 = px * 1.75;
      for (let i = 0; i < 11; i++) {
        const a = Math.PI * (0.62 + (i / 10) * 0.62);
        g.strokeStyle = i < 3 ? ORANGE : '#f0f0ee';
        g.lineWidth = px * 0.09;
        g.beginPath();
        g.moveTo(kx + Math.cos(a) * r0, ky + Math.sin(a) * r0);
        g.lineTo(kx + Math.cos(a) * r1, ky + Math.sin(a) * r1);
        g.stroke();
      }
      g.strokeStyle = '#f0f0ee';
      g.lineWidth = px * 0.05;
      g.beginPath();
      g.arc(kx, ky - px * 1.75, px * 0.1, 0, Math.PI * 2);
      g.stroke();
    }
  }, { roughness: 0.5, metalness: 0.15 });
}

/** The hood's embossed emblem and name, a shade lighter than the hood, on a clear ground. */
function hoodEmboss(): THREE.Material | null {
  return canvasMat('bs-hood-emboss', 1024, 384, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const col = '#4a4a4a';
    g.strokeStyle = col;
    g.lineWidth = 10;
    g.beginPath();
    g.ellipse(W / 2, H * 0.3, W * 0.12, H * 0.18, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = col;
    flame(g, W / 2, H * 0.42, H * 0.22);
    wordmark(g, W / 2, H * 0.74, H * 0.16, col, null, false);
  }, { transparent: true, alphaTest: 0.35, roughness: 0.38, metalness: 0.25 });
}

/** The slotted lower shelf with the flame emblem pressed into it. */
function lowerShelf(): THREE.Material | null {
  return canvasMat('bs-lower-shelf', 1024, 512, (g, W, H) => {
    g.fillStyle = '#1d1d1c';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#070707';
    for (let r = 0; r < 9; r++) for (let k = 0; k < 18; k++) {
      const x = W * 0.05 + k * W * 0.052 + (r % 2) * W * 0.026, y = H * 0.1 + r * H * 0.1;
      if (Math.hypot((x - W / 2) / (W * 0.16), (y - H / 2) / (H * 0.26)) < 1.15) continue;
      g.fillRect(x, y, W * 0.03, H * 0.03);
    }
    g.strokeStyle = '#2c2c2b';
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(W / 2, H / 2, W * 0.15, H * 0.24, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#2c2c2b';
    flame(g, W / 2, H * 0.62, H * 0.26);
  }, { roughness: 0.6, metalness: 0.2 });
}

/** A plane w x h inches facing +z, centered at (x, y, z), leaning back by `lean` radians (its top toward -z). */
function face(w: number, h: number, x: number, y: number, z: number, lean = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w * IN, h * IN);
  if (lean) g.rotateX(-lean);
  g.translate(x * IN, y * IN, z * IN);
  return g.toNonIndexed();
}

/** A shape in (z, y) inches extruded along x from x0 to x1. */
function profileX(pts: [number, number][], x0: number, x1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z * IN, y * IN)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: (x1 - x0) * IN, bevelEnabled: false, curveSegments: 1 });
  // Shape (z, y) along e: rotate e onto -x (x = -e), then move so it runs x0..x1.
  g.rotateY(-Math.PI / 2);
  g.translate(x1 * IN, 0, 0);
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return n;
}

/* ------------------------------------------------------------------ */
/* The built-in griddle                                                 */
/* ------------------------------------------------------------------ */

/**
 * The 6128-style griddle head: its base at y0, its body's front at zb (the body runs back 25 in from there), the
 * control panel standing out in front (29 1/4 in deep in all, with the handle). W and H its width and height.
 */
function builtInHead(k: PartCtx, W: number, H: number, y0: number, zb: number, n: number, cook: [number, number], add: Add): Mover[] {
  const m = k.mats, x = k.x;
  const bodyD = 25, zf = zb + 3;
  const panelW = W - 1.6;
  // Body: black box with its side panels, and the vent-slot strip under the panel.
  add(coat(), bx(W - 0.6, 7, bodyD, x, y0, zb - bodyD / 2));
  add(m.rubber, bx(panelW, 0.9, 0.4, x, y0, zb + 3.5));
  // The panel housing: black side caps (a slanted front), its black top under the hood.
  // The panel's face runs from 4 in out at its foot to 3.08 in at its top, 4.1 in higher.
  const lean = Math.atan2(0.92, 4.1);
  for (const s of [-1, 1]) {
    const cap = profileX([[zb, 0], [zb + 4, 0.9], [zb + 3, 5], [zb + 3, 7], [zb, 7]], -0.4, 0.4);
    cap.translate((x + s * (W / 2 - 0.4)) * IN, y0 * IN, 0);
    add(coat(), cap);
  }
  add(coat(), bx(panelW, 0.12, 3, x, y0 + 6.88, zb + 1.5));
  // The forward-leaning brushed panel, its print, the knobs.
  const panel = profileX([[zb + 3.92, 0.9], [zb + 4.0, 0.9], [zb + 3.08, 5], [zb + 3.0, 5]], x - panelW / 2, x + panelW / 2);
  panel.translate(0, y0 * IN, 0);
  add(brushed(), panel);
  const span = Math.min(panelW - 9, n * 8.6);
  const kxs = Array.from({ length: n }, (_, i) => -span / 2 + ((i + 0.5) * span) / n);
  const slant = Math.hypot(0.92, 4.1), fzMid = zb + 4.0 - 0.92 * (2.05 / 4.1);
  const print = panelPrint(panelW, slant, kxs);
  if (print) add(print, face(panelW, slant, x, y0 + 2.95, fzMid + 0.025, lean));
  for (const kx of kxs) knobBuiltIn(add, m, x + kx, y0 + 2.95, fzMid, lean);
  // The vent band with its badge.
  const vent = ventBand(panelW);
  add(vent ?? coat(), vent ? face(panelW, 2, x, y0 + 6, zb + 3.01) : bx(panelW, 2, 0.1, x, y0 + 5, zb + 2.96));
  // The cooktop and its wind guards (inside the hood when it is shut).
  const pz = zb - bodyD / 2 - 0.5;
  add(plateSteel(), rbx(cook[0], 0.38, cook[1], x, y0 + 6.62, pz, 0.08));
  for (const s of [-1, 1]) add(coat(), bx(0.12, 2.1, cook[1] + 0.4, x + s * (cook[0] / 2 + 0.06), y0 + 6.7, pz));
  add(coat(), bx(cook[0] + 0.24, 2.1, 0.12, x, y0 + 6.7, pz - cook[1] / 2 - 0.06));
  // The rear grease cup at the back center.
  add(coat(), bx(6, 3, 1.4, x, y0 + 1.2, zb - bodyD - 0.7));
  add(m.steel, cy(0.12, 0.12, 2.6, x, y0 + 3.6, zb - bodyD - 1.2, 'x', 8));
  // The hood: brushed top rolling down at the front, black end caps, the tube handle; hinged at the back.
  const hh = H - 7, hy = y0 + 7, hzb = zb - bodyD;
  const hood = k.sink.hinge(x * IN, hy * IN, hzb * IN);
  const prof: [number, number][] = [[hzb, 0], [zf, 0], [zf + 0.15, 0.9], [zf - 0.3, 3.0], [zf - 1.3, 4.9], [zf - 2.6, 5.9], [zf - 3.8, hh], [hzb + 0.3, hh], [hzb, hh - 0.3]];
  const local = (g: THREE.BufferGeometry) => g.translate(0, (hy) * IN, 0);
  const capT = 0.7;
  hood.add(brushed(), local(profileX(prof, x - W / 2 + capT, x + W / 2 - capT)));
  for (const s of [-1, 1]) hood.add(coat(), local(profileX(prof.map(([z, y]) => [z + 0.04, y + 0.03] as [number, number]), s < 0 ? x - W / 2 : x + W / 2 - capT, s < 0 ? x - W / 2 + capT : x + W / 2)));
  hood.add(m.inside, bx(W - 1.6, 0.05, bodyD + 2.4, x, hy + 0.05, (hzb + zf) / 2));
  const hz = zf + 0.82, hyy = hy + 0.78;
  hood.add(m.chrome, cy(0.4, 0.4, W + 0.3, x, hyy, hz, 'x', 18));
  for (const s of [-1, 1]) {
    hood.add(m.steel, bx(0.55, 0.5, 1.1, x + s * (W / 2 - 1.1), hyy - 0.25, zf + 0.35));
    const end = new THREE.SphereGeometry(0.4 * IN, 12, 8).translate((x + s * (W / 2 + 0.15)) * IN, hyy * IN, hz * IN);
    hood.add(m.chrome, end.toNonIndexed());
  }
  return [{ kind: 'hood', label: 'Griddle hood', rig: swing(hood.group, 'x', -1.42, false), anchor: k.sink.anchor(hood.group, 0, (hh * 0.5) * IN, (bodyD * 0.5) * IN) }];
}

/** A built-in's knob on the leaning panel: chrome bezel, white LED ring, the charcoal knob and its grip ridge. */
function knobBuiltIn(add: Add, m: KitchenMats, x: number, y: number, z: number, lean: number) {
  const parts: [THREE.Material, THREE.BufferGeometry][] = [
    [m.chrome, cy(1.5, 1.5, 0.16, 0, 0, 0.08, 'z', 36)],
    [ledRing(), cy(1.28, 1.28, 0.22, 0, 0, 0.12, 'z', 36)],
    [charcoal(), cy(1.12, 1.05, 1.0, 0, 0, 0.7, 'z', 32)],
    [charcoal(), rbx(0.55, 1.95, 0.42, 0, -0.98, 1.38, 0.18)],
  ];
  const mtx = new THREE.Matrix4().makeTranslation(x * IN, y * IN, z * IN).multiply(new THREE.Matrix4().makeRotationX(-lean));
  for (const [mm, g] of parts) add(mm, g.applyMatrix4(mtx));
}

/** The built-in griddle part in its bay (kitchen part type 'griddle'). */
export function blackstoneBuiltInPart(k: PartCtx): Mover[] {
  const p = k.part, spec = blackstoneBuiltIn(p.id);
  const [W, , H] = spec?.griddle ?? p.overall;
  const [cw, cd, ch] = p.cutout ?? [W, 25, 7.59];
  const add = k.sink.add, zb = k.edge;
  if (spec?.jacket) {
    // The insulating jacket: a 304 stainless sleeve filling the cavity, the griddle on its raised floor, the
    // BLACKSTONE plate on its front lip at the right.
    // The jacket fills the cavity and comes forward under the panel, its front lip flush with the panel's foot
    // (38 1/2 x 32 in in all, Blackstone's graphic).
    const [JW, JD, JH] = p.overall;
    const jw = Math.min(JW, cw - 0.1), jb = k.top - ch, lift = JH - H;
    const jz1 = zb - (cd - 0.1) + JD - 0.4, jz0 = zb - (cd - 0.1), jd = jz1 - jz0;
    const ss = brushed();
    add(ss, bx(jw, 0.1, jd, k.x, jb, (jz0 + jz1) / 2));
    for (const s of [-1, 1]) add(ss, bx(0.08, ch, jd, k.x + s * (jw / 2 - 0.04), jb, (jz0 + jz1) / 2));
    add(ss, bx(jw, ch, 0.08, k.x, jb, jz0 + 0.04));
    add(ss, bx(jw, lift, 0.1, k.x, jb, jz1 - 0.05));
    const plate = canvasMat('bs-jacket-plate', 512, 96, (g, w, h) => {
      g.fillStyle = '#d2d2cf';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2a2a2a';
      g.lineWidth = 4;
      g.strokeRect(6, 6, w - 12, h - 12);
      wordmark(g, w / 2, h / 2 + 4, h * 0.36, '#262626', '#555', false);
    }, { roughness: 0.3, metalness: 0.6 });
    if (plate) add(plate, face(5, 0.95, k.x + jw / 2 - 4.2, jb + lift / 2, jz1 + 0.01));
    return builtInHead(k, W, H, jb + lift, zb, p.knobs ?? p.burners ?? 3, spec.cook, add);
  }
  return builtInHead(k, W, H, k.top - ch, zb, p.knobs ?? p.burners ?? 3, spec?.cook ?? [27.5, 21.5], add);
}

/* ------------------------------------------------------------------ */
/* The cart                                                             */
/* ------------------------------------------------------------------ */

/** A cart knob: black, an orange pointer fin, on the panel facing +z at z. */
function cartKnob(add: Add, x: number, y: number, z: number) {
  add(coat(), cy(1.05, 0.98, 1.25, x, y, z + 0.62, 'z', 28));
  add(charcoal(), cy(0.62, 0.62, 0.1, x, y, z + 1.27, 'z', 20));
  add(orange(), rbx(0.32, 1.0, 0.36, x, y + 0.15, z + 1.36, 0.12));
}

/** A wheel (radius r, width w) with its hub, axle along x at (x, y, z). */
function wheel(add: Add, x: number, y: number, z: number, r: number, w: number) {
  add(rubber(), cy(r, r, w, x, y, z, 'x', 28));
  add(frameCoat(), cy(r * 0.55, r * 0.55, w + 0.1, x, y, z, 'x', 20));
  add(plainMaterial('bs-hub', { color: '#8c8c8a', roughness: 0.35, metalness: 0.8 }), cy(0.35, 0.35, w + 0.5, x, y, z, 'x', 10));
}

/** A Blackstone griddle cooking station on its cart (kind 'griddleStation'), its front toward +z. */
export function griddleStation(sink: KitchenSink, spec: FeatureSpec, options: Record<string, boolean> | undefined, seed: string) {
  const c = blackstoneCart(spec.id);
  if (!c) return;
  void seed;
  const m = kitchenMats();
  const add = sink.add;
  const [W, D, H] = c.overall;
  const opt = (key: string) => options?.[key] ?? spec.options?.find((o) => o.key === key)?.default ?? false;
  // Widths across: left shelf, the griddle body, right shelf, the bin's overhang (1 in); depths: the body, then 2 in of
  // knobs in front and 1 1/2 in of grease cup behind.
  const [Ls, Rs] = c.shelvesIn;
  const Bw = W - Ls - Rs - 1;
  const bx0 = -W / 2 + Ls, bx1 = bx0 + Bw, bcx = (bx0 + bx1) / 2;
  const bodyD = D - 3.5, zF = D / 2 - 2, zB = zF - bodyD, zc = (zF + zB) / 2;
  const pTop = c.plateIn, panelH = 10.5, pBot = pTop - 0.5 - panelH;
  const f = frameCoat(), k0 = coat();

  // The firebox under the plate and the front panel (its print drawn on it).
  add(k0, bx(Bw, panelH, bodyD - 0.2, bcx, pBot, zc - 0.1));
  const knobY = 6.9;
  const span = Bw * (c.burners > 2 ? 0.56 : 0.42);
  const kxs = Array.from({ length: c.burners }, (_, i) => -span / 2 + ((i + 0.5) * span) / c.burners + Bw * 0.04);
  const pmat = cartPanel(c, Bw, panelH, kxs, knobY);
  if (pmat) add(pmat, face(Bw, panelH, bcx, pBot + panelH / 2, zF + 0.01));
  for (const kx of kxs) cartKnob(add, bcx + kx, pBot + knobY, zF);
  // The push igniter under the small logo; a bottle opener at the right on the 36 in.
  add(m.chrome, cy(0.62, 0.62, 0.3, bcx - Bw / 2 + 4.6, pBot + knobY - 0.4, zF + 0.15, 'z', 20));
  add(m.chrome, cy(0.42, 0.45, 0.55, bcx - Bw / 2 + 4.6, pBot + knobY - 0.4, zF + 0.4, 'z', 20));
  if (c.burners > 2) add(m.steel, rbx(1.4, 2.6, 0.35, bcx + Bw / 2 - 3.2, pBot + knobY - 0.6, zF + 0.17, 0.25));
  // The cooktop, wind guards on the sides and back, the rear grease cup.
  const pz = zc - 0.3;
  add(plateSteel(), rbx(c.cook[0], 0.38, c.cook[1], bcx, pTop - 0.38, pz, 0.08));
  add(k0, bx(Bw - 0.2, 0.3, bodyD - 0.4, bcx, pTop - 0.75, zc));
  for (const s of [-1, 1]) add(k0, bx(0.12, 2.0, c.cook[1] + 0.3, bcx + s * (c.cook[0] / 2 + 0.06), pTop - 0.1, pz));
  add(k0, bx(c.cook[0] + 0.24, 2.0, 0.12, bcx, pTop - 0.1, pz - c.cook[1] / 2 - 0.06));
  add(k0, bx(6, 3.4, 1.4, bcx, pTop - 5, zB - 0.7));
  add(m.steel, cy(0.12, 0.12, 2.6, bcx, pTop - 1.8, zB - 1.2, 'x', 8));

  // The hood: a low rounded loaf in black, the emblem and name embossed on top, the X brace inside; the bar handle on
  // standoffs ringed in orange. Hinged at the back.
  const hy = pTop - 0.2, hh = H - hy, hzF = zF + 0.15, hzB = zB - 0.2;
  const hood = sink.hinge(bcx * IN, hy * IN, hzB * IN);
  const prof: [number, number][] = [[hzB, 0], [hzF, 0], [hzF, 0.7]];
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    prof.push([hzF - 4.2 * (1 - Math.cos(a)), 0.7 + (hh - 0.7) * Math.sin(a)]);
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    prof.push([hzB + 2.2 * (1 - Math.sin(a)), 0.7 + (hh - 0.7) * Math.cos(a)]);
  }
  const hw = Bw - 0.2;
  hood.add(hoodCoat(), profileX(prof, bcx - hw / 2, bcx + hw / 2).translate(0, hy * IN, 0));
  hood.add(m.inside, bx(hw - 0.4, 0.05, hzF - hzB - 0.4, bcx, hy + 0.06, (hzF + hzB) / 2));
  // The stamped X brace under the flat of the top (the front and back roll down past it).
  const fz0 = hzB + 2.4, fz1 = hzF - 4.4, bw2 = hw - 3, bd2 = fz1 - fz0;
  const xl = Math.hypot(bw2, bd2);
  for (const s of [-1, 1]) {
    const brace = bx(xl, 0.2, 1.4, 0, 0, 0);
    brace.rotateY(s * Math.atan2(bd2, bw2));
    brace.translate(bcx * IN, (hy + hh - 0.5) * IN, ((fz0 + fz1) / 2) * IN);
    hood.add(hoodCoat(), brace);
  }
  const emb = hoodEmboss();
  if (emb) {
    const ep = new THREE.PlaneGeometry(hw * 0.4 * IN, hw * 0.15 * IN).rotateX(-Math.PI / 2);
    ep.translate(bcx * IN, (hy + hh + 0.015) * IN, ((hzF + hzB) / 2 - 1.2) * IN);
    hood.add(emb, ep.toNonIndexed());
  }
  const hl = Bw * (c.burners > 2 ? 0.36 : 0.42), hdy = hy + 1.1;
  hood.add(k0, rbx(hl, 0.9, 0.8, bcx, hdy - 0.45, hzF + 1.7, 0.3));
  for (const s of [-1, 1]) {
    hood.add(k0, cy(0.32, 0.32, 1.7, bcx + s * (hl / 2 - 0.6), hdy, hzF + 0.85, 'z', 14));
    hood.add(orange(), cy(0.62, 0.62, 0.55, bcx + s * (hl / 2 - 0.6), hdy, hzF + 0.55, 'z', 20));
  }
  sink.act({ key: 'hood', label: 'Griddle hood', words: ['Open', 'Closed'], anchors: [sink.anchor(hood.group, 0, (hh * 0.6) * IN, ((hzF - hzB) * 0.7) * IN)], on: false, planOn: false, ...swing(hood.group, 'x', -1.45, false) });

  // Side shelves on the panel's ends (black sheet with folded edges), the left one's tool hooks, the right one's bin.
  const shY = pTop - 1.6, shD = bodyD - 1.2;
  add(k0, rbx(Ls - 0.2, 1.1, shD, -W / 2 + Ls / 2, shY, zc, 0.15));
  add(k0, rbx(Rs - 0.2, 1.1, shD, bx1 + Rs / 2, shY, zc, 0.15));
  for (const [sx, sw] of [[-W / 2 + Ls / 2, Ls], [bx1 + Rs / 2, Rs]] as const) add(m.rubber, bx(sw * 0.45, 0.35, 0.05, sx, shY + 0.35, zc + shD / 2 + 0.01));
  for (let i = 0; i < 3; i++) add(f, cy(0.12, 0.12, 0.9, -W / 2 - 0.4, shY + 0.55, zc + shD / 2 - 2.5 - i * 2.2, 'x', 8));
  add(k0, bx(4, 4.2, 8.5, bx1 + Rs - 1.2, shY - 4.3, zc + shD / 2 - 4.6));
  if (c.burners > 2) {
    // The paper towel holder under the right shelf.
    add(f, cy(0.2, 0.2, Rs + 1.5, bx1 + (Rs + 1.5) / 2, shY - 3, zc + shD / 2 - 1.5, 'x', 10));
    add(f, cy(0.2, 0.2, 2.2, bx1 + Rs + 1.5, shY - 3, zc + shD / 2 - 1.5, 'y', 10));
  }
  // Shelf braces under each shelf.
  for (const [x0, x1] of [[-W / 2 + 1, bx0], [bx1, bx1 + Rs - 1]] as const) {
    const len = Math.hypot(x1 - x0, 5);
    const g = bx(len, 0.7, 0.7, 0, 0, 0);
    g.rotateZ((x0 < bcx ? -1 : 1) * Math.atan2(5, x1 - x0));
    g.translate(((x0 + x1) / 2) * IN, (shY - 2.8) * IN, (zc - shD / 2 + 1.2) * IN);
    add(f, g);
  }

  // Legs (1 1/2 in square), the frame under the firebox, the lower shelf; the wheels and feet.
  const lx = [bx0 + 0.9, bx1 - 0.9], lz = [zB + 1.2, zF - 1.6];
  const wheelR = c.wheels === 'left' ? 3.6 : 2.6;
  for (const x of lx) for (const z of lz) {
    const left = x < bcx;
    const foot = c.wheels === 'left' ? (left ? wheelR + 1.2 : 0.5) : wheelR * 2 + 1.6;
    add(f, bx(1.5, pBot - foot, 1.5, x, foot, z));
    if (c.wheels === 'left') {
      if (left) {
        add(f, bx(0.25, wheelR + 1.4, 1.6, x - 1.1, wheelR - 0.3, z));
        wheel(add, x - 2.1, wheelR, z, wheelR, 1.6);
      } else add(m.rubber, bx(1.7, 0.5, 1.7, x, 0, z));
    } else {
      // Locking swivel casters on the left, fixed wheels on the right.
      add(f, bx(1.8, 0.3, 1.8, x, foot - 0.3, z));
      add(f, bx(0.2, wheelR + 1.2, 1.4, x - 0.85, wheelR, z));
      add(f, bx(0.2, wheelR + 1.2, 1.4, x + 0.85, wheelR, z));
      wheel(add, x, wheelR, z, wheelR, 1.3);
      if (left) add(orange(), rbx(1.6, 0.3, 1.2, x, wheelR * 2 + 0.4, z + 1.6, 0.1));
    }
  }
  for (const z of lz) add(f, bx(Bw - 1.8, 1.2, 1.2, bcx, pBot - 1.2, z));
  for (const x of lx) add(f, bx(1.2, 1.2, lz[1] - lz[0], x, pBot - 1.2, zc));
  const shelfY = c.wheels === 'left' ? 10.5 : 11.5;
  for (const z of lz) add(f, bx(Bw - 1.8, 1, 1, bcx, shelfY - 1, z));
  add(k0, bx(Bw - 2.2, 0.15, lz[1] - lz[0] - 1, bcx, shelfY, zc));
  const ls = lowerShelf();
  if (ls) add(ls, new THREE.PlaneGeometry((Bw - 2.4) * IN, (lz[1] - lz[0] - 1.2) * IN).rotateX(-Math.PI / 2).translate(bcx * IN, (shelfY + 0.16) * IN, zc * IN).toNonIndexed());

  // The propane tank on its hook at the left leg (an option), under the left shelf.
  const tx = bx0 - 7.9, tz = zc + 1;
  add(f, bx(bx0 + 0.9 - (tx + 3.6), 0.8, 0.8, (bx0 + 0.9 + tx + 3.6) / 2, 19.2, tz));
  add(f, bx(0.5, 1.6, 0.8, tx + 3.6, 18, tz));
  if (opt('tank')) propaneTank(add, m, tx, 1.6, tz);
}
