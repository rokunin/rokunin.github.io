// ---------- obstacles ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.

export function createObstacles(GAME) {
  // solid: pillars (indestructible). crates: destructible targets.
  const obstacles = [];  // {mesh, hx, hz, h, solid, crate, hp, carried}
  const active = o => o.mesh.visible && !o.carried && !o.disabled;

  return { obstacles, active };
}
