# Balance model

`sim.py` plays scripted fights without the game: one car, one gear tier, waves of monsters, no rendering.
`python3 sim.py` runs the grid (1152 fights, about 4 minutes on two cores) into `results.json`; `python3 report.py` prints the tables (last run: `TABLES.txt`).
`FACTS.md` lists every number the model uses, with the line in `index.html` it came from (build 133).

Tiers: T0 is the start (main gun, jump). T1/T2/T3: all three pedestal guns at Lv1/2/3, the ride's kit skills at Lv1/2/3, jump upgrades 1/2/3.
Scenarios: `roll` (ROLL OUT waves), `mid` (scout plans 4-7 with a mini-boss each wave), `hell` (random hell waves: ~62 of one kind, ~20 heavy or ranged, 4 minis for three waves), all for 75 s with the phase's cadence and alive cap; `minis` (four mini-bosses and a wandering boss); `boss` (damage a second to the Pyramidon while circling it at 9 m).
Policies: `kite` circles at 16 m/s (runs over what cuts in), `hold` circles at 6 m/s (guns only), `hold-ng` the same with the main gun silent (the kit alone).
The car jumps when three or more monsters are within 10 m; RMB skills go off on cooldown; the spider goes under for 1.2 s every 6 s.

Left out: obstacles and crates, evil cubes, mob shots other than spitter/oculon acid, mini-boss attack patterns, turret turn speed and aiming error, players' mixed levels, co-op.
The damage-taken numbers count bites and acid only: compare them between rides, do not read them as real hp loss.
