# Afterlight Atlas — polish pass

## Intuition / first-run clarity
- Added a deliberate starter garden directly in the player's opening sightline: glowing pod, breakable crystals, a sanctuary house, and a visible rail.
- Added short in-run starter hints instead of the long abstract toast.
- Crosshair now gives silent semantic feedback: red for enemies, cyan for breakables, gold for interactables.
- Breakable pods/crystals now subtly pulse/rotate and react when hit.
- Added gentle projectile aim assist for enemies and breakables already under the reticle.
- Added a short enemy-spawn grace window when a run begins.

## Smoothness / performance
- Reworked chunk loading into a distance-sorted build queue with a per-frame time budget instead of synchronous neighborhood construction during gameplay.
- Reduced shadow-caster count and point-light cost while preserving the neon/warm look.
- Cached biome colors and particle colors to avoid hot-loop allocations.
- Reused projectile, pickup, enemy, and health-bar geometry/materials.
- Tuned DPR/bloom/shadow-map caps to reduce stutter without flattening the style.
- Reduced common per-frame Vector3 allocations in movement, combat, pickups, rails, projectiles, and enemies.

## Feel / polish
- Starter loop is now clearer: follow glow -> break crystals -> enter warmth -> keep moving.
- Pickups, breakables, hit feedback, and reticle response are stronger and easier to read.
- Restart warmup no longer tries to synchronously rebuild the entire nearby world.
