"""Growth Studio wordmark: outlined SVGs (no fonts needed), built from Arimo (= Liberation Sans, the brand body font).

Lockup rules (the "repeatable" part, every file obeys them):
- "Green Lion" in Arimo Bold sets the size: cap height = 1 unit (C).
- "GROWTH STUDIO" in Arimo Bold caps, letter spacing 0.24 em, sized so it is exactly as wide as "Green Lion" (cap height about 0.5 C).
- A Leaf green rule (#7DC00F), 0.09 C thick, as wide as the words, sits between them with 0.30 C of space each side.
- Horizontal: the rule turns vertical (0.09 C wide, 1.0 C tall), 0.42 C from each word; GROWTH STUDIO at the same size, letter spacing 0.2 em, centred on the cap height.
- Clear space: 8 % of the lockup width on every side (brand rule).
"""
import sys, json
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

FONT = 'fonts/Arimo-Bold.ttf'
tt = TTFont(FONT); gs = tt.getGlyphSet(); upm = tt['head'].unitsPerEm
CAP = tt['OS/2'].sCapHeight
blob = hb.Blob.from_file_path(FONT); face = hb.Face(blob); hbfont = hb.Font(face)

def shape(text, track=0.0):
    """Glyphs and pen x positions in font units; track = extra space after each glyph (font units)."""
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(hbfont, buf, {'kern': True, 'liga': False})
    x = 0; out = []
    order = tt.getGlyphOrder()
    for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        out.append((order[info.codepoint], x + pos.x_offset))
        x += pos.x_advance + (track if i < len(buf.glyph_infos) - 1 else 0)
    return out

def ink_bounds(glyphs):
    """Left and right ink edges of a shaped run (font units)."""
    lo, hi = 1e9, -1e9
    for name, x in glyphs:
        bp = BoundsPen(gs); gs[name].draw(bp)
        if bp.bounds:
            lo = min(lo, x + bp.bounds[0]); hi = max(hi, x + bp.bounds[2])
    return lo, hi

def run_path(glyphs, scale, ox, baseline):
    """SVG path data for a run: font units * scale, ink left edge at ox, baseline at y."""
    lo, _ = ink_bounds(glyphs)
    pen = SVGPathPen(gs, ntos=lambda v: ('%.2f' % v).rstrip('0').rstrip('.'))
    for name, x in glyphs:
        tp = TransformPen(pen, (scale, 0, 0, -scale, ox + (x - lo) * scale, baseline))
        gs[name].draw(tp)
    return pen.getCommands()

def fit_track(text, width_units, scale_ratio):
    """Tracking (in the small run's own font units) that makes its ink width equal width_units / scale_ratio."""
    target = width_units / scale_ratio
    a, b = 0.0, 2000.0
    for _ in range(60):
        m = (a + b) / 2; lo, hi = ink_bounds(shape(text, m))
        if hi - lo < target: a = m
        else: b = m
    return (a + b) / 2

C = 100.0                      # cap height of "Green Lion" in SVG units
S_BIG = C / CAP
RULE = 0.09 * C
TRACK = 0.24 * upm             # GROWTH STUDIO letter spacing: 0.24 em, the brand's tracked-caps look

top = shape('Green Lion'); tlo, thi = ink_bounds(top); W = (thi - tlo) * S_BIG
# GROWTH STUDIO's size is whatever makes it, at that spacing, exactly as wide as "Green Lion".
_lo, _hi = ink_bounds(shape('GROWTH STUDIO', TRACK))
S_SMALL = W / (_hi - _lo)
SMALL = S_SMALL / S_BIG        # its cap height, in C
trk = TRACK
bot = shape('GROWTH STUDIO', trk)

# descender of "Green Lion" (none: no descending letters), so the top word's ink bottom is its baseline.
def stacked():
    pad = 0.08 * W
    y_top_base = pad + C
    y_rule = y_top_base + 0.30 * C
    y_bot_base = y_rule + RULE + 0.30 * C + SMALL * C
    h = y_bot_base + pad
    parts = {
        'word': run_path(top, S_BIG, pad, y_top_base),
        'rule': f'M{pad:.2f} {y_rule:.2f}h{W:.2f}v{RULE:.2f}h{-W:.2f}z',
        'sub': run_path(bot, S_SMALL, pad, y_bot_base),
    }
    return parts, W + 2 * pad, h

def horizontal():
    # GROWTH STUDIO keeps its stacked tracking ratio but is set on one line, so it is no longer width-matched.
    g = 0.42 * C
    sub = shape('GROWTH STUDIO', 0.2 * upm)
    slo, shi = ink_bounds(sub); SW = (shi - slo) * S_SMALL
    inner = W + g + RULE + g + SW
    pad = 0.08 * inner
    base = pad + C
    x_rule = pad + W + g
    parts = {
        'word': run_path(top, S_BIG, pad, base),
        'rule': f'M{x_rule:.2f} {pad:.2f}h{RULE:.2f}v{C:.2f}h{-RULE:.2f}z',
        'sub': run_path(sub, S_SMALL, x_rule + RULE + g, pad + C / 2 + SMALL * C / 2),
    }
    return parts, inner + 2 * pad, C + 2 * pad

SCHEMES = {
    'on-charcoal': {'bg': '#202321', 'word': '#F5F2EA', 'rule': '#7DC00F', 'sub': '#B6AEA1'},
    'on-warm-white': {'bg': '#F5F2EA', 'word': '#202321', 'rule': '#7DC00F', 'sub': '#5A625C'},
    'one-color-charcoal': {'bg': None, 'word': '#202321', 'rule': '#202321', 'sub': '#202321'},
    'one-color-white': {'bg': None, 'word': '#FFFFFF', 'rule': '#FFFFFF', 'sub': '#FFFFFF'},
}

def svg(parts, w, h, sch, title):
    bg = f'<rect width="{w:.2f}" height="{h:.2f}" fill="{sch["bg"]}"/>' if sch['bg'] else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" role="img" aria-label="Green Lion Growth Studio">'
            f'<title>{title}</title>{bg}'
            f'<path fill="{sch["word"]}" d="{parts["word"]}"/>'
            f'<path fill="{sch["rule"]}" d="{parts["rule"]}"/>'
            f'<path fill="{sch["sub"]}" d="{parts["sub"]}"/></svg>\n')

out = sys.argv[1]
import os; os.makedirs(out, exist_ok=True)
info = {}
for lock, fn in (('stacked', stacked), ('horizontal', horizontal)):
    parts, w, h = fn()
    info[lock] = [round(w, 1), round(h, 1)]
    for k, sch in SCHEMES.items():
        open(f'{out}/growth-studio-wordmark-{lock}-{k}.svg', 'w').write(svg(parts, w, h, sch, 'Green Lion Growth Studio'))
print(json.dumps({'sizes': info, 'small_cap_in_C': round(SMALL, 3)}))
