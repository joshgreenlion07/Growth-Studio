import { featureSize } from '../../siteplan/decor';
import { box, IN, swapUV, yardMat, type YardContext } from './kit';

/*
 * A plain cedar slat screen for an A/C unit (the plan's "screen for A/C"; material and height not given): clear
 * cedar 1x4 slats (3 1/2 x 3/4 in) laid level with 1/2 in gaps on the front of two 4x4 posts, under a flat 1x4 cap,
 * 4 ft tall. Local x along it, +z the face away from the unit, base at y = 0.
 */
export function slatScreen(c: YardContext) {
  const [Lm, , Hm] = featureSize(c.spec, c.f.size, 48 * IN);
  const L = Lm / IN, H = Hm / IN;
  const i = (x: number) => x * IN;
  const cedar = yardMat.cedar();
  const post = 3.5;
  for (const sx of [-1, 1]) c.add(cedar, swapUV(box(i(post), i(H - 0.75), i(post), sx * i(L / 2 - post / 2), 0, -i(0.375))));
  const slat = 3.5, gap = 0.5;
  for (let y = 2; y + slat <= H - 0.9; y += slat + gap) c.add(cedar, box(i(L), i(slat), i(0.75), 0, i(y), i(post / 2)));
  c.add(cedar, box(i(L + 0.75), i(0.75), i(post + 1.25), 0, i(H - 0.75), i(0.1)));
}
