# Growth Studio wordmark

Text-only wordmark for Green Lion Growth Studio. The letters are outlined Arimo Bold (= Liberation Sans Bold, the brand body font), so the files look the same everywhere with no font installed.

## Lockup rules
- "Green Lion" sets the size. Its cap height is the unit C.
- "GROWTH STUDIO" is set in Arimo Bold capitals with 0.24 em letter spacing, sized to exactly the width of "Green Lion" (cap height about 0.45 C).
- A Leaf green rule (#7DC00F), 0.09 C thick, spans the full width, with 0.30 C of space above and below.
- Horizontal: the rule turns vertical (0.09 C x 1.0 C), with 0.42 C of space on each side. GROWTH STUDIO keeps the same size, with 0.2 em spacing, centred on the cap height.
- Clear space: 8 % of the lockup width on every side. The files include it.
- The wordmark goes on Charcoal (#202321) or Warm white (#F5F2EA), never over photos.
- Below about 40 px tall, use the stacked version.

## Files
`growth-studio-wordmark-{stacked|horizontal}-{on-charcoal|on-warm-white|one-color-charcoal|one-color-white}.svg`

| Version | Background | Green Lion | Rule | GROWTH STUDIO |
|---|---|---|---|---|
| on-charcoal | #202321 | #F5F2EA | #7DC00F | #B6AEA1 |
| on-warm-white | #F5F2EA | #202321 | #7DC00F | #5A625C |
| one-color-charcoal, one-color-white | transparent | one color | one color | one color |

`make-wordmark.py` rebuilds the files. It needs fontTools, uharfbuzz and Arimo from Google Fonts (`ofl/arimo`, instanced at weight 700).
