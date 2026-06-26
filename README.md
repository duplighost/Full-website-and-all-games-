# Qualiacology — website + games

This repository holds the Qualiacology static website and its games. It was previously a
set of upload zips; those have been extracted into one folder per deployable so changes
are reviewable as normal diffs.

## Layout

| Folder | What it is | Deploy |
| --- | --- | --- |
| `site/` | The qualiacology.com static site: homepage, the book, and the games **No Moon**, **Rocket Shoes**, **Marrow**, **Glide**, **LUMA**, **The Dispensary**, **Banana**. Netlify-style `_redirects` / `_headers` / `sitemap.xml` live here. | Publish dir = `site/` |
| `afterlight/` | **Afterlight Atlas** — standalone Three.js endless 3D explorer/combat game. | Static; serve the folder |
| `neon-breach/` | **Neon Breach** — standalone Three.js FPS (Quake-style movement, grind-rails, game-feel focus). Editable modular source. | Static; serve the folder |
| `neon-daggers/` | **Neon Daggers** — standalone 3D twin-stick survivor. **Parked / frozen** (minified bundle, no source). See its README. | Not linked; reference only |

`afterlight/`, `neon-breach/`, and `neon-daggers/` are standalone and **not yet linked**
from `site/`. Wire up a nav link + a route in `site/_redirects` when you want any of them
public.

## Names overlap on purpose

Rocket Shoes is a modular port of No Moon (both descend from a prototype called *Boon
Moots*), so the **same boss names exist in both as separate code** — Warden, Archon,
Spiggot, False Moon all appear in `site/no-moon/index.html` *and*
`site/rocket-shoes/src/systems/bosses.js` as distinct implementations. Enemy ids, item
names, and biome names are likewise parallel between the two. When editing, always confirm
*which* game/file a name belongs to before changing it — a fix in one does not apply to the
other. `neon-daggers` and `neon-breach` are unrelated games that merely share the "Neon"
prefix.

## Running a game locally

The games use ES modules, so serve over HTTP rather than opening `index.html` from disk:

```bash
cd site            # or afterlight / neon-breach / neon-daggers
python3 -m http.server 8765
# then open http://localhost:8765/
```

## Debug handles

The games' debug/cheat globals (`window.oneRoomDebug`, `window.__MARROW`,
`window.__ATLAS`, `window.__game`) are opt-in: append `?debug` to the URL to expose them.
They are not present on a normal public load.
