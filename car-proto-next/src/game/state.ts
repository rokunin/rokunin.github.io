// GS: the game state that several parts of the game change (ADR-0003: an imported binding cannot be reassigned, so a value
// that modules share lives on one object). legacy.js fills it where the old `let` stood; a module that needs a value reads
// and writes GS.name. Values used by one part only stay that part's own variables.
export const GS: any = {};

// expose(GAME, { car: () => car, ... }): getters, so a module reads the current value when it runs, not when it is created.
export function expose(target: any, getters: Record<string, () => any>) {
  for (const k in getters) Object.defineProperty(target, k, { get: getters[k], enumerable: true, configurable: true });
  return target;
}
