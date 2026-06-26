# Qualiacology — website + games

This repository holds the Qualiacology static website and its games. It was previously a
set of upload zips; those have been extracted into one folder per deployable so changes
are reviewable as normal diffs.

## Layout

`site/` is the deployable — its whole contents are what you publish to Netlify. It now
contains every public game, including the two newest:

| Path | What it is |
| --- | --- |
| `site/` | The qualiacology.com static site: homepage (`index.html`), the book, and the games below. Netlify-style `_redirects` / `_headers` / `sitemap.xml` live at its root. **Publish this folder's contents.** |
| `site/no-moon/`, `site/rocket-shoes/`, `site/marrow/` | Featured games, linked from the homepage. |
| `site/afterlight/` | **Afterlight Atlas** — endless Three.js 3D explorer/combat. Linked from the homepage and routed (`/afterlight/`). |
| `site/neon-breach/` | **Neon Breach** — Three.js FPS (Quake-style movement, grind-rails, game-feel). Linked from the homepage and routed (`/neon-breach/`). |
| `site/glide/`, `site/luma/`, `site/dispensary/`, `site/banana/` | The smaller toys, linked from the homepage. |
| `neon-daggers/` (repo root, **outside `site/`**) | **Neon Daggers** — parked/frozen idea bank (minified bundle, no source). Intentionally **not** part of the site. See its README. |

To add a game to the site: drop its folder under `site/`, add a card on the homepage, and
add a `/folder/` route to `site/_redirects` + a `<loc>` to `site/sitemap.xml` (that is
exactly how Afterlight and Neon Breach were wired in).

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
cd site            # serves the whole site incl. /afterlight/ and /neon-breach/
python3 -m http.server 8765
# then open http://localhost:8765/   (neon-daggers/ is separate: cd neon-daggers)
```

## Debug handles

The games' debug/cheat globals (`window.oneRoomDebug`, `window.__MARROW`,
`window.__ATLAS`, `window.__game`) are opt-in: append `?debug` to the URL to expose them.
They are not present on a normal public load.
