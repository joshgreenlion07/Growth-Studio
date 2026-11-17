/**
 * Which catalog items Green Lion has approved for its plans, as overrides on top of the catalog's defaults (see
 * `isApproved` in catalog.ts). Approvals are made in the Library and saved by Area Planner for the whole team, which
 * sends them back here with an `approvals` message; without one, the defaults apply.
 *
 * Keys:
 *   line:<maker>|<line>   every color of a maker's line, with its borders and paver edge
 *   mat:<id>              one look without a maker (lawn, mulch, concrete, and the generic testers)
 *   plant:<id>            a catalog plant
 *   feature:<id>          a catalog feature (pergolas, kitchens, fire, water, ...)
 *   structure:cover       Area Planner's attached roof; structure:calroom its California room
 */
export interface Approvals {
  /** Keys turned on that are off by default. */
  on: string[];
  /** Keys turned off (a removed tester is one of these). */
  off: string[];
}

let on = new Set<string>();
let off = new Set<string>();
const listeners = new Set<() => void>();

/** Replace the overrides; `null` goes back to the catalog's defaults. Unknown or malformed keys are ignored. */
export function setApprovals(a: Partial<Approvals> | null) {
  const clean = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string' && k.length < 200 && /^(line|mat|plant|feature|structure):/.test(k)) : []);
  on = new Set(clean(a?.on));
  off = new Set(clean(a?.off));
  for (const k of on) off.delete(k);
  for (const fn of listeners) fn();
}

/** The current overrides, to send or save. */
export function getApprovals(): Approvals {
  return { on: [...on], off: [...off] };
}

/** The override for a key: true or false when set, undefined when the default applies. */
export function approvalOverride(key: string): boolean | undefined {
  return on.has(key) ? true : off.has(key) ? false : undefined;
}

/** Call `fn` whenever the overrides change. */
export function onApprovalsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
