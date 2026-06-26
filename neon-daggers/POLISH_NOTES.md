# Neon Daggers — polish pass

## Intuition / first-run clarity
- Shortened title-screen controls and hint copy.
- Added Space/Enter start from title.
- Added touch controls on coarse-pointer devices with icon-only stick/action buttons.
- Added a brief invulnerability buffer on restart so runs do not begin with cheap contact deaths.

## Smoothness / performance
- Lowered hidden pixel-ratio caps and added adaptive DPR trimming when frame time rises.
- Tuned CRT grain/scanline/aberration and bloom strength to keep the look but reduce render load.
- Removed repeated Vector3 allocation from dagger spread basis calculation.
- Smoothed director spawn/wave ceilings so late-game pressure ramps with fewer frame spikes.

## Feel / polish
- Daggers feel stronger immediately: slightly faster, tighter, more pellets, and light early homing.
- Level thresholds arrive sooner, so red gems communicate progression faster.
- Dash is snappier with a shorter cooldown and slightly longer invulnerability.
- Gem magnet radius/collection radius increased so rewards read as intentional instead of slippery.
