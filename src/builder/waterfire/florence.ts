import * as THREE from 'three';
import { FLORENCE_42 } from '../../siteplan/waterfire';
import { clamp01, fbm, vnoise } from '../../engine/noise';
import { mulRGB, paint, textureSet, type PBRSet, type RGB } from '../../engine/textures';
import { pbrMaterial, plainMaterial } from '../materials';
import { ringBurner } from '../fire';
import { lavaRock } from '../cazo-fire-water-bowl';
import { IN, lathe, uprightAlbedo, type WaterFireContext } from './kit';

/*
 * The Outdoor Plus Florence GFRC Fire Pit, 12 in tall (theoutdoorplus.com; spec sheet "Florence Concrete Fire Pit, low
 * profile units - no doors", 2025-01-13; FLORENCE_42): a 42 in drum, 12 in tall, of glass fiber reinforced concrete,
 * standing on a plinth set in 1 1/2 in and 1 1/2 in tall with ventilation cut-outs (drawn at the front and the right
 * side: one each quarter). A wide flat ledge runs round a 27 in opening; in it a 304 stainless pan (standard 2 in deep)
 * holds the 12 in 304 stainless burner under natural lava rock (included), 65,000 BTU. The key valve is on the side,
 * drawn at the front. The edges are eased a little, as in the maker's photos. Finish: smooth GFRC in Chocolate (-CHC),
 * its tone read from the maker's photo of the 42 in Florence in Chocolate (68, 58, 52), taken a little warmer: the
 * sky's fill cools an upright face. The maker gives no flame height: drawn about
 * 14 in over the rock, as its photos show. Base at y = 0.
 */

const S = FLORENCE_42;
const R = S.d / 2, RO = S.opening / 2, RP = R - S.plinthIn;
/** The pan's flange (inches up) and floor, the lava rock's base. */
const PAN_TOP = S.h - 1.25, PAN_FLOOR = PAN_TOP - S.pan, ROCK_Y = PAN_FLOOR + 0.7;

/** Smooth GFRC in Chocolate: an even dark brown with soft clouding, a fine sand grain and sparse pinholes. */
const CHOCOLATE_MEAN: RGB = uprightAlbedo([70, 58, 46]);
function gfrcChocolate(): PBRSet {
  return textureSet('wf-florence-chocolate', () =>
    paint(512, 0.8, 0.5, (u, v) => {
      const cloud = fbm(u, v, 3, 4, 701), mottle = fbm(u + 0.3, v, 9, 3, 703);
      const grain = vnoise(u * 320, v * 320, 320, 707);
      const pin = vnoise(u * 230, v * 230, 230, 709) > 0.972 ? 1 : 0;
      let c: RGB = mulRGB([0.27, 0.225, 0.19], 0.92 + clamp01(cloud) * 0.12 + (mottle - 0.5) * 0.05 + grain * 0.04);
      if (pin) c = mulRGB(c, 0.75);
      return { h: grain * 0.45 - pin * 0.6, c, r: 0.7 + grain * 0.08 };
    }, CHOCOLATE_MEAN),
  );
}

export function florenceFirePit(c: WaterFireContext) {
  const { sink, f } = c;
  const gfrc = pbrMaterial('wf-florence-chocolate', gfrcChocolate());
  // The plinth, the body's underside, the eased wall and ledge, and the opening's wall down to the pan (inches).
  const body: [number, number][] = [
    [0, 0], [RP - 0.2, 0], [RP, 0.15], [RP, S.plinthH], [RP, S.plinthH], [R - 0.2, S.plinthH], [R, S.plinthH + 0.2],
    [R, S.h - 0.25], [R - 0.07, S.h - 0.07], [R - 0.25, S.h], [RO + 0.25, S.h], [RO + 0.07, S.h - 0.07], [RO, S.h - 0.25], [RO, PAN_TOP - 0.1],
  ];
  sink.add(gfrc, lathe(body, 0.8, 120).rotateY(Math.PI));

  // The stainless pan (darkened by the fire): its flange on the ledge of the opening, 2 in deep, under the rock.
  const steel = plainMaterial('wf-florence-pan', { color: '#8d8f90', roughness: 0.42, metalness: 0.85 });
  const panSteel = plainMaterial('wf-florence-pan-used', { color: '#4d4b48', roughness: 0.6, metalness: 0.7 });
  const pan: [number, number][] = [[RO + 0.02, PAN_TOP], [RO - 0.9, PAN_TOP], [RO - 1.0, PAN_TOP - 0.1], [RO - 1.0, PAN_FLOOR], [RO - 1.0, PAN_FLOOR], [0, PAN_FLOOR]];
  sink.add(panSteel, lathe(pan, 0.8, 96));

  // Natural lava rock heaped over the burner, to the pan's rim.
  // The Outdoor Plus's photos show it black: the Cazo's rock, darker.
  sink.add(plainMaterial('wf-florence-lava', { color: '#7a7a7a', roughness: 0.97, vertexColors: true }), lavaRock((RO - 0.4) * IN, ROCK_Y * IN, `${f.id}-lava`));

  // Ventilation cut-outs in the plinth, a quarter round apart (dark: the hollow under the body).
  const vent = plainMaterial('wf-florence-vent', { color: '#0b0a09', roughness: 1, side: THREE.DoubleSide });
  for (let q = 0; q < 4; q++) {
    const a = (q * Math.PI) / 2;
    const g = new THREE.CircleGeometry(1.4 * IN, 14, 0, Math.PI).rotateY(a).translate(Math.sin(a) * (RP + 0.03) * IN, 0.002, Math.cos(a) * (RP + 0.03) * IN);
    sink.add(vent, g);
  }
  // The key valve on the front face: a stainless escutcheon with the square key socket.
  const kz = (R + 0.03) * IN, ky = 6.8 * IN;
  sink.add(steel, new THREE.CircleGeometry(0.85 * IN, 20).translate(0, ky, kz));
  sink.add(plainMaterial('wf-florence-socket', { color: '#141414', roughness: 0.6, metalness: 0.4 }), new THREE.PlaneGeometry(0.42 * IN, 0.42 * IN).rotateZ(Math.PI / 4).translate(0, ky, kz + 0.0008));

  // The fire: the 12 in ring under the rock, its flames about 14 in tall, and its flickering light.
  const rockTop = ROCK_Y + 1.4;
  c.fire(ringBurner((S.burner / 2) * IN, rockTop * IN, 0.36, f.id));
  c.fireLight(0, (S.h + 6) * IN, 0, '#ff9a4a', 6, 7);
}
