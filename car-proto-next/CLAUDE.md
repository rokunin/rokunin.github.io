# CHUBZ (car-proto-next)

Before any work on the game read `dev/HANDOFF.md` (what stands, commands, traps), `dev/RULES.md` (how to work, Roman's words), `GLOSSARY.md` (the game's words) and the decisions in `docs/adr/` (do not re-litigate an accepted one without a new reason; record a new hard-to-reverse decision there, format in ADR-0001). The plan for the architecture work is `docs/ROADMAP.md`.
The game in the works is the single file `car-proto-next/index.html`, live at https://rokunin.github.io/car-proto-next/. The published game at https://rokunin.github.io/car-proto/ (`../car-proto/`, build 134) is frozen until the roadmap is done (Roman, 25.11.2026): do not touch it unless Roman asks for an urgent fix there. The claude.ai artifact also stays on build 134. Tests: `cd dev && python3 run.py`.
At the end of a session rewrite `dev/HANDOFF.md` to the new state.
