// GS: the game state that several parts of the game change (ADR-0003: an imported binding cannot be reassigned, so a value
// that modules share lives on one object). legacy.js fills it where the old `let` stood; a module that needs a value reads
// and writes GS.name. Values used by one part only stay that part's own variables.
export const GS: any = {};
