import * as THREE from 'three';

/**
 * Things in the yard a person can use by hand in the 3D view: a sauna door that swings, a grill lid that lifts,
 * cabinet doors, a fire, a water wall's water, a light. Features register them while they are built
 * (builder/features.ts); the studio finds the one the view (or a click) is on and switches it, animated, without a
 * rebuild. The Hand quick tool, the controller's View button and the G key use them (app/quicktools.ts).
 */
export interface FeatureAction {
  /** The plan item (feature id) it belongs to. */
  itemId: string;
  /** Stable within the item: 'door', 'lights', 'lid', 'doors', 'fire', 'water', 'light'. */
  key: string;
  /** What it is, for the chip: 'Sauna door', 'Grill lid', 'Fire'. */
  label: string;
  /** The state words: [on, off], e.g. ['Open', 'Closed'] or ['On', 'Off']. */
  words: [string, string];
  /** Points on the thing (they move with it): the action nearest the aim point on a feature is the one used. */
  anchors: THREE.Object3D[];
  on: boolean;
  /** The state the plan asked for when it was built (a catalog option's value or the default). */
  planOn: boolean;
  /** The catalog option it mirrors on the placement (`FeaturePlacement.options`), if any. */
  option?: string;
  /** Several options at once when one switch is not enough (louvers: open, closed, or neither): what to store now. */
  values?(): Record<string, boolean>;
  /** Switch it; animated unless `instant`. */
  set(on: boolean, instant?: boolean): void;
  /** Advance an animation by dt seconds; true while it is still moving. */
  tick?(dt: number): boolean;
  /** Something that moves on its own while on (a spa's bubbles and steam): called every frame while on. */
  frame?(dt: number): void;
  /** Its night lights changed (the studio reassigns its light pool). */
  lights?: boolean;
}

/** An empty marker at a local point of `parent`, used as an action's anchor. */
export function anchorAt(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
  const a = new THREE.Object3D();
  a.position.set(x, y, z);
  parent.add(a);
  return a;
}

const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * A hinged part: `group` turns about its own origin on `axis` from 0 (closed) to `openAngle` (radians), eased over
 * `seconds`. Returns the set/tick pair of an action.
 */
export function swing(group: THREE.Object3D, axis: 'x' | 'y' | 'z', openAngle: number, on: boolean, seconds = 0.9): Pick<FeatureAction, 'set' | 'tick'> {
  let t = on ? 1 : 0, target = t;
  const apply = () => (group.rotation[axis] = openAngle * ease(t));
  apply();
  return {
    set(next, instant) {
      target = next ? 1 : 0;
      if (instant) {
        t = target;
        apply();
      }
    },
    tick(dt) {
      if (t === target) return false;
      const step = dt / seconds;
      t = target > t ? Math.min(target, t + step) : Math.max(target, t - step);
      apply();
      return true;
    },
  };
}

/** Several swings driven as one action (a pair of cabinet doors and a fridge door). */
export function swings(list: Pick<FeatureAction, 'set' | 'tick'>[]): Pick<FeatureAction, 'set' | 'tick'> {
  return {
    set: (on, instant) => list.forEach((s) => s.set(on, instant)),
    tick: (dt) => list.map((s) => s.tick?.(dt) ?? false).some(Boolean),
  };
}
