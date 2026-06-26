# Neon Daggers // 1987 — PARKED (frozen)

A self-contained 3D twin-stick arena-survival shooter (three.js, neon/CRT aesthetic):
WASD move, mouse aim, hold for rapid daggers / tap for burst, RMB heavy, Shift dash,
Space hop, Q bomb. Collect red gems to level your daggers, fight a `LEVIATHAN` boss,
chase score / combo / overdrive, survive.

## Status: parked / reference only

This folder is **intentionally kept but frozen**. It is *not* dead code to delete — but
it is also *not* meaningfully maintainable:

- The only game code shipped is a **minified Vite bundle** (`assets/index-atXvy7ej.js`,
  ~570 KB) with **no source and no sourcemap**. All gameplay (physics, spawning, weapons,
  boss, scoring) is behind mangled identifiers. There is no `package.json` / `vite.config`
  / `src/` for it anywhere in the repo.
- Only the HTML/CSS and the thin hand-written overlay (`assets/neon-polish.js` /
  `neon-polish.css`) are editable. Any real gameplay change requires recovering the
  original Vite/three.js project first.
- It is **not linked or routed from the main site** — it runs only by opening this folder
  directly.

So treat it as a playable demo and an **idea bank**, not a target for feature work.
`assets/neon-polish.js` is actually a clean reference for: a restart-invulnerability +
spawn buffer, a frame-time-averaged adaptive DPR/quality throttle, and a full procedural
virtual twin-stick for touch — patterns worth reimplementing in the editable games
(e.g. Rocket Shoes), not copied out of the minified bundle.

## Known limitation

Boot pulls Orbitron / Share Tech Mono from Google Fonts with no offline fallback, so the
retro typography degrades to system fonts when the font CDN is blocked. Self-host the two
fonts under `assets/` if it is ever promoted to a deployed page. (Left as-is while parked.)

## If you want to revive it

1. Recover the original Vite/three.js source from the author's machine.
2. Then either treat that as canon, or mine the mechanics into one of the editable games.
