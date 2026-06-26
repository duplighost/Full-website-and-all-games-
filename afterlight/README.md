# Afterlight Atlas

A self-contained Three.js browser game built for Qualiacology: endless procedural 3D exploration/combat with luminous city districts, warm houses, forests, deserts/oases, snow ranges, mountain vistas, rail-line movement, enemies, pickups, upgrade choices, and realization cards.

## Run locally

Because this uses ES modules, run it from a local web server instead of opening `index.html` directly:

```bash
cd afterlight-atlas
python3 -m http.server 8765
```

Then open:

```text
http://localhost:8765/
```

## Controls

Desktop: WASD move, mouse look, left click shoot, right click slash, Q dash, Space jump/glide, Shift sprint, E interact, F surge, P/Esc pause.

Mobile: the left thumb moves (a floating stick spawns wherever you press in the left half). The right thumb drags anywhere to look and taps to fire. Auto‑aim (toggle chip, top‑right) fires at whatever you point at, so the right‑hand action buttons — jump, dash, slash, and the separated surge ultimate — stay easy to hit without firing by accident. The interact button only appears when something is nearby.

Combat feedback: enemies flash white and show a health bar when hit, floating damage numbers pop on every hit (gold = critical from slash/surge), kills trigger a hit‑stop and combo flash, and incoming damage shows a directional red arc plus a low‑health heartbeat vignette.

Destructibles: crystals, small rocks, and glowing lumen pods can be shot, slashed, dashed‑through, or caught in a surge — they shatter into awe, energy, and the occasional heart.

## Deploy

The folder is static. Drop `afterlight-atlas/` into the site root and link to `/afterlight-atlas/`. The included site zip already does this.
