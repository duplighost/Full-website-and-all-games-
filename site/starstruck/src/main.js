import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const TAU = Math.PI * 2;
const WHITE = new THREE.Color(0xffffff);
const HIT_RED = new THREE.Color(0xff3030);
const CHUNK = 96;
const SAVE_KEY = 'afterlight-atlas-save-v1';
const QUALITY_KEY = 'afterlight-atlas-quality-v1';
const FORCE_TOUCH = new URLSearchParams(location.search).has('touch');
const IS_TOUCH = FORCE_TOUCH || matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const loadingEl = $('loading');
const startEl = $('start');
const pauseEl = $('pause');
const upgradeEl = $('upgrade');
const deathEl = $('death');
const hudEl = $('hud');
const touchEl = $('touch');
const loadFill = $('loadFill');
const loadText = $('loadText');
const saveChip = $('saveChip');
const playBtn = $('playBtn');
const resetBtn = $('resetBtn');
const resumeBtn = $('resumeBtn');
const backToStartBtn = $('backToStartBtn');
const retryBtn = $('retryBtn');
const deathTitleBtn = $('deathTitleBtn');
const hpFill = $('hpFill');
const hpText = $('hpText');
const energyFill = $('energyFill');
const energyText = $('energyText');
const biomeReadout = $('biomeReadout');
const statsEl = $('stats');
const compassEl = $('compass');
const minimapEl = $('minimap');
const promptEl = $('prompt');
const toastEl = $('toast');
const realizationLog = $('realizationLog');
const damageVignette = $('damageVignette');
const crosshairEl = $('crosshair');
const hpGhost = $('hpGhost');
const comboFlash = $('comboFlash');
const dmgLayer = $('dmgLayer');
const dirDmg = $('dirDmg');
const lowHpVignette = $('lowHpVignette');
const healthMeterEl = document.querySelector('.meter.health');
const autofireChip = $('autofireChip');
const touchInteractBtn = $('touchInteract');
const touchInteractLabel = $('touchInteractLabel');
const pauseStats = $('pauseStats');
const deathStats = $('deathStats');
const upgradeTitle = $('upgradeTitle');
const upgradeText = $('upgradeText');
const upgradeCards = $('upgradeCards');
const webglError = $('webglError');

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function invLerp(a, b, v) { return clamp((v - a) / (b - a), 0, 1); }
function smoother(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function randRange(a, b) { return a + Math.random() * (b - a); }
function choice(arr) { return arr[(Math.random() * arr.length) | 0]; }
function hash2(ix, iz) {
  let h = ix * 374761393 + iz * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}
function seeded(cx, cz, salt = 0) {
  let a = ((cx * 73856093) ^ (cz * 19349663) ^ (salt * 83492791)) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const ux = smoother(fx), uz = smoother(fz);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
function fbm(x, z, oct = 4) {
  let value = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    value += (noise2(x * freq, z * freq) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return value / norm;
}
function worldChunk(x, z) { return [Math.floor((x + CHUNK / 2) / CHUNK), Math.floor((z + CHUNK / 2) / CHUNK)]; }
function formatMeters(v) { return `${Math.max(0, Math.round(v))}m`; }
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function setScreen(which) {
  for (const el of [loadingEl, startEl, pauseEl, upgradeEl, deathEl, webglError]) hide(el);
  if (which) show(which);
}
function requestPointerLockSafe() {
  if (IS_TOUCH || document.pointerLockElement === canvas) return;
  try {
    const request = canvas.requestPointerLock?.();
    request?.catch?.(() => {});
  } catch (_) {}
}
function keyName(x, z, type, i = 0) { const [cx, cz] = worldChunk(x, z); return `${type}:${cx},${cz}:${i}`; }

const BIOMES = {
  meadow: {
    label: 'hearth meadow', fog: 0x191538, sky: 0x141235, ground: [0x2e3a72, 0x6a52b8, 0xffd07a],
    accent: 0xffd36e, water: 0x6df6ff, enemy: ['mote', 'mote', 'wisp', 'sentinel', 'spore']
  },
  city: {
    label: 'luminous city', fog: 0x0e0c30, sky: 0x0c0a28, ground: [0x21213b, 0x2f4a82, 0x8a5cff],
    accent: 0x62f7ff, water: 0x37d3ff, enemy: ['sentinel', 'sentinel', 'mote', 'duelist', 'orbiter']
  },
  desert: {
    label: 'desert of soft knives', fog: 0x2a1a1e, sky: 0x1c1024, ground: [0x8b5440, 0xe0a85d, 0xffe09a],
    accent: 0xffd36e, water: 0x3fe8d4, enemy: ['mote', 'brute', 'duelist', 'lancer']
  },
  snow: {
    label: 'nostalgic snow range', fog: 0x1a2848, sky: 0x0c1436, ground: [0x6f9bd0, 0xd7e8ff, 0xffffff],
    accent: 0xbbe9ff, water: 0x8edcff, enemy: ['sentinel', 'brute', 'mote', 'lancer', 'orbiter']
  },
  forest: {
    label: 'wild velvet forest', fog: 0x0c2138, sky: 0x0a1638, ground: [0x14305a, 0x1f8c7a, 0x6effc0],
    accent: 0x75ffb1, water: 0x5ef8ff, enemy: ['mote', 'duelist', 'wisp', 'wisp', 'spore']
  },
  coast: {
    label: 'ocean-glass coast', fog: 0x0d2548, sky: 0x0b1838, ground: [0x123a78, 0x3a86c8, 0xffd7a0],
    accent: 0x62f7ff, water: 0x62f7ff, enemy: ['sentinel', 'mote', 'wisp', 'duelist', 'orbiter']
  }
};

// Per-archetype stats in one place (was inline ternaries scattered through spawn/update).
// fly = resting hover height; flier adds a sine bob. color 'accent' = biome accent tint.
// contact = touch damage. boss = scales harder + counts as a guardian.
const ENEMY = {
  mote:     { hp: 42,  radius: 0.75, fly: 1.25, color: 0xffffff, contact: 9,  spawnY: 1.0 },
  sentinel: { hp: 62,  radius: 0.85, fly: 4.2,  color: 'accent', contact: 0,  spawnY: 4.5, flier: true },
  brute:    { hp: 80,  radius: 1.2,  fly: 0.9,  color: 0xff725d, contact: 10, spawnY: 1.0 },
  duelist:  { hp: 80,  radius: 0.75, fly: 0.9,  color: 0xff4fd8, contact: 12, spawnY: 1.4 },
  wisp:     { hp: 26,  radius: 0.55, fly: 1.8,  color: 0x9affd8, contact: 6,  spawnY: 1.8 },
  lancer:   { hp: 58,  radius: 0.82, fly: 1.05, color: 0xffa23d, contact: 15, spawnY: 1.05 },
  orbiter:  { hp: 50,  radius: 0.72, fly: 5.0,  color: 0x9f74ff, contact: 0,  spawnY: 5.0, flier: true },
  spore:    { hp: 34,  radius: 0.8,  fly: 1.4,  color: 0x75ffb1, contact: 7,  spawnY: 1.5 },
  warden:   { hp: 240, radius: 1.7,  fly: 1.15, color: 0xff3b5e, contact: 16, spawnY: 1.3, boss: true }
};

// Unique discoverable "points of interest" — named places you stumble on, Bethesda-style.
// Builders are ChunkManager.poi_<kind>; this table holds the discovery copy + behaviour flags.
const POI_DEFS = {
  starliner: { name: 'the Crashed Starliner', guarded: true,  discoverR: 22, note: 'Something fell out of the sky and kept most of its secrets. You can shelter in the hull.' },
  obelisk:   { name: 'the Obelisk Ring',     guarded: false, discoverR: 18, note: 'Six stones agreeing on a center. The altar between them still keeps its appointment with the light.' },
  ziggurat:  { name: 'the Skyreach Ziggurat', guarded: true,  discoverR: 22, note: 'A staircase pretending to be a mountain. Climb it; the view is the whole point.' },
  lantern:   { name: "the Hermit's Lantern", guarded: false, discoverR: 18, note: 'A lighthouse for a sea that left. Its keeper is gone, but the hearth is still warm.' },
  arcade:    { name: 'the Sunken Arcade',    guarded: true,  discoverR: 22, note: 'A neighborhood that drowned in dusk and kept its neon on out of spite. Rich pickings.' },
  hollow:    { name: 'the Crystal Hollow',   guarded: false, discoverR: 18, note: 'A bowl of light the ground forgot to close. Break gently; take everything.' },
  summit:    { name: 'the Summit Shrine',    guarded: false, discoverR: 16, note: 'You climbed for this. The shrine does not congratulate you, which is exactly the gift.' }
};


for (const info of Object.values(BIOMES)) {
  info._fogColor = new THREE.Color(info.fog);
  info._skyColor = new THREE.Color(info.sky);
  info._groundColors = info.ground.map(c => new THREE.Color(c));
}

const START_HINTS = [
  'Follow glow. Break crystals. Enter warmth.',
  'Red hates you. Gold helps. Blue breaks beautifully.',
  'Dash through danger. Hold jump after upgrades. Keep moving.'
];

const BREAKABLE_RETICLE = 'rgba(98,247,255,.92)';
const INTERACT_RETICLE = 'rgba(255,211,110,.96)';
const REALIZATIONS = [
  'Beauty is not a consolation prize. It is evidence the world has not finished arguing for itself.',
  'A good place does not fix you. It gives the broken animal room to stop performing its injury.',
  'Wonder is attention with its hands unshackled. It is what happens before cynicism hires a lawyer.',
  'The world is not small. You are often standing too close to the wall of your own skull.',
  'A house is a spell against cosmic homelessness. Even a fake one can remind the body what shelter means.',
  'Combat feels good when it is secretly choreography. Survival is uglier when it has no rhythm.',
  'Nostalgia hurts because it proves you were once inside a moment before you knew how rare moments were.',
  'A desert with water in it is not contradiction. It is the punchline God tells after everyone leaves the meeting.',
  'Speed is not escape when it teaches you how much world was waiting just outside your old pace.',
  'The best upgrades do not make you stronger. They make more of reality become usable.'
];

const UPGRADE_POOL = [
  { id: 'velocity', name: 'Velocity Appetite', tag: 'movement', effect: '+18% base speed and much sharper air steering.', apply: (p) => { p.upgrades.velocity++; p.walk *= 1.18; p.sprint *= 1.15; p.airControl += 0.8; } },
  { id: 'dash', name: 'Neon Lunge', tag: 'dash', effect: 'Dash farther, recharge faster, and carve a wound-line through anything you pass.', apply: (p) => { p.upgrades.dash++; p.dashPower += 5.0; p.dashCooldown = Math.max(0.42, p.dashCooldown - 0.1); p.dashDamage += 16; } },
  { id: 'glide', name: 'Snowlight Step', tag: 'air', effect: 'Glide far longer and float like a rumor. First stack grants a double jump.', apply: (p) => { p.upgrades.glide++; p.glide = true; p.doubleJump = true; p.gravity *= 0.9; } },
  { id: 'hearth', name: 'Hearth Compass', tag: 'sanctuary', effect: 'Homes heal far more, and every wonder calls out from much farther away.', apply: (p) => { p.upgrades.hearth++; p.homeHeal += 12; p.senseRange += 70; } },
  { id: 'mirror', name: 'Mirror Rounds', tag: 'combat', effect: '+10 shot damage and a big jump in the odds your kills spray new shots.', apply: (p) => { p.upgrades.mirror++; p.shotDamage += 10; p.splitChance = Math.min(0.85, p.splitChance + 0.22); } },
  { id: 'oasis', name: 'Oasis Skin', tag: 'survival', effect: '+30 max health, healed instantly, and water/homes repair you faster.', apply: (p) => { p.upgrades.oasis++; p.maxHp += 30; p.hp = Math.min(p.maxHp, p.hp + 30); p.homeHeal += 4; } },
  { id: 'magnet', name: 'City Appetite', tag: 'loot', effect: 'Awe and fragments rip toward you from across the street.', apply: (p) => { p.upgrades.magnet++; p.pickupRange += 14; p.pickupMagnet += 24; } },
  { id: 'slash', name: 'Mercy Razor', tag: 'close', effect: 'The slash hits much harder, reaches farther, and refunds more energy.', apply: (p) => { p.upgrades.slash++; p.slashDamage += 22; p.slashRange += 0.6; } },
  { id: 'surge', name: 'Weather Memory', tag: 'area', effect: 'F-surge erupts wider, hits harder, eats bullets, and freezes the room longer.', apply: (p) => { p.upgrades.surge++; p.surgeRadius += 3.2; p.surgeDamage += 22; } },
  { id: 'shield', name: 'Quiet Window', tag: 'defense', effect: 'Getting hit buys a long mercy window and dumps energy back into you.', apply: (p) => { p.upgrades.shield++; p.iframesBonus += 0.28; p.energyRevenge += 16; } },
  { id: 'rail', name: 'Lightline Spine', tag: 'flow', effect: 'Rails grab you harder and dash-kills almost always refund the dash.', apply: (p) => { p.upgrades.rail++; p.railPull += 9; p.killDashRefund = Math.min(0.95, p.killDashRefund + 0.28); } },
  { id: 'vista', name: 'Farther Eyes', tag: 'explore', effect: 'Fog retreats, landmarks burn brighter, and the atlas breathes wide open.', apply: (p) => { p.upgrades.vista++; p.viewBonus += 70; p.senseRange += 35; } },
  // ---- newer, flashier laws ----
  { id: 'chain', name: 'Arc Catechism', tag: 'lightning', effect: 'Hits fork into chain-lightning that leaps to nearby enemies.', apply: (p) => { p.upgrades.chain++; p.chain += 2; p.shotDamage += 3; } },
  { id: 'homing', name: 'Pilgrim Rounds', tag: 'tracking', effect: 'Your shots bend through the air to chase whatever you nearly aimed at.', apply: (p) => { p.upgrades.homing++; p.homing += 0.6; } },
  { id: 'slam', name: 'Gravity Sermon', tag: 'impact', effect: 'Landing from a height detonates a shockwave that flattens the ground around you.', apply: (p) => { p.upgrades.slam++; p.slam += 1; } },
  { id: 'timeDodge', name: 'Slow Light', tag: 'time', effect: 'Dashing drags the whole world into slow motion for a heartbeat. Recharge a touch faster.', apply: (p) => { p.upgrades.timeDodge++; p.timeDodge += 1; p.dashCooldown = Math.max(0.4, p.dashCooldown - 0.06); } },
  { id: 'lifesteal', name: 'Wound Tax', tag: 'vampire', effect: 'Every kill bleeds a little of its light back into your health.', apply: (p) => { p.upgrades.lifesteal++; p.lifesteal += 6; } },
  { id: 'revive', name: 'Second Verse', tag: 'mercy', effect: 'Once per run, a killing blow leaves you standing at a sliver instead of folded.', apply: (p) => { p.upgrades.revive++; p.revive += 1; } }
];

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch (_) { return false; }
}

function loadSave() {
  try {
    return Object.assign({ best: 0, runs: 0, totalAwe: 0, discoveries: 0, seen: {}, quality: null }, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'));
  } catch (_) {
    return { best: 0, runs: 0, totalAwe: 0, discoveries: 0, seen: {}, quality: null };
  }
}
function storeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {} }
let save = loadSave();

class AudioDirector {
  constructor() { this.ctx = null; this.master = null; this.pad = []; this.muted = false; this.started = false; this.lastStep = 0; }
  start() {
    if (this.started || this.muted) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = this.ctx || new AC();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.055;
    this.master.connect(this.ctx.destination);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 520; filter.Q.value = 0.35;
    filter.connect(this.master);
    for (const [freq, type, gain] of [[55, 'sine', 0.55], [82.5, 'triangle', 0.22], [110, 'sine', 0.14], [165, 'sine', 0.09]]) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.value = gain;
      osc.connect(g); g.connect(filter); osc.start();
      this.pad.push({ osc, g, filter });
    }
    this.started = true;
  }
  tone(freq = 440, dur = 0.08, color = 'sine', gain = 0.08, bend = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filt = this.ctx.createBiquadFilter();
    osc.type = color;
    osc.frequency.setValueAtTime(freq, t);
    if (bend) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * bend), t + dur);
    filt.type = 'lowpass'; filt.frequency.value = 2200;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filt); filt.connect(g); g.connect(this.master || this.ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  noise(dur = 0.15, gain = 0.08) {
    if (!this.ctx || this.muted) return;
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource(); src.buffer = buffer;
    const g = this.ctx.createGain(); g.gain.value = gain;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8;
    src.connect(f); f.connect(g); g.connect(this.master || this.ctx.destination); src.start();
  }
  shoot() { this.tone(760, 0.055, 'triangle', 0.045, 1.65); }
  slash() { this.noise(0.12, 0.06); this.tone(210, 0.11, 'sawtooth', 0.035, 0.72); }
  dash() { this.tone(180, 0.18, 'sine', 0.07, 2.1); }
  hit() { this.tone(92, 0.16, 'sawtooth', 0.06, 0.55); }
  pickup() { this.tone(560 + Math.random() * 260, 0.12, 'sine', 0.05, 1.4); }
  upgrade() { this.tone(220, 0.28, 'triangle', 0.06, 2.0); setTimeout(() => this.tone(440, 0.22, 'sine', 0.045, 1.5), 70); }
  update(biome, speed, dt) {
    if (!this.started || !this.pad.length) return;
    const info = BIOMES[biome] || BIOMES.meadow;
    const target = biome === 'city' ? 820 : biome === 'snow' ? 650 : biome === 'desert' ? 430 : biome === 'forest' ? 510 : 560;
    for (const p of this.pad) p.filter.frequency.value = lerp(p.filter.frequency.value, target + speed * 12, dt * 1.5);
    if (speed > 5 && performance.now() - this.lastStep > (speed > 10 ? 160 : 240)) {
      this.lastStep = performance.now();
      this.tone(biome === 'snow' ? 130 : 95, 0.035, 'sine', 0.012, 0.88);
    }
  }
}

class ParticleSystem {
  constructor(scene, max = 2400) {
    this.max = max; this.next = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.vel = Array.from({ length: max }, () => new THREE.Vector3());
    this.color = new THREE.Color();
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0.88, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  spawn(p, color = 0xffffff, count = 8, power = 1, bias = null) {
    const c = this.color.set(color);
    for (let i = 0; i < count; i++) {
      const id = this.next++ % this.max;
      const j = id * 3;
      this.pos[j] = p.x + randRange(-0.25, 0.25);
      this.pos[j + 1] = p.y + randRange(-0.25, 0.25);
      this.pos[j + 2] = p.z + randRange(-0.25, 0.25);
      this.col[j] = c.r; this.col[j + 1] = c.g; this.col[j + 2] = c.b;
      this.life[id] = this.maxLife[id] = randRange(0.35, 1.2) * power;
      const a = Math.random() * TAU, u = randRange(-0.25, 1);
      const s = randRange(1.5, 8) * power;
      this.vel[id].set(Math.cos(a) * s, u * s + 1.2, Math.sin(a) * s);
      if (bias) this.vel[id].addScaledVector(bias, randRange(0.2, 1.0));
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
  update(dt) {
    const p = this.pos;
    let live = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) { p[j + 1] = -9999; this._dirty = true; continue; }
      const v = this.vel[i];
      v.y -= 2.8 * dt;
      p[j] += v.x * dt; p[j + 1] += v.y * dt; p[j + 2] += v.z * dt;
      v.multiplyScalar(1 - Math.min(0.9, dt * 1.8));
      live++;
    }
    // Only re-upload the (28KB) position buffer when particles actually moved or expired
    // this frame; while none are alive (e.g. exploring with no combat) we skip the upload.
    if (live > 0 || this._dirty) { this.points.geometry.attributes.position.needsUpdate = true; this._dirty = false; }
  }
}

// Pooled world-space floating combat text (damage, heals, breaks). Projects to screen each frame.
class FloatingText {
  constructor(layer, camera, max = 56) {
    this.layer = layer; this.camera = camera;
    this.pool = [];
    for (let i = 0; i < max; i++) { const el = document.createElement('div'); el.className = 'dmg-num'; el.style.display = 'none'; layer.appendChild(el); this.pool.push({ el, active: false }); }
    this.items = [];
    this.proj = new THREE.Vector3();
  }
  spawn(worldPos, text, cls = '') {
    const slot = this.pool.find(p => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.el.className = 'dmg-num' + (cls ? ' ' + cls : '');
    slot.el.textContent = text;
    slot.el.style.display = 'block';
    this.items.push({ slot, pos: worldPos.clone(), vy: randRange(2.0, 3.0), life: 0.92, max: 0.92, jx: randRange(-26, 26) });
  }
  clear() { for (const it of this.items) { it.slot.active = false; it.slot.el.style.display = 'none'; } this.items.length = 0; }
  update(dt) {
    if (!this.items.length) return;
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt; it.pos.y += it.vy * dt; it.vy -= dt * 2.0;
      if (it.life <= 0) { it.slot.active = false; it.slot.el.style.display = 'none'; this.items.splice(i, 1); continue; }
      this.proj.copy(it.pos).project(this.camera);
      if (this.proj.z > 1) { it.slot.el.style.opacity = '0'; continue; }
      const t = it.life / it.max;
      const x = (this.proj.x * 0.5 + 0.5) * w + it.jx * (1 - t);
      const y = (-this.proj.y * 0.5 + 0.5) * h - (1 - t) * 34;
      const scale = 0.9 + t * 0.45;
      it.slot.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-50%) scale(${scale.toFixed(2)})`;
      const op = t > 0.82 ? (1 - t) / 0.18 : t < 0.3 ? t / 0.3 : 1;
      it.slot.el.style.opacity = op.toFixed(2);
    }
  }
}

class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 1.2, 10);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.pitch = -0.08;
    this.eye = 1.62;
    this.height = 1.78;
    this.radius = 0.36;
    this.onGround = false;
    this.jumps = 0;
    this.bob = 0;
    this.walk = 7.2; this.sprint = 12.8; this.airControl = 4.2; this.gravity = -24;
    this.maxHp = 100; this.hp = 100; this.energy = 100; this.maxEnergy = 100;
    this.shotDamage = 22; this.shotCd = 0; this.slashCd = 0; this.surgeCd = 0;
    this.dashCooldown = 0.78; this.dashCd = 0; this.dashPower = 20; this.dashDamage = 24; this.dashTime = 0;
    this.slashDamage = 34; this.slashRange = 4.4; this.surgeRadius = 9; this.surgeDamage = 36;
    this.glide = false; this.doubleJump = false; this.iframes = 0; this.iframesBonus = 0; this.energyRevenge = 8;
    this.homeHeal = 10; this.senseRange = 120; this.viewBonus = 0; this.pickupRange = 4.5; this.pickupMagnet = 12;
    this.railPull = 10; this.killDashRefund = 0.0; this.splitChance = 0.05;
    // newer, flashier upgrade hooks
    this.chain = 0; this.homing = 0; this.slam = 0; this.timeDodge = 0; this.lifesteal = 0; this.revive = 0; this.usedRevive = false;
    this.upgrades = Object.fromEntries(UPGRADE_POOL.map(u => [u.id, 0]));
    this.solids = [];
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.fx = new THREE.Vector3();
    this.dashDir = new THREE.Vector3();
  }
  reset() {
    const fresh = new Player(this.camera);
    Object.assign(this, fresh);
  }
  setSolids(solids) { this.solids = solids; }
  lookVector(out = this.forward) {
    return out.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')).normalize();
  }
  horizontalLook(out = this.forward) {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    return out;
  }
  update(dt, input, heightAt, audio, particles) {
    this.iframes = Math.max(0, this.iframes - dt);
    this.shotCd = Math.max(0, this.shotCd - dt);
    this.slashCd = Math.max(0, this.slashCd - dt);
    this.surgeCd = Math.max(0, this.surgeCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dashTime = Math.max(0, this.dashTime - dt);

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    this.forward.set(-sy, 0, -cy);
    this.right.set(cy, 0, -sy);
    let mx = input.moveX, mz = input.moveY;
    if (input.keys.KeyW || input.keys.ArrowUp) mz += 1;
    if (input.keys.KeyS || input.keys.ArrowDown) mz -= 1;
    if (input.keys.KeyD || input.keys.ArrowRight) mx += 1;
    if (input.keys.KeyA || input.keys.ArrowLeft) mx -= 1;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const wish = this.tmp.set(0, 0, 0).addScaledVector(this.forward, mz).addScaledVector(this.right, mx);
    const sprinting = input.keys.ShiftLeft || input.keys.ShiftRight || input.sprint;
    const targetSpeed = (sprinting ? this.sprint : this.walk) * (this.dashTime > 0 ? 1.08 : 1);
    const accel = this.onGround ? 14 : this.airControl;
    const targetX = wish.x * targetSpeed, targetZ = wish.z * targetSpeed;
    this.vel.x += (targetX - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (targetZ - this.vel.z) * Math.min(1, dt * accel);

    const wantsJump = input.consumeJump();
    if (wantsJump) {
      if (this.onGround || this.jumps < (this.doubleJump ? 2 : 1)) {
        this.vel.y = this.onGround ? 9.2 : 8.2;
        this.onGround = false;
        this.jumps++;
        audio.tone(this.jumps > 1 ? 510 : 360, 0.08, 'sine', 0.045, 1.45);
        particles.spawn(this.fx.set(this.pos.x, this.pos.y + 0.2, this.pos.z), this.jumps > 1 ? 0xbbe9ff : 0xffd36e, 12, 0.65);
      }
    }
    if (input.consumeDash() && this.dashCd <= 0 && this.energy >= 18) {
      const d = wish.lengthSq() > 0.01 ? wish.normalize() : this.horizontalLook(this.dashDir);
      this.vel.x += d.x * this.dashPower;
      this.vel.z += d.z * this.dashPower;
      this.vel.y = Math.max(this.vel.y, 1.5);
      this.energy -= 18;
      this.dashCd = this.dashCooldown;
      this.dashTime = 0.22;
      audio.dash();
      particles.spawn(this.fx.set(this.pos.x, this.pos.y + 1.0, this.pos.z), 0x62f7ff, 28, 1.15, d);
    }

    const heldGlide = (input.keys.Space || input.jumpHeld) && this.glide && !this.onGround && this.vel.y < 0;
    this.vel.y += this.gravity * (heldGlide ? 0.28 : 1) * dt;
    if (heldGlide) {
      this.energy = Math.max(0, this.energy - dt * 3.5);
      particles.spawn(this.fx.set(this.pos.x, this.pos.y + 1.1, this.pos.z), 0xbbe9ff, 1, 0.35);
    }
    this.energy = Math.min(this.maxEnergy, this.energy + dt * (this.onGround ? 16 : 8));

    const oldX = this.pos.x;
    this.pos.x += this.vel.x * dt;
    if (this.collides() && !this.tryStep()) { this.pos.x = oldX; this.vel.x *= -0.08; }
    const oldZ = this.pos.z;
    this.pos.z += this.vel.z * dt;
    if (this.collides() && !this.tryStep()) { this.pos.z = oldZ; this.vel.z *= -0.08; }
    this.pos.y += this.vel.y * dt;

    // Floor support = the highest of terrain and any solid top right under our feet, so you can
    // stand on rooftops, ziggurat tiers, the wreck deck, etc. — not just terrain.
    let support = heightAt(this.pos.x, this.pos.z);
    const r = this.radius;
    for (const box of this.solids) {
      if (this.pos.x + r > box.min.x && this.pos.x - r < box.max.x && this.pos.z + r > box.min.z && this.pos.z - r < box.max.z) {
        const top = box.max.y;
        if (top > support && top <= this.pos.y + 0.4) support = top; // only treat as floor when we're at/just above it
      }
    }
    if (this.pos.y <= support) {
      this.pos.y = support;
      this.vel.y = Math.max(0, this.vel.y);
      if (!this.onGround) particles.spawn(this.fx.set(this.pos.x, this.pos.y + 0.15, this.pos.z), 0xffffff, Math.min(18, 3 + Math.hypot(this.vel.x, this.vel.z)), 0.45);
      this.onGround = true;
      this.jumps = 0;
    } else {
      this.onGround = false;
    }

    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.6 && this.onGround) this.bob += dt * (sprinting ? 13.5 : 9.2) * clamp(speed / 9, 0.4, 1.6);
    else this.bob *= 1 - Math.min(1, dt * 5);
    const amp = sprinting ? 0.065 : 0.036;
    const bobY = Math.sin(this.bob) * amp;
    const bobX = Math.cos(this.bob * 0.5) * amp * 0.55;
    this.camera.position.set(this.pos.x + bobX, this.pos.y + this.eye + bobY, this.pos.z);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const targetFov = 73 + clamp(speed * 0.75, 0, 12) + (this.dashTime > 0 ? 10 : 0);
    this.camera.fov = lerp(this.camera.fov, targetFov, Math.min(1, dt * 8));
    this.camera.updateProjectionMatrix();
  }
  collides() {
    const minx = this.pos.x - this.radius, maxx = this.pos.x + this.radius;
    const minz = this.pos.z - this.radius, maxz = this.pos.z + this.radius;
    const miny = this.pos.y + 0.05, maxy = this.pos.y + this.height;
    for (const box of this.solids) {
      if (minx < box.max.x && maxx > box.min.x && minz < box.max.z && maxz > box.min.z && miny < box.max.y && maxy > box.min.y) return true;
    }
    return false;
  }
  // Climb a low ledge (stairs, ziggurat tier, curb) instead of bonking: while grounded, try
  // raising up to stepHeight and keeping the move if that clears the obstacle. The vertical
  // resolve then settles us onto the ledge. Returns true if a step was taken.
  tryStep() {
    if (!this.onGround && this.vel.y < -1) return false; // no wall-climbing in mid-fall
    const STEP = 0.62, savedY = this.pos.y;
    this.pos.y += STEP;
    if (!this.collides()) return true;
    this.pos.y = savedY;
    return false;
  }
  hurt(amount, source, game) {
    if (this.iframes > 0) return false;
    this.hp -= amount;
    this.energy = Math.min(this.maxEnergy, this.energy + this.energyRevenge);
    this.iframes = 0.78 + this.iframesBonus;
    const away = this.tmp.copy(this.pos).sub(source || this.pos).setY(0);
    if (away.lengthSq() > 0.001) {
      away.normalize();
      this.vel.addScaledVector(away, 8.5);
      this.vel.y = Math.max(this.vel.y, 4.4);
    }
    game.audio.hit();
    game.onPlayerHurt(amount, source);
    return this.hp <= 0;
  }
}

class InputState {
  constructor(player) {
    this.player = player;
    this.keys = {};
    this.moveX = 0; this.moveY = 0;
    this.shoot = false; this.slash = false; this.sprint = false; this.jumpHeld = false;
    this.jumpQueued = 0; this.dashQueued = 0; this.surgeQueued = 0; this.interactQueued = 0; this.slashQueued = 0; this.fireQueued = 0;
    this.pointerLocked = false;
    this.lookActive = false;
    this.autoFire = IS_TOUCH;
    this.stick = { id: null, sx: 0, sy: 0 };
    this.bind();
  }
  bind() {
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === canvas; });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || game.mode !== 'play') return;
      this.look(e.movementX, e.movementY, 1);
    });
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'Space') { this.jumpQueued++; this.jumpHeld = true; }
      if (e.code === 'KeyQ') this.dashQueued++;
      if (e.code === 'KeyF') this.surgeQueued++;
      if (e.code === 'KeyE') this.interactQueued++;
      if (e.code === 'KeyP' || e.code === 'Escape') game.togglePause();
    }, { passive: false });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; if (e.code === 'Space') this.jumpHeld = false; });
    window.addEventListener('mousedown', (e) => {
      if (game.mode !== 'play') return;
      if (!this.pointerLocked) requestPointerLockSafe();
      if (e.button === 0) this.shoot = true;
      if (e.button === 2) { this.slash = true; this.slashQueued++; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.shoot = false; if (e.button === 2) this.slash = false; });
    window.addEventListener('contextmenu', e => e.preventDefault());
    this.bindTouch();
  }
  bindTouch() {
    if (!IS_TOUCH) return;
    touchEl.classList.add('hidden');
    const vibe = (ms) => { try { navigator.vibrate?.(ms); } catch (_) {} };
    const moveZone = $('moveZone'), lookZone = $('lookZone');
    const stickBase = $('stickBase'), knob = $('stickKnob');
    const STICK_MAX = 52;

    // ---- Floating move stick: the base spawns wherever the left thumb lands. ----
    const setStick = (x, y) => {
      let dx = x - this.stick.sx, dy = y - this.stick.sy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_MAX) { dx = dx / len * STICK_MAX; dy = dy / len * STICK_MAX; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      // small dead-zone keeps the camera from drifting on a resting thumb
      const dz = 0.12;
      let nx = dx / STICK_MAX, ny = -dy / STICK_MAX;
      const mag = Math.hypot(nx, ny);
      if (mag < dz) { nx = ny = 0; } else { const m = (mag - dz) / (1 - dz) / mag; nx *= m; ny *= m; }
      this.moveX = clamp(nx, -1, 1);
      this.moveY = clamp(ny, -1, 1);
    };
    moveZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.stick.id = e.pointerId; this.stick.sx = e.clientX; this.stick.sy = e.clientY;
      stickBase.style.left = `${e.clientX}px`; stickBase.style.top = `${e.clientY}px`;
      stickBase.classList.remove('hidden');
      try { moveZone.setPointerCapture(e.pointerId); } catch (_) {}
      setStick(e.clientX, e.clientY);
    });
    moveZone.addEventListener('pointermove', (e) => { if (e.pointerId === this.stick.id) setStick(e.clientX, e.clientY); });
    const endStick = (e) => { if (e.pointerId !== this.stick.id) return; this.stick.id = null; this.moveX = this.moveY = 0; knob.style.transform = 'translate(0,0)'; stickBase.classList.add('hidden'); };
    moveZone.addEventListener('pointerup', endStick); moveZone.addEventListener('pointercancel', endStick);

    // ---- Look + tap-to-fire on the right side. A quick tap with no drag fires. ----
    let lookId = null, lx = 0, ly = 0, travel = 0, downT = 0;
    lookZone.addEventListener('pointerdown', (e) => {
      lookId = e.pointerId; lx = e.clientX; ly = e.clientY; travel = 0; downT = performance.now();
      try { lookZone.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault();
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      travel += Math.hypot(dx, dy);
      this.look(dx, dy, 2.0); lx = e.clientX; ly = e.clientY;
    });
    const endLook = (e) => {
      if (e.pointerId !== lookId) return;
      if (travel < 14 && performance.now() - downT < 260) this.fireQueued++; // tap = fire
      lookId = null;
    };
    lookZone.addEventListener('pointerup', endLook); lookZone.addEventListener('pointercancel', endLook);

    // ---- Action buttons ----
    const bindBtn = (id, down, up = null) => {
      const el = $(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('pressed'); vibe(12); down(); try { el.setPointerCapture(e.pointerId); } catch (_) {} });
      const release = () => { el.classList.remove('pressed'); (up || (() => {}))(); };
      el.addEventListener('pointerup', (e) => { e.preventDefault(); release(); });
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
    };
    bindBtn('touchShoot', () => { this.shoot = true; vibe(10); }, () => { this.shoot = false; }); // hold flag covers firing; no extra queued shot on release
    bindBtn('touchDash', () => { this.dashQueued++; vibe(18); });
    bindBtn('touchJump', () => { this.jumpQueued++; this.jumpHeld = true; }, () => this.jumpHeld = false);
    bindBtn('touchSlash', () => { this.slash = true; this.slashQueued++; vibe(15); }, () => this.slash = false);
    bindBtn('touchSurge', () => { this.surgeQueued++; vibe(30); });
    bindBtn('touchInteract', () => { this.interactQueued++; vibe(20); });

    autofireChip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.autoFire = !this.autoFire;
      autofireChip.classList.toggle('off', !this.autoFire);
      autofireChip.querySelector('b').textContent = this.autoFire ? 'ON' : 'OFF';
      vibe(12);
    });
  }
  look(dx, dy, mul = 1) {
    this.player.yaw -= dx * 0.00215 * mul;
    this.player.pitch -= dy * 0.00215 * mul;
    this.player.pitch = clamp(this.player.pitch, -Math.PI / 2 + 0.04, Math.PI / 2 - 0.04);
  }
  consumeJump() { if (this.jumpQueued > 0) { this.jumpQueued--; return true; } return false; }
  consumeDash() { if (this.dashQueued > 0) { this.dashQueued--; return true; } return false; }
  consumeSurge() { if (this.surgeQueued > 0) { this.surgeQueued--; return true; } return false; }
  consumeInteract() { if (this.interactQueued > 0) { this.interactQueued--; return true; } return false; }
  consumeSlash() { if (this.slashQueued > 0) { this.slashQueued--; return true; } return false; }
  consumeFire() { if (this.fireQueued > 0) { this.fireQueued = 0; return true; } return false; }
}

class ChunkManager {
  constructor(scene, player, quality) {
    this.scene = scene; this.player = player; this.quality = quality;
    this.loadR = quality === 'high' ? 2 : 1; // medium/low load 9 chunks instead of 25 — the biggest draw-call cut
    this.detail = quality === 'high' ? 16 : quality === 'medium' ? 12 : 9;
    this.chunks = new Map();
    this.buildQueue = [];
    this.buildSet = new Set();
    this.decorQueue = []; // chunks whose terrain is built but heavy biome decoration is still pending
    this.solidsScratch = [];
    this.activeScratch = { interactables: [], rails: [], destructibles: [] };
    this.tmpColor = new THREE.Color();
    this.shadowCasters = quality === 'high' && !IS_TOUCH;
    this.lightBudget = quality === 'high' ? 2 : quality === 'medium' ? 1 : 0;
    this.geos = {
      box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(1, 16, 10), cone: new THREE.ConeGeometry(1, 1, 8), cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
      roof: new THREE.ConeGeometry(1, 1, 4), torus: new THREE.TorusGeometry(1, 0.07, 8, 36)
    };
    this.mats = this.makeMaterials();
  }
  makeMaterials() {
    const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.72, metalness: opts.metalness ?? 0.05, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 0, transparent: opts.transparent ?? false, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide, vertexColors: opts.vertexColors ?? false });
    return {
      terrain: new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.0, vertexColors: true }),
      road: mat(0x161725, { roughness: 0.84 }), concrete: mat(0x5c6278), dark: mat(0x101020), wall: mat(0x45506a), warmWall: mat(0x8b6e58), roof: mat(0x38203b), snowRoof: mat(0xe5f3ff),
      window: mat(0x7ff5ff, { emissive: 0x54eaff, emissiveIntensity: 1.9, roughness: 0.25 }), gold: mat(0xffd36e, { emissive: 0xd88c2b, emissiveIntensity: 0.8 }), pink: mat(0xff4fd8, { emissive: 0xff4fd8, emissiveIntensity: 1.35 }), cyan: mat(0x62f7ff, { emissive: 0x62f7ff, emissiveIntensity: 1.25 }),
      violet: mat(0x9f74ff, { emissive: 0x6b44ff, emissiveIntensity: 0.85 }), trunk: mat(0x5b3c2c), sand: mat(0xd6a75d), snow: mat(0xd7e8ff), rock: mat(0x4d536c),
      // bioluminescent foliage — softly self-lit, in three alien hues
      leaf: mat(0x2f8c7a, { emissive: 0x1f8c7a, emissiveIntensity: 0.3 }), leafBlue: mat(0x2f5a9c, { emissive: 0x2e6cff, emissiveIntensity: 0.28 }), leafViolet: mat(0x7a4dac, { emissive: 0x9a4dff, emissiveIntensity: 0.3 }),
      moon: mat(0xeef4ff, { emissive: 0xacc4f0, emissiveIntensity: 0.55, roughness: 0.95 }),
      // vibrant alien-planet palettes (body + contrasting ring), one signature per nature biome
      planets: [
        { body: mat(0x16c8b0, { emissive: 0x0fae94, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.1 }), ring: mat(0xffe27d, { emissive: 0xffc24d, emissiveIntensity: 1.0 }), accent: 0x33ddc2 },
        { body: mat(0xb24dff, { emissive: 0x7a2dff, emissiveIntensity: 0.62, roughness: 0.5, metalness: 0.1 }), ring: mat(0x62f7ff, { emissive: 0x62f7ff, emissiveIntensity: 1.0 }), accent: 0x9a5cff },
        { body: mat(0xff7a4d, { emissive: 0xff3d6e, emissiveIntensity: 0.55, roughness: 0.5, metalness: 0.1 }), ring: mat(0xffd36e, { emissive: 0xffb84d, emissiveIntensity: 1.0 }), accent: 0xff6a55 },
        { body: mat(0xff8fd0, { emissive: 0xc56fff, emissiveIntensity: 0.55, roughness: 0.5, metalness: 0.1 }), ring: mat(0xbff0ff, { emissive: 0xbff0ff, emissiveIntensity: 1.0 }), accent: 0xff8fd0 },
      ],
      ember: mat(0xff8a3d, { emissive: 0xff5a1e, emissiveIntensity: 1.5, roughness: 0.5 }), // glowing bioluminescent pools
      // Plain standard material (no `transmission`): a transmission>0 material makes
      // three.js run a full second scene render + MSAA-resolve + mipmap every frame any
      // water is visible (Chromium reports it as "GPU stall due to ReadPixels"), which
      // roughly doubled render cost. The neon look comes from emissive+opacity, so the
      // visual loss is negligible while the extra pass disappears.
      water: new THREE.MeshStandardMaterial({ color: 0x5ef8ff, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.62, emissive: 0x0d5a7e, emissiveIntensity: 0.45, side: THREE.DoubleSide }),
      invisible: new THREE.MeshBasicMaterial({ color: 0xffffff, visible: false })
    };
  }
  dispose() {
    for (const ch of this.chunks.values()) this.disposeChunk(ch);
    this.chunks.clear();
  }
  key(cx, cz) { return `${cx},${cz}`; }
  update(pos, budget = 2, msBudget = 3.8) {
    const [pcx, pcz] = worldChunk(pos.x, pos.z);
    const want = new Set();
    const missing = [];
    for (let dx = -this.loadR; dx <= this.loadR; dx++) for (let dz = -this.loadR; dz <= this.loadR; dz++) {
      const cx = pcx + dx, cz = pcz + dz, k = this.key(cx, cz);
      want.add(k);
      if (!this.chunks.has(k) && !this.buildSet.has(k)) missing.push({ cx, cz, k, dist: Math.abs(dx) + Math.abs(dz) + Math.hypot(dx, dz) * 0.01 });
    }
    for (const [k, ch] of this.chunks) if (!want.has(k)) { this.disposeChunk(ch); this.chunks.delete(k); }
    if (missing.length) {
      missing.sort((a, b) => a.dist - b.dist);
      for (const m of missing) { this.buildQueue.push(m); this.buildSet.add(m.k); }
    }
    const start = performance.now();
    let built = 0;
    while (budget > 0 && this.buildQueue.length) {
      const m = this.buildQueue.shift();
      this.buildSet.delete(m.k);
      if (!want.has(m.k) || this.chunks.has(m.k)) continue;
      this.chunks.set(m.k, this.build(m.cx, m.cz));
      budget--; built++;
      if (built > 0 && performance.now() - start > msBudget) break;
    }
    // Decorate already-built chunks, one biome-gen at a time, until the frame's time budget
    // is spent. Spreading decoration across frames is what stops a single chunk from freezing.
    while (this.decorQueue.length && performance.now() - start < msBudget) {
      const rec = this.decorQueue.shift();
      if (this.chunks.get(this.key(rec.cx, rec.cz)) === rec) this.decorate(rec);
    }
    if (this.decorQueue.length > 48) this.decorQueue = this.decorQueue.filter(r => this.chunks.get(this.key(r.cx, r.cz)) === r);
    // Drop stale queued work after teleports/restarts; it prevents old neighborhoods from being built off-screen.
    if (this.buildQueue.length > 64) {
      this.buildQueue = this.buildQueue.filter(m => want.has(m.k));
      this.buildSet = new Set(this.buildQueue.map(m => m.k));
    }
  }
  disposeChunk(ch) {
    this.scene.remove(ch.group);
    ch.group.traverse((o) => {
      if (o.userData?.disposable && o.geometry) o.geometry.dispose();
      if (o.isLight) o.dispose?.();
    });
  }
  biomeAt(x, z) {
    const r = Math.hypot(x, z);
    if (r < 118) return 'meadow';
    const ang = Math.atan2(z, x);
    const w = fbm(x * 0.0025 + 80, z * 0.0025 - 40, 3);
    let b;
    if (ang > -Math.PI / 4 && ang <= Math.PI / 4) b = 'city';          // east
    else if (ang > Math.PI / 4 && ang <= Math.PI * 3 / 4) b = w > 0.28 ? 'coast' : 'forest'; // south
    else if (ang <= -Math.PI / 4 && ang > -Math.PI * 3 / 4) b = 'snow'; // north
    else b = 'desert';                                                  // west
    if (Math.abs(w) > 0.62 && r > 220) b = w > 0 ? 'city' : 'forest';
    return b;
  }
  heightAt(x, z) {
    // Per-point biome is required: it keeps terrain continuous across chunk edges and keeps
    // the rendered mesh height in lockstep with the player ground-snap and every decoration
    // placement (all of which call heightAt per point). Do not pass a chunk-wide biome hint
    // here — it desyncs the terrain from where things actually sit at biome boundaries.
    const b = this.biomeAt(x, z);
    const n = fbm(x * 0.013, z * 0.013, 5);
    const n2 = fbm(x * 0.004 - 22, z * 0.004 + 9, 3);
    if (b === 'city') return Math.max(0, n * 0.8 + n2 * 0.6);
    if (b === 'desert') return Math.max(0, Math.sin(x * 0.035) * 1.2 + Math.cos(z * 0.028) * 0.8 + n * 2.2);
    if (b === 'snow') return Math.max(0, n * 5.5 + Math.pow(Math.max(0, n2 + 0.34), 2.2) * 15);
    if (b === 'forest') return Math.max(0, n * 3.2 + n2 * 1.2);
    if (b === 'coast') return Math.max(0, n * 1.8 + n2 * 0.8);
    return Math.max(0, n * 2.2 + n2 * 0.9);
  }
  terrainColor(biome, h, x, z) {
    const info = BIOMES[biome];
    const [a, b, c] = info._groundColors;
    const t = clamp(0.5 + fbm(x * 0.035, z * 0.035, 3) * 0.65 + h * 0.03, 0, 1);
    const col = this.tmpColor;
    if (t < 0.55) col.lerpColors(a, b, t / 0.55); else col.lerpColors(b, c, (t - 0.55) / 0.45);
    if (biome === 'snow' && h > 6) col.lerp(new THREE.Color(0xffffff), 0.45);
    return col;
  }
  build(cx, cz) {
    const group = new THREE.Group();
    const ox = cx * CHUNK, oz = cz * CHUNK;
    group.position.set(ox, 0, oz);
    this.scene.add(group);
    const rng = seeded(cx, cz, 7);
    const biome = this.biomeAt(ox, oz);
    const solids = [], interactables = [], rails = [], lights = [], destructibles = [];
    let lightsLeft = this.lightBudget + (cx === 0 && cz === 0 ? 2 : 0);
    const addSolid = (wx, wy, wz, sx, sy, sz) => solids.push(new THREE.Box3(new THREE.Vector3(wx - sx / 2, wy, wz - sz / 2), new THREE.Vector3(wx + sx / 2, wy + sy, wz + sz / 2)));
    const addMesh = (geo, mat, lx, ly, lz, sx = 1, sy = 1, sz = 1, rotY = 0, rotX = 0, disposable = false) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(lx, ly, lz); m.scale.set(sx, sy, sz); m.rotation.set(rotX, rotY, 0);
      const emissive = mat?.emissiveIntensity || 0;
      m.castShadow = this.shadowCasters && sy > 0.42 && emissive < 1.05;
      m.receiveShadow = this.quality !== 'low';
      m.userData.disposable = disposable; group.add(m); return m;
    };
    const addLight = (color, intensity, distance, decay, lx, ly, lz) => {
      if (lightsLeft <= 0) return null;
      lightsLeft--;
      const light = new THREE.PointLight(color, intensity, distance, decay);
      light.position.set(lx, ly, lz); group.add(light); lights.push(light); return light;
    };
    const ctxBase = { group, ox, oz, rng, biome, addMesh, addSolid, addLight, interactables, rails, lights, destructibles };
    // Terrain + paths build now (cheap, gives the chunk a floor + collision immediately);
    // the heavy biome decoration (hundreds of meshes) is deferred to decorate() so a single
    // chunk never blocks a whole frame — the prime cause of the multi-hundred-ms freezes.
    this.addTerrain(group, cx, cz, biome);
    this.addPaths(group, ox, oz, biome, rng);
    const rec = { group, solids, interactables, rails, lights, destructibles, biome, cx, cz, _decor: ctxBase };
    this.decorQueue.push(rec);
    return rec;
  }
  // Heavy per-chunk decoration, run from the time-budgeted queue in update() a frame or two
  // after the terrain so the work is spread across frames instead of one big stall.
  decorate(rec) {
    const ctx = rec._decor; if (!ctx) return;
    rec._decor = null;
    const { biome, cx, cz } = rec, rng = ctx.rng;
    if (biome === 'city') this.genCity(ctx);
    else if (biome === 'desert') this.genDesert(ctx);
    else if (biome === 'snow') this.genSnow(ctx);
    else if (biome === 'forest') this.genForest(ctx);
    else if (biome === 'coast') this.genCoast(ctx);
    else this.genMeadow(ctx);

    if (cx === 0 && cz === 0) this.addStartGarden(ctx);

    // Landmarks appear everywhere, but never in every chunk. Scarcity keeps them from feeling like Ubisoft sneezed icons all over your cornea.
    if ((hash2(cx, cz) > 0.72 || (Math.abs(cx) + Math.abs(cz)) % 7 === 0) && !(cx === 0 && cz === 0)) {
      this.addLandmark({ ...ctx, id: 0 });
    }
    // Home sanctuaries in many chunks, especially near the center and in snow/meadow.
    if (!(cx === 0 && cz === 0) && (biome === 'meadow' || biome === 'snow' || (rng() > 0.72 && biome !== 'city'))) {
      this.addHome({ ...ctx, id: 1 });
    }
    // Rare unique places-with-names ("points of interest") you stumble onto and discover.
    // Separate hash from landmarks so the two don't pile onto the same chunks.
    if (!(cx === 0 && cz === 0) && hash2(cx * 7 + 3, cz * 7 - 5) > 0.88) {
      this.addPOI({ ...ctx, id: 2 });
    }
  }
  addTerrain(group, cx, cz, biome) {
    const div = this.detail;
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const positions = [], colors = [], indices = [];
    for (let iz = 0; iz <= div; iz++) {
      for (let ix = 0; ix <= div; ix++) {
        const lx = ix / div * CHUNK - CHUNK / 2;
        const lz = iz / div * CHUNK - CHUNK / 2;
        const wx = ox + lx, wz = oz + lz;
        const h = this.heightAt(wx, wz);
        positions.push(lx, h, lz);
        const col = this.terrainColor(biome, h, wx, wz);
        colors.push(col.r, col.g, col.b);
      }
    }
    for (let iz = 0; iz < div; iz++) {
      for (let ix = 0; ix < div; ix++) {
        const a = iz * (div + 1) + ix;
        indices.push(a, a + 1, a + div + 1, a + 1, a + div + 2, a + div + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices); geo.computeVertexNormals(); geo.userData.disposable = true;
    const mesh = new THREE.Mesh(geo, this.mats.terrain);
    mesh.receiveShadow = true; mesh.userData.disposable = true;
    group.add(mesh);
  }
  addPaths(group, ox, oz, biome, rng) {
    const mat = biome === 'city' ? this.mats.road : biome === 'desert' ? this.mats.sand : biome === 'snow' ? this.mats.snow : this.mats.concrete;
    const roadGeo1 = new THREE.BoxGeometry(CHUNK, 0.06, biome === 'city' ? 11 : 4.5);
    const roadGeo2 = new THREE.BoxGeometry(biome === 'city' ? 11 : 4.5, 0.06, CHUNK);
    roadGeo1.userData.disposable = roadGeo2.userData.disposable = true;
    const y1 = this.heightAt(ox, oz) + 0.035;
    const r1 = new THREE.Mesh(roadGeo1, mat); r1.position.set(0, y1, 0); r1.receiveShadow = true; r1.userData.disposable = true; group.add(r1);
    if (biome === 'city' || biome === 'meadow') { const r2 = new THREE.Mesh(roadGeo2, mat); r2.position.set(0, y1 + 0.012, 0); r2.receiveShadow = true; r2.userData.disposable = true; group.add(r2); }
  }
  addBoxDecor(ctx, mat, lx, lz, sx, sy, sz, yOff = 0, rot = 0, collider = false) {
    const y = this.heightAt(ctx.ox + lx, ctx.oz + lz) + sy / 2 + yOff;
    ctx.addMesh(this.geos.box, mat, lx, y, lz, sx, sy, sz, rot);
    if (collider) ctx.addSolid(ctx.ox + lx, y - sy / 2, ctx.oz + lz, sx, sy, sz);
  }
  genCity(ctx) {
    const { rng } = ctx;
    const n = 8 + Math.floor(rng() * 11);
    for (let i = 0; i < n; i++) {
      const lx = randCell(rng), lz = randCell(rng);
      if (Math.abs(lx) < 9 || Math.abs(lz) < 9) continue;
      const sx = randRangeR(rng, 8, 18), sz = randRangeR(rng, 8, 18), sy = randRangeR(rng, 12, 48) * (rng() > 0.88 ? 1.5 : 1);
      const mat = rng() > 0.5 ? this.mats.dark : this.mats.wall;
      this.addBoxDecor(ctx, mat, lx, lz, sx, sy, sz, 0, 0, true);
      const wy = this.heightAt(ctx.ox + lx, ctx.oz + lz);
      // Cap windows per building: the old min(42, sy/2.6) made up to ~27 window meshes per
      // tower (~500/chunk), the single biggest contributor to the chunk-build freeze.
      for (let w = 0; w < Math.min(12, sy / 3.4); w++) {
        const side = w % 4, row = 2 + (w % 8) * 3.2, off = ((w * 7) % 10 - 5) * 0.9;
        let x = lx, z = lz, scx = 1.2, scz = 0.08;
        if (side === 0) { z += sz / 2 + 0.05; x += off; }
        if (side === 1) { z -= sz / 2 + 0.05; x += off; }
        if (side === 2) { x += sx / 2 + 0.05; z += off; scx = 0.08; scz = 1.2; }
        if (side === 3) { x -= sx / 2 + 0.05; z += off; scx = 0.08; scz = 1.2; }
        ctx.addMesh(this.geos.box, rng() > 0.58 ? this.mats.cyan : this.mats.pink, x, wy + row, z, scx, 1.0, scz);
      }
      if (rng() > 0.72) ctx.addMesh(this.geos.torus, this.mats.cyan, lx, wy + sy + 2, lz, sx * 0.42, sx * 0.42, sx * 0.42, rng() * TAU, Math.PI / 2);
    }
    // breakable lumen caches at street level near the central plaza
    for (let i = 0; i < 4; i++) if (rng() > 0.4) this.addPod(ctx, randRangeR(rng, -7, 7), randRangeR(rng, -7, 7), rng() > 0.5 ? 0xff4fd8 : 0x62f7ff);
    // lightline rails through the city grid — start near ground so you can step on, rise gently.
    this.addRail(ctx, new THREE.Vector3(ctx.ox - CHUNK / 2, this.heightAt(ctx.ox - CHUNK / 2, ctx.oz) + 0.6, ctx.oz), new THREE.Vector3(ctx.ox + CHUNK / 2, this.heightAt(ctx.ox + CHUNK / 2, ctx.oz) + 2.2, ctx.oz), 0x62f7ff);
    this.addRail(ctx, new THREE.Vector3(ctx.ox, this.heightAt(ctx.ox, ctx.oz - CHUNK / 2) + 0.6, ctx.oz - CHUNK / 2), new THREE.Vector3(ctx.ox, this.heightAt(ctx.ox, ctx.oz + CHUNK / 2) + 2.0, ctx.oz + CHUNK / 2), 0xff4fd8);
  }
  genMeadow(ctx) {
    for (let i = 0; i < 18; i++) this.addTree(ctx, randCell(ctx.rng), randCell(ctx.rng), ctx.rng() > 0.75 ? 1.4 : 1.0);
    for (let i = 0; i < 14; i++) this.addCrystal(ctx, randCell(ctx.rng), randCell(ctx.rng), ctx.rng() > 0.5 ? 0xffd36e : 0x62f7ff, randRangeR(ctx.rng, 0.45, 1.1));
    for (let i = 0; i < 3; i++) if (ctx.rng() > 0.5) this.addPod(ctx, randCell(ctx.rng), randCell(ctx.rng), 0x75ffb1);
    for (let i = 0; i < 5; i++) if (ctx.rng() > 0.45) this.addLumenPool(ctx, randCell(ctx.rng), randCell(ctx.rng));
    this.addRail(ctx, new THREE.Vector3(ctx.ox - 36, this.heightAt(ctx.ox - 36, ctx.oz + 23) + 0.6, ctx.oz + 23), new THREE.Vector3(ctx.ox + 36, this.heightAt(ctx.ox + 36, ctx.oz - 18) + 2.0, ctx.oz - 18), 0xffd36e);
    if (ctx.rng() > 0.4) this.addRail(ctx, new THREE.Vector3(ctx.ox + 30, this.heightAt(ctx.ox + 30, ctx.oz + 30) + 0.6, ctx.oz + 30), new THREE.Vector3(ctx.ox - 30, this.heightAt(ctx.ox - 30, ctx.oz - 30) + 1.6, ctx.oz - 30), 0x62f7ff);
  }
  genForest(ctx) {
    for (let i = 0; i < 34; i++) this.addTree(ctx, randCell(ctx.rng), randCell(ctx.rng), randRangeR(ctx.rng, 0.8, 1.9));
    for (let i = 0; i < 10; i++) this.addRock(ctx, randCell(ctx.rng), randCell(ctx.rng), randRangeR(ctx.rng, 0.8, 2.1));
    for (let i = 0; i < 2; i++) if (ctx.rng() > 0.55) this.addColumn(ctx, randCell(ctx.rng), randCell(ctx.rng));
    for (let i = 0; i < 8; i++) this.addCrystal(ctx, randCell(ctx.rng), randCell(ctx.rng), 0x75ffb1, randRangeR(ctx.rng, 0.4, 0.9));
    for (let i = 0; i < 3; i++) if (ctx.rng() > 0.45) this.addPod(ctx, randCell(ctx.rng), randCell(ctx.rng), 0x75ffb1);
    for (let i = 0; i < 5; i++) if (ctx.rng() > 0.45) this.addLumenPool(ctx, randCell(ctx.rng), randCell(ctx.rng));
    if (ctx.rng() > 0.55) this.addWater(ctx, randRangeR(ctx.rng, -24, 24), randRangeR(ctx.rng, -24, 24), randRangeR(ctx.rng, 9, 18));
    if (ctx.rng() > 0.4) this.addRail(ctx, new THREE.Vector3(ctx.ox - 34, this.heightAt(ctx.ox - 34, ctx.oz + 20) + 0.6, ctx.oz + 20), new THREE.Vector3(ctx.ox + 34, this.heightAt(ctx.ox + 34, ctx.oz - 20) + 1.8, ctx.oz - 20), 0x75ffb1);
  }
  genDesert(ctx) {
    if (ctx.rng() > 0.22) {
      this.addWater(ctx, randRangeR(ctx.rng, -18, 18), randRangeR(ctx.rng, -18, 18), randRangeR(ctx.rng, 11, 22));
      for (let i = 0; i < 8; i++) this.addPalm(ctx, randRangeR(ctx.rng, -22, 22), randRangeR(ctx.rng, -22, 22));
    }
    for (let i = 0; i < 8; i++) this.addRock(ctx, randCell(ctx.rng), randCell(ctx.rng), randRangeR(ctx.rng, 1.0, 3.2));
    for (let i = 0; i < 6; i++) this.addCrystal(ctx, randCell(ctx.rng), randCell(ctx.rng), 0xffd36e, randRangeR(ctx.rng, 0.5, 1.0));
    for (let i = 0; i < 2; i++) if (ctx.rng() > 0.55) this.addPod(ctx, randCell(ctx.rng), randCell(ctx.rng), 0xffd36e);
    if (ctx.rng() > 0.65) {
      const lx = randCell(ctx.rng), lz = randCell(ctx.rng), y = this.heightAt(ctx.ox + lx, ctx.oz + lz) + 4;
      ctx.addMesh(this.geos.torus, this.mats.gold, lx, y, lz, 8, 8, 8, ctx.rng() * TAU, Math.PI / 2);
    }
    if (ctx.rng() > 0.45) this.addRail(ctx, new THREE.Vector3(ctx.ox - 38, this.heightAt(ctx.ox - 38, ctx.oz - 20) + 0.6, ctx.oz - 20), new THREE.Vector3(ctx.ox + 38, this.heightAt(ctx.ox + 38, ctx.oz + 20) + 1.8, ctx.oz + 20), 0xffd36e);
  }
  genSnow(ctx) {
    for (let i = 0; i < 22; i++) this.addPine(ctx, randCell(ctx.rng), randCell(ctx.rng), randRangeR(ctx.rng, 0.9, 1.8));
    for (let i = 0; i < 12; i++) this.addRock(ctx, randCell(ctx.rng), randCell(ctx.rng), randRangeR(ctx.rng, 1.2, 3.6));
    for (let i = 0; i < 2; i++) if (ctx.rng() > 0.6) this.addColumn(ctx, randCell(ctx.rng), randCell(ctx.rng));
    for (let i = 0; i < 7; i++) this.addCrystal(ctx, randCell(ctx.rng), randCell(ctx.rng), 0xbbe9ff, randRangeR(ctx.rng, 0.5, 1.0));
    for (let i = 0; i < 2; i++) if (ctx.rng() > 0.5) this.addPod(ctx, randCell(ctx.rng), randCell(ctx.rng), 0x62f7ff);
    this.addRail(ctx, new THREE.Vector3(ctx.ox - 40, this.heightAt(ctx.ox - 40, ctx.oz - 26) + 0.6, ctx.oz - 26), new THREE.Vector3(ctx.ox + 40, this.heightAt(ctx.ox + 40, ctx.oz + 26) + 2.4, ctx.oz + 26), 0xbbe9ff);
  }
  genCoast(ctx) {
    this.addWater(ctx, 0, 18, 34, true);
    for (let i = 0; i < 16; i++) this.addPalm(ctx, randCell(ctx.rng), randCell(ctx.rng));
    for (let i = 0; i < 10; i++) this.addRock(ctx, randCell(ctx.rng), randCell(ctx.rng), randRangeR(ctx.rng, 0.7, 2));
    for (let i = 0; i < 2; i++) if (ctx.rng() > 0.55) this.addColumn(ctx, randCell(ctx.rng), randCell(ctx.rng));
    for (let i = 0; i < 6; i++) this.addCrystal(ctx, randCell(ctx.rng), randCell(ctx.rng), 0x62f7ff, randRangeR(ctx.rng, 0.4, 0.9));
    for (let i = 0; i < 2; i++) if (ctx.rng() > 0.5) this.addPod(ctx, randCell(ctx.rng), randCell(ctx.rng), 0x62f7ff);
    for (let i = 0; i < 6; i++) if (ctx.rng() > 0.4) this.addLumenPool(ctx, randCell(ctx.rng), randCell(ctx.rng));
    if (ctx.rng() > 0.45) this.addRail(ctx, new THREE.Vector3(ctx.ox - 36, this.heightAt(ctx.ox - 36, ctx.oz - 24) + 0.6, ctx.oz - 24), new THREE.Vector3(ctx.ox + 36, this.heightAt(ctx.ox + 36, ctx.oz + 24) + 2.0, ctx.oz + 24), 0x62f7ff);
  }
  addTree(ctx, lx, lz, s = 1) {
    const y = this.heightAt(ctx.ox + lx, ctx.oz + lz);
    ctx.addMesh(this.geos.cyl, this.mats.trunk, lx, y + 1.2 * s, lz, 0.35 * s, 2.4 * s, 0.35 * s, ctx.rng() * TAU);
    const lm = [this.mats.leaf, this.mats.leaf, this.mats.leafBlue, this.mats.leafViolet][Math.floor(ctx.rng() * 4)];
    ctx.addMesh(this.geos.sphere, lm, lx, y + 3.1 * s, lz, 1.8 * s, 1.25 * s, 1.8 * s, ctx.rng() * TAU);
  }
  addPine(ctx, lx, lz, s = 1) {
    const y = this.heightAt(ctx.ox + lx, ctx.oz + lz);
    ctx.addMesh(this.geos.cyl, this.mats.trunk, lx, y + 1.05 * s, lz, 0.28 * s, 2.1 * s, 0.28 * s);
    for (let i = 0; i < 3; i++) ctx.addMesh(this.geos.cone, i === 0 ? this.mats.snow : this.mats.leaf, lx, y + (2.3 + i * 1.15) * s, lz, (2.2 - i * 0.42) * s, (2.4 - i * 0.28) * s, (2.2 - i * 0.42) * s, ctx.rng() * TAU);
  }
  addPalm(ctx, lx, lz) {
    const y = this.heightAt(ctx.ox + lx, ctx.oz + lz), s = randRangeR(ctx.rng, 0.8, 1.25);
    ctx.addMesh(this.geos.cyl, this.mats.trunk, lx, y + 2.2 * s, lz, 0.28 * s, 4.4 * s, 0.28 * s, 0.2);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      const leaf = ctx.addMesh(this.geos.box, this.mats.leaf, lx + Math.cos(a) * 1.1 * s, y + 4.55 * s, lz + Math.sin(a) * 1.1 * s, 3.0 * s, 0.16 * s, 0.55 * s, -a);
      leaf.rotation.z = 0.2;
    }
  }
  registerDestructible(ctx, mesh, lx, lz, opts) {
    if (!ctx.destructibles) return;
    ctx.destructibles.push({
      mesh, pos: new THREE.Vector3(ctx.ox + lx, mesh.position.y, ctx.oz + lz),
      radius: opts.radius, hp: opts.hp, maxHp: opts.hp, color: opts.color,
      drop: opts.drop, kind: opts.kind || 'shard', dead: false, t: ctx.rng() * TAU,
      baseScale: mesh.scale.clone(), baseY: mesh.position.y, hitT: 0
    });
  }
  addRock(ctx, lx, lz, s = 1) {
    const y = this.heightAt(ctx.ox + lx, ctx.oz + lz) + 0.5 * s;
    const m = ctx.addMesh(this.geos.sphere, this.mats.rock, lx, y, lz, 1.6 * s, 0.75 * s, 1.2 * s, ctx.rng() * TAU);
    if (s > 2.2) ctx.addSolid(ctx.ox + lx, y - 0.5 * s, ctx.oz + lz, 2 * s, 1.1 * s, 1.7 * s);
    else this.registerDestructible(ctx, m, lx, lz, { radius: 1.5 * s, hp: 30 + s * 22, color: 0xb9c0d8, kind: 'rock', drop: { awe: 1 + Math.round(s * 2), energy: 0.4 } });
  }
  addCrystal(ctx, lx, lz, color = 0x62f7ff, s = 1) {
    const mat = color === 0xffd36e ? this.mats.gold : color === 0xff4fd8 ? this.mats.pink : this.mats.cyan;
    const y = this.heightAt(ctx.ox + lx, ctx.oz + lz) + 1.2 * s;
    const m = ctx.addMesh(this.geos.cone, mat, lx, y, lz, 0.9 * s, 2.4 * s, 0.9 * s, ctx.rng() * TAU);
    this.registerDestructible(ctx, m, lx, lz, { radius: 1.0 * s + 0.5, hp: 22 + s * 16, color, kind: 'crystal', drop: { awe: 3 + Math.round(s * 4), heart: 0.05, energy: 0.5 } });
  }
  // Glowing lumen pod: an obviously-breakable cache that scatters awe and energy.
  addPod(ctx, lx, lz, color = 0x75ffb1) {
    const y = this.heightAt(ctx.ox + lx, ctx.oz + lz) + 0.7;
    const mat = color === 0xffd36e ? this.mats.gold : color === 0xff4fd8 ? this.mats.pink : color === 0x75ffb1 ? this.mats.window : this.mats.cyan;
    const m = ctx.addMesh(this.geos.sphere, mat, lx, y, lz, 0.7, 0.92, 0.7, ctx.rng() * TAU);
    ctx.addMesh(this.geos.torus, this.mats.gold, lx, y - 0.55, lz, 0.6, 0.6, 0.6, 0, Math.PI / 2);
    ctx.addLight?.(color, 1.05, 9, 2, lx, y + 0.2, lz);
    this.registerDestructible(ctx, m, lx, lz, { radius: 1.1, hp: 26, color, kind: 'pod', drop: { awe: 8, heart: 0.22, energy: 1 } });
  }
  addWater(ctx, lx, lz, radius = 16, big = false) {
    const y = this.heightAt(ctx.ox + lx, ctx.oz + lz) + 0.05;
    const geo = new THREE.CircleGeometry(radius, 48); geo.rotateX(-Math.PI / 2); geo.userData.disposable = true;
    const mesh = new THREE.Mesh(geo, this.mats.water); mesh.position.set(lx, y, lz); mesh.userData.disposable = true; ctx.group.add(mesh);
    ctx.interactables.push({ type: 'water', key: keyName(ctx.ox + lx, ctx.oz + lz, 'water'), pos: new THREE.Vector3(ctx.ox + lx, y, ctx.oz + lz), radius: radius + 2, label: big ? 'listen to the ocean glass' : 'drink the impossible water', used: false });
  }
  // Bioluminescent amber pool — a flat glowing pad with a deep rim, like the glowing wells in
  // an alien valley. Pure emissive (no light), so they're cheap to scatter in bunches.
  addLumenPool(ctx, lx, lz) {
    const y = this.heightAt(ctx.ox + lx, ctx.oz + lz);
    const r = 1.6 + ctx.rng() * 2.4;
    const glow = [this.mats.ember, this.mats.ember, this.mats.cyan, this.mats.pink][Math.floor(ctx.rng() * 4)]; // mostly amber, some cyan/magenta
    ctx.addMesh(this.geos.cyl, glow, lx, y + 0.12, lz, r, 0.2, r);
    ctx.addMesh(this.geos.torus, this.mats.wall, lx, y + 0.22, lz, r * 1.08, r * 1.08, r * 1.08, 0, Math.PI / 2);
  }
  // Twisty luminous rock column — stacked, slightly-offset segments with a glowing crown,
  // like the bioluminescent pillars of an alien valley.
  addColumn(ctx, lx, lz) {
    const y = this.heightAt(ctx.ox + lx, ctx.oz + lz);
    const segs = 4 + Math.floor(ctx.rng() * 3);
    const baseR = 0.7 + ctx.rng() * 0.6;
    const crown = [this.mats.cyan, this.mats.pink, this.mats.violet, this.mats.ember][Math.floor(ctx.rng() * 4)];
    let yy = y, rot = ctx.rng() * TAU, ox = 0, oz = 0;
    for (let i = 0; i < segs; i++) {
      const h = 2.4 + ctx.rng() * 1.6, r = baseR * (1 - i / segs * 0.45);
      rot += (ctx.rng() - 0.5) * 1.4; ox += Math.cos(rot) * 0.5; oz += Math.sin(rot) * 0.5;
      ctx.addMesh(this.geos.cyl, this.mats.rock, lx + ox, yy + h / 2, lz + oz, r, h, r, rot);
      yy += h * 0.9;
    }
    ctx.addMesh(this.geos.sphere, crown, lx + ox, yy, lz + oz, baseR * 0.7, baseR * 0.7, baseR * 0.7);
  }
  // Each biome gets its OWN giant, recognizable landmark so areas read as distinct places you
  // can navigate by — led by the Hung Moon (a huge glowing sphere on cables) over the open
  // meadows/coasts, like the reference. They're big and emissive so you spot them from afar.
  addLandmark(ctx) {
    const lx = randRangeR(ctx.rng, -30, 30), lz = randRangeR(ctx.rng, -30, 30);
    const wx = ctx.ox + lx, wz = ctx.oz + lz, y0 = this.heightAt(wx, wz);
    const b = ctx.biome;
    let label;
    if (b === 'coast') { this.landmarkMoon(ctx, lx, lz, y0); label = 'the Hung Moon'; }
    else if (b === 'city') { this.landmarkSpire(ctx, lx, lz, y0); label = 'the Beacon'; }
    else { // a vibrant alien sky object — biome sets the signature colour, a roll picks the kind
      const pi = b === 'forest' ? 1 : b === 'desert' ? 2 : b === 'snow' ? 3 : 0;
      const roll = ctx.rng();
      if (roll < 0.48) { this.landmarkPlanet(ctx, lx, lz, y0, pi); label = ['the Verdant World', 'the Violet Wanderer', 'the Ember Giant', 'the Rose World'][pi]; }
      else if (roll < 0.7) { this.landmarkGasGiant(ctx, lx, lz, y0, pi); label = 'a banded gas giant'; }
      else if (roll < 0.86) { this.landmarkTwinMoons(ctx, lx, lz, y0); label = 'the Twin Moons'; }
      else { this.landmarkAurora(ctx, lx, lz, y0, pi); label = 'a sky aurora'; }
    }
    const key = keyName(wx, wz, 'vista', ctx.id);
    ctx.interactables.push({ type: 'vista', key, pos: new THREE.Vector3(wx, y0 + 1.2, wz), radius: 6.4, label: save.seen[key] ? `return to ${label}` : `steal a realization at ${label}`, used: !!save.seen[key] });
  }
  landmarkMoon(ctx, lx, lz, y0) {
    ctx.addMesh(this.geos.sphere, this.mats.moon, lx, y0 + 34, lz, 14, 14, 14); // giant glowing moon
    for (const [ox, oz] of [[2.6, 2.6], [-2.6, 2.6], [2.6, -2.6], [-2.6, -2.6]]) ctx.addMesh(this.geos.cyl, this.mats.dark, lx + ox, y0 + 58, lz + oz, 0.12, 26, 0.12); // suspension cables
    ctx.addLight?.(0xbcd2ff, 2.6, 95, 1.6, lx, y0 + 34, lz);
  }
  landmarkSpire(ctx, lx, lz, y0) {
    const info = BIOMES[ctx.biome];
    const mat = ctx.biome === 'city' ? this.mats.pink : this.mats.violet;
    ctx.addMesh(this.geos.cyl, this.mats.dark, lx, y0 + 0.25, lz, 5.2, 0.5, 5.2);
    ctx.addMesh(this.geos.cone, mat, lx, y0 + 4.8, lz, 2.0, 9.4, 2.0, ctx.rng() * TAU);
    ctx.addMesh(this.geos.torus, mat, lx, y0 + 7.6, lz, 3.2, 3.2, 3.2, ctx.rng() * TAU, Math.PI / 2);
    ctx.addLight?.(info.accent, 2.8, 34, 2, lx, y0 + 6.5, lz);
  }
  landmarkPlanet(ctx, lx, lz, y0, pi) {
    const pal = this.mats.planets[pi % this.mats.planets.length];
    const py = y0 + 25 + ctx.rng() * 9;            // floats in the sky, visible from afar
    const R = 7 + ctx.rng() * 2.5;
    ctx.addMesh(this.geos.sphere, pal.body, lx, py, lz, R, R, R, ctx.rng() * TAU);
    const rr = R * 1.7;
    ctx.addMesh(this.geos.torus, pal.ring, lx, py, lz, rr, rr, rr, ctx.rng() * TAU, 1.0 + ctx.rng() * 0.5); // tilted ring
    const ma = ctx.rng() * TAU, md = rr + 2.5;     // a tiny orbiting moonlet
    ctx.addMesh(this.geos.sphere, this.mats.moon, lx + Math.cos(ma) * md, py + 1.5, lz + Math.sin(ma) * md, 1.5, 1.5, 1.5);
    ctx.addLight?.(pal.accent, 2.8, 70, 1.6, lx, py, lz);
  }
  landmarkGasGiant(ctx, lx, lz, y0, pi) {
    const pal = this.mats.planets[pi % this.mats.planets.length];
    const py = y0 + 30 + ctx.rng() * 10, R = 11 + ctx.rng() * 3;
    ctx.addMesh(this.geos.sphere, pal.body, lx, py, lz, R, R, R, ctx.rng() * TAU);
    for (let i = 0; i < 3; i++) { const t = (i - 1) * 0.42, br = Math.sqrt(Math.max(0.05, 1 - t * t)) * R * 1.02; ctx.addMesh(this.geos.torus, pal.ring, lx, py + t * R, lz, br, br, br * 0.5, 0, Math.PI / 2); } // latitude bands
    const rr = R * 1.9; ctx.addMesh(this.geos.torus, pal.ring, lx, py, lz, rr, rr, rr, ctx.rng() * TAU, 1.1); // wide ring
    ctx.addLight?.(pal.accent, 3.0, 85, 1.5, lx, py, lz);
  }
  landmarkTwinMoons(ctx, lx, lz, y0) {
    const py = y0 + 30 + ctx.rng() * 8;
    ctx.addMesh(this.geos.sphere, this.mats.moon, lx - 6, py, lz, 8, 8, 8);
    ctx.addMesh(this.geos.sphere, this.mats.planets[3].body, lx + 7, py + 4, lz - 3, 5, 5, 5); // a smaller rose companion
    ctx.addLight?.(0xbcd2ff, 2.6, 100, 1.6, lx, py, lz);
  }
  landmarkAurora(ctx, lx, lz, y0, pi) {
    const pal = this.mats.planets[pi % this.mats.planets.length];
    const py = y0 + 40 + ctx.rng() * 12, R = 26 + ctx.rng() * 10;
    ctx.addMesh(this.geos.torus, pal.ring, lx, py, lz, R, R * 0.5, R, ctx.rng() * TAU, 1.35);          // shimmering arc
    ctx.addMesh(this.geos.torus, this.mats.cyan, lx, py + 2, lz, R * 0.78, R * 0.78 * 0.5, R * 0.78, ctx.rng() * TAU, 1.4);
    ctx.addLight?.(pal.accent, 2.4, 120, 1.2, lx, py, lz);
  }
  addHome(ctx) {
    const lx = randRangeR(ctx.rng, -28, 28), lz = randRangeR(ctx.rng, -28, 28);
    if (Math.abs(lx) < 12 && Math.abs(lz) < 12) return;
    this.addHomeAt(ctx, lx, lz, 1);
  }
  addHomeAt(ctx, lx, lz, id = 1) {
    const wx = ctx.ox + lx, wz = ctx.oz + lz, y0 = this.heightAt(wx, wz);
    const wall = ctx.biome === 'snow' ? this.mats.warmWall : this.mats.warmWall;
    const roof = ctx.biome === 'snow' ? this.mats.snowRoof : this.mats.roof;
    // Open, enterable little house: floor, back wall, side walls, front pillars, and a visible warm interior.
    ctx.addMesh(this.geos.box, this.mats.concrete, lx, y0 + 0.10, lz, 9.2, 0.20, 7.2, 0);
    ctx.addMesh(this.geos.box, wall, lx, y0 + 1.7, lz + 3.45, 9.2, 3.3, 0.35, 0);
    ctx.addMesh(this.geos.box, wall, lx - 4.45, y0 + 1.7, lz, 0.35, 3.3, 7.0, 0);
    ctx.addMesh(this.geos.box, wall, lx + 4.45, y0 + 1.7, lz, 0.35, 3.3, 7.0, 0);
    ctx.addMesh(this.geos.box, wall, lx - 3.25, y0 + 1.7, lz - 3.45, 2.4, 3.3, 0.35, 0);
    ctx.addMesh(this.geos.box, wall, lx + 3.25, y0 + 1.7, lz - 3.45, 2.4, 3.3, 0.35, 0);
    ctx.addMesh(this.geos.roof, roof, lx, y0 + 4.15, lz, 7.7, 2.8, 7.7, Math.PI / 4);
    ctx.addMesh(this.geos.box, this.mats.dark, lx, y0 + 1.05, lz - 3.62, 2.2, 2.1, 0.08);
    ctx.addMesh(this.geos.box, this.mats.gold, lx - 2.7, y0 + 2.1, lz + 3.66, 1.0, 0.85, 0.08);
    ctx.addMesh(this.geos.box, this.mats.gold, lx + 2.7, y0 + 2.1, lz + 3.66, 1.0, 0.85, 0.08);
    ctx.addMesh(this.geos.box, this.mats.violet, lx, y0 + 0.52, lz + 0.7, 3.8, 0.55, 1.45);
    ctx.addMesh(this.geos.box, this.mats.gold, lx - 2.4, y0 + 0.55, lz - 0.9, 1.2, 0.5, 1.2);
    ctx.addMesh(this.geos.box, this.mats.cyan, lx + 2.2, y0 + 0.65, lz - 0.4, 1.0, 0.7, 1.0);
    ctx.addMesh(this.geos.torus, this.mats.gold, lx, y0 + 1.65, lz - 3.78, 1.25, 1.25, 1.25, 0, Math.PI / 2);
    ctx.addLight?.(0xffb66e, 2.7, 24, 2, lx, y0 + 2.35, lz - 1.0);
    ctx.addSolid(wx, y0, wz + 3.45, 9.2, 3.3, 0.35);
    ctx.addSolid(wx - 4.45, y0, wz, 0.35, 3.3, 7.0);
    ctx.addSolid(wx + 4.45, y0, wz, 0.35, 3.3, 7.0);
    ctx.addSolid(wx - 3.25, y0, wz - 3.45, 2.4, 3.3, 0.35);
    ctx.addSolid(wx + 3.25, y0, wz - 3.45, 2.4, 3.3, 0.35);
    const key = keyName(wx, wz, 'home', id);
    ctx.interactables.push({ type: 'home', key, pos: new THREE.Vector3(wx, y0 + 0.5, wz), radius: 8.6, label: save.seen[key] ? 'rest in the lit house' : 'open the lit house', used: !!save.seen[key] });
  }
  // A short flight of climbable steps from (lx,lz) along (dirX,dirZ). Each step is a solid block
  // from the ground up to its top so there are no gaps; rises of ~0.5 fit the player's step-up.
  addStairs(ctx, lx, lz, dirX, dirZ, steps, rise, run, width, mat) {
    const base = this.heightAt(ctx.ox + lx, ctx.oz + lz);
    for (let i = 0; i < steps; i++) {
      const sx = lx + dirX * run * i, sz = lz + dirZ * run * i, h = (i + 1) * rise;
      const sizeX = dirX !== 0 ? run + 0.02 : width, sizeZ = dirZ !== 0 ? run + 0.02 : width;
      ctx.addMesh(this.geos.box, mat, sx, base + h / 2, sz, sizeX, h, sizeZ);
      ctx.addSolid(ctx.ox + sx, base, ctx.oz + sz, sizeX, h, sizeZ);
    }
  }
  // ---- Points of interest: each builds a distinct silhouette and registers a 'poi' discovery
  // interactable (auto-discovered on approach). Some also drop a 'home' rest spot or 'vista' shrine.
  addPOI(ctx) {
    const lx = randRangeR(ctx.rng, -24, 24), lz = randRangeR(ctx.rng, -24, 24);
    const wx = ctx.ox + lx, wz = ctx.oz + lz, y0 = this.heightAt(wx, wz);
    const kinds = y0 > 7 ? ['summit', 'summit', 'lantern'] : ['starliner', 'obelisk', 'ziggurat', 'lantern', 'arcade', 'hollow'];
    const kind = kinds[Math.floor(ctx.rng() * kinds.length)];
    this['poi_' + kind](ctx, lx, lz, y0);
    const def = POI_DEFS[kind], key = keyName(wx, wz, 'poi', ctx.id);
    ctx.interactables.push({ type: 'poi', kind, key, name: def.name, note: def.note, guarded: !!def.guarded, discoverR: def.discoverR, pos: new THREE.Vector3(wx, y0 + 1, wz), radius: def.discoverR, used: !!save.seen[key] });
  }
  poi_starliner(ctx, lx, lz, y0) {
    // a great fallen hull half-buried at an angle, one wing snapped, an engine still glowing
    ctx.addMesh(this.geos.cyl, this.mats.wall, lx, y0 + 2.6, lz, 2.7, 17, 2.7, 0.32, Math.PI / 2 - 0.32);
    ctx.addMesh(this.geos.cone, this.mats.dark, lx + 7.6, y0 + 1.0, lz + 1.4, 2.5, 5, 2.5, 0.32, Math.PI / 2 + 1.1);
    ctx.addMesh(this.geos.box, this.mats.wall, lx - 3, y0 + 1.7, lz + 4.2, 9, 0.4, 3, 0.42);
    ctx.addMesh(this.geos.torus, this.mats.cyan, lx - 7.6, y0 + 2.4, lz - 1.2, 2.0, 2.0, 2.0, 0, Math.PI / 2);
    ctx.addLight?.(0x62f7ff, 2.2, 24, 2, lx - 7.6, y0 + 2.4, lz - 1.2);
    // a flat boardable deck welded to the top of the hull — climb on with the step-up
    this.addBoxDecor(ctx, this.mats.concrete, lx, lz, 5.4, 0.4, 3.2, 3.0, 0, true);
    this.addStairs(ctx, lx, lz + 4.2, 0, -1, 6, 0.55, 1.0, 2.4, this.mats.concrete);
    ctx.addSolid(ctx.ox + lx, y0, ctx.oz + lz, 5.2, 3.2, 5.2);
    for (let i = 0; i < 4; i++) this.addPod(ctx, lx + randRangeR(ctx.rng, -9, 9), lz + randRangeR(ctx.rng, -9, 9), ctx.rng() > 0.5 ? 0x62f7ff : 0xff4fd8);
    const wx = ctx.ox + lx, wz = ctx.oz + lz, k = keyName(wx, wz, 'wreck', 9);
    ctx.interactables.push({ type: 'home', key: k, pos: new THREE.Vector3(wx, y0 + 0.5, wz - 3), radius: 6, label: save.seen[k] ? 'rest in the wreck' : 'shelter in the wreck', used: !!save.seen[k] });
  }
  poi_obelisk(ctx, lx, lz, y0) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, ox = Math.cos(a) * 7.5, oz = Math.sin(a) * 7.5;
      const hy = this.heightAt(ctx.ox + lx + ox, ctx.oz + lz + oz), h = randRangeR(ctx.rng, 5.5, 8);
      this.addBoxDecor(ctx, this.mats.rock, lx + ox, lz + oz, 1.5, h, 1.5, 0, a, true);
      ctx.addMesh(this.geos.box, this.mats.violet, lx + ox, hy + h + 0.2, lz + oz, 1.7, 0.35, 1.7, a);
    }
    ctx.addMesh(this.geos.cyl, this.mats.dark, lx, y0 + 0.4, lz, 2.4, 0.8, 2.4);
    ctx.addMesh(this.geos.cone, this.mats.gold, lx, y0 + 1.9, lz, 0.85, 2.4, 0.85);
    ctx.addLight?.(0xffd36e, 2.4, 24, 2, lx, y0 + 2, lz);
    const wx = ctx.ox + lx, wz = ctx.oz + lz, k = keyName(wx, wz, 'shrine', 8);
    ctx.interactables.push({ type: 'vista', key: k, pos: new THREE.Vector3(wx, y0 + 1, wz), radius: 5, label: save.seen[k] ? 'commune at the obelisks' : 'read the obelisk ring', used: !!save.seen[k] });
  }
  poi_ziggurat(ctx, lx, lz, y0) {
    // stacked tiers each only 0.6 tall, so you walk straight up the pyramid with the step-up
    const levels = 6;
    for (let i = 0; i < levels; i++) {
      const s = 17 - i * 2.4;
      this.addBoxDecor(ctx, i % 2 ? this.mats.wall : this.mats.concrete, lx, lz, s, 0.6, s, i * 0.6, 0, true);
    }
    const topY = y0 + levels * 0.6;
    ctx.addMesh(this.geos.cone, this.mats.pink, lx, topY + 1.5, lz, 1.3, 2.8, 1.3);
    ctx.addLight?.(0xff4fd8, 2.6, 30, 2, lx, topY + 1.6, lz);
    const wx = ctx.ox + lx, wz = ctx.oz + lz, k = keyName(wx, wz, 'shrine', 7);
    ctx.interactables.push({ type: 'vista', key: k, pos: new THREE.Vector3(wx, topY + 0.6, wz), radius: 5.5, label: save.seen[k] ? 'overlook from the ziggurat' : 'claim the ziggurat peak', used: !!save.seen[k] });
  }
  poi_lantern(ctx, lx, lz, y0) {
    for (let i = 0; i < 4; i++) ctx.addMesh(this.geos.cyl, i % 2 ? this.mats.warmWall : this.mats.wall, lx, y0 + 1.5 + i * 3, lz, 2.4 - i * 0.22, 3.02, 2.4 - i * 0.22);
    const topY = y0 + 1.5 + 3 * 3 + 1.5;
    ctx.addMesh(this.geos.cyl, this.mats.window, lx, topY + 1.4, lz, 1.7, 2.2, 1.7);
    ctx.addMesh(this.geos.cone, this.mats.roof, lx, topY + 3.3, lz, 2.2, 1.8, 2.2);
    ctx.addLight?.(0xffd36e, 3.4, 64, 1.4, lx, topY + 1.4, lz);
    ctx.addSolid(ctx.ox + lx, y0, ctx.oz + lz, 4.4, 13, 4.4);
    this.addStairs(ctx, lx, lz + 5.4, 0, -1, 8, 0.55, 1.0, 2.2, this.mats.concrete);
    const wx = ctx.ox + lx, wz = ctx.oz + lz, k = keyName(wx, wz, 'hearth', 6);
    ctx.interactables.push({ type: 'home', key: k, pos: new THREE.Vector3(wx, y0 + 0.5, wz + 3.2), radius: 6, label: save.seen[k] ? 'rest at the lantern' : 'enter the lantern', used: !!save.seen[k] });
  }
  poi_arcade(ctx, lx, lz, y0) {
    for (let i = 0; i < 6; i++) {
      const ox = randRangeR(ctx.rng, -12, 12), oz = randRangeR(ctx.rng, -12, 12);
      const h = randRangeR(ctx.rng, 2.6, 6.5), w = randRangeR(ctx.rng, 3, 5), yb = this.heightAt(ctx.ox + lx + ox, ctx.oz + lz + oz);
      this.addBoxDecor(ctx, ctx.rng() > 0.5 ? this.mats.dark : this.mats.wall, lx + ox, lz + oz, w, h, w, 0, randRangeR(ctx.rng, -0.3, 0.3), true);
      ctx.addMesh(this.geos.box, ctx.rng() > 0.5 ? this.mats.cyan : this.mats.pink, lx + ox, yb + h * 0.6, lz + oz + w / 2 + 0.05, w * 0.66, 0.5, 0.06);
    }
    for (let i = 0; i < 5; i++) this.addPod(ctx, lx + randRangeR(ctx.rng, -12, 12), lz + randRangeR(ctx.rng, -12, 12), ctx.rng() > 0.5 ? 0x62f7ff : 0xff4fd8);
    for (let i = 0; i < 3; i++) this.addCrystal(ctx, lx + randRangeR(ctx.rng, -12, 12), lz + randRangeR(ctx.rng, -12, 12), 0xff4fd8, 0.9);
  }
  poi_hollow(ctx, lx, lz, y0) {
    this.addLumenPool(ctx, lx, lz);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU, r = randRangeR(ctx.rng, 3, 10);
      this.addCrystal(ctx, lx + Math.cos(a) * r, lz + Math.sin(a) * r, [0x62f7ff, 0xffd36e, 0xff4fd8, 0x75ffb1][Math.floor(ctx.rng() * 4)], randRangeR(ctx.rng, 1.0, 2.2));
    }
    ctx.addMesh(this.geos.cone, this.mats.cyan, lx, y0 + 3.6, lz, 1.7, 7.2, 1.7);
    ctx.addLight?.(0x62f7ff, 2.2, 28, 2, lx, y0 + 3, lz);
  }
  poi_summit(ctx, lx, lz, y0) {
    ctx.addMesh(this.geos.cyl, this.mats.dark, lx, y0 + 0.5, lz, 3, 1, 3);
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; this.addBoxDecor(ctx, this.mats.rock, lx + Math.cos(a) * 2.4, lz + Math.sin(a) * 2.4, 0.9, randRangeR(ctx.rng, 3, 4.5), 0.9, 0, a, true); }
    ctx.addMesh(this.geos.sphere, this.mats.moon, lx, y0 + 4.6, lz, 1.5, 1.5, 1.5);
    ctx.addLight?.(0xbcd2ff, 2.6, 42, 1.6, lx, y0 + 4.6, lz);
    const wx = ctx.ox + lx, wz = ctx.oz + lz, k = keyName(wx, wz, 'shrine', 5);
    ctx.interactables.push({ type: 'vista', key: k, pos: new THREE.Vector3(wx, y0 + 1, wz), radius: 5.5, label: save.seen[k] ? 'breathe at the summit' : 'reach the summit shrine', used: !!save.seen[k] });
  }
  addStartGarden(ctx) {
    this.addPod(ctx, 0, 26, 0x75ffb1);
    this.addCrystal(ctx, -5, 35, 0xffd36e, 0.85);
    this.addCrystal(ctx, 5, 39, 0x62f7ff, 0.85);
    this.addCrystal(ctx, 0, 47, 0xff4fd8, 0.95);
    this.addHomeAt(ctx, 0, 60, 99);
    const h1 = this.heightAt(ctx.ox - 18, ctx.oz + 18) + 0.5; // first rail the player meets — trivially steppable
    const h2 = this.heightAt(ctx.ox + 28, ctx.oz + 54) + 1.6;
    this.addRail(ctx, new THREE.Vector3(ctx.ox - 18, h1, ctx.oz + 18), new THREE.Vector3(ctx.ox + 28, h2, ctx.oz + 54), 0xffd36e);
  }
  addRail(ctx, start, end, color = 0x62f7ff) {
    const localStart = start.clone().sub(new THREE.Vector3(ctx.ox, 0, ctx.oz));
    const localEnd = end.clone().sub(new THREE.Vector3(ctx.ox, 0, ctx.oz));
    const mid = localStart.clone().add(localEnd).multiplyScalar(0.5);
    mid.y += 0.8 + ctx.rng() * 0.8; // gentle arch (was +6..14, which put the whole rail out of jump reach)
    const curve = new THREE.CatmullRomCurve3([localStart, mid, localEnd]);
    const geo = new THREE.TubeGeometry(curve, 28, 0.18, 6, false); geo.userData.disposable = true; // chunkier so a low rail still reads as grindable
    const mat = color === 0xffd36e ? this.mats.gold : color === 0xff4fd8 ? this.mats.pink : this.mats.cyan;
    const mesh = new THREE.Mesh(geo, mat); mesh.userData.disposable = true; ctx.group.add(mesh);
    const worldMid = mid.clone().add(new THREE.Vector3(ctx.ox, 0, ctx.oz));
    ctx.rails.push({ start: start.clone(), end: end.clone(), points: [start.clone(), worldMid, end.clone()], color, radius: 11 });
  }
  collectSolids(x, z, out) {
    out.length = 0;
    const [cx, cz] = worldChunk(x, z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const ch = this.chunks.get(this.key(cx + dx, cz + dz)); if (!ch) continue;
      out.push(...ch.solids);
    }
    return out;
  }
  collectDestructibles(x, z, out) {
    out.length = 0;
    const [cx, cz] = worldChunk(x, z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const ch = this.chunks.get(this.key(cx + dx, cz + dz)); if (!ch || !ch.destructibles) continue;
      for (const d of ch.destructibles) if (!d.dead) out.push(d);
    }
    return out;
  }
  activeNear(x, z) {
    const [cx, cz] = worldChunk(x, z);
    const out = this.activeScratch;
    out.interactables.length = 0; out.rails.length = 0; out.destructibles.length = 0;
    for (let dx = -this.loadR; dx <= this.loadR; dx++) for (let dz = -this.loadR; dz <= this.loadR; dz++) {
      const ch = this.chunks.get(this.key(cx + dx, cz + dz)); if (!ch) continue;
      out.interactables.push(...ch.interactables); out.rails.push(...ch.rails);
      if (ch.destructibles) for (const d of ch.destructibles) if (!d.dead) out.destructibles.push(d);
    }
    return out;
  }
}
function randCell(rng) { return randRangeR(rng, -38, 38); }
function randRangeR(rng, a, b) { return a + rng() * (b - a); }

class Game {
  constructor() {
    this.mode = 'loading';
    this.quality = save.quality || localStorage.getItem(QUALITY_KEY) || (IS_TOUCH ? 'low' : 'medium');
    if (IS_TOUCH && this.quality === 'high') this.quality = 'medium';
    this.scene = null; this.renderer = null; this.camera = null; this.composer = null; this.bloom = null;
    this.player = null; this.input = null; this.world = null; this.particles = null; this.audio = new AudioDirector();
    this.projectiles = []; this.enemyProjectiles = []; this.enemies = []; this.pickups = [];
    this.solids = [];
    this.clock = 0; this.last = performance.now(); this.spawnTimer = 0; this.shake = 0; this.toastTimer = 0; this.realizationTimer = 0;
    this.bulletTime = 0; this._prevDash = 0; this._wasAir = false; // Slow Light + Gravity Sermon hooks
    this.run = { start: performance.now(), awe: 0, xp: 0, nextXp: 70, kills: 0, upgrades: 0, distance: 0, combo: 0, comboTimer: 0 };
    this.nearest = null;
    this.lastShotSplit = 0;
    this.hitStop = 0;            // brief slow-mo on big impacts
    this.chScale = 1; this.chColor = 'rgba(255,255,255,.5)'; this.chHitTimer = 0;
    this.dirDmgTimer = 0; this.lowHp = false;
    this.floaters = null;
    this.destructibles = [];     // scratch list of nearby breakables
    this.muzzleFlash = null;
    this.autoFireCd = 0;
  }
  async init() {
    if (!hasWebGL()) { setScreen(webglError); return; }
    this.setLoad(0.1, 'opening WebGL…');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x0b0a26, 1);
    this.renderer.shadowMap.enabled = this.quality === 'high'; // medium had a shadow pass with almost no casters — pure cost
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.camera = new THREE.PerspectiveCamera(IS_TOUCH ? 78 : 73, innerWidth / innerHeight, 0.04, this.quality === 'high' ? 820 : 520);
    this.player = new Player(this.camera);
    this.input = new InputState(this.player);
    this.setLoad(0.24, 'mixing sky colors…');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0a26);
    this.scene.fog = new THREE.FogExp2(0x131225, 0.0042);
    const hemi = new THREE.HemisphereLight(0xdfeeff, 0x271827, 1.65); this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffdfbb, 3.0); this.sun.position.set(80, 120, 40); this.sun.castShadow = this.quality === 'high';
    this.sun.shadow.mapSize.set(this.quality === 'high' ? 768 : 512, this.quality === 'high' ? 768 : 512); this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 360; this.sun.shadow.camera.left = -120; this.sun.shadow.camera.right = 120; this.sun.shadow.camera.top = 120; this.sun.shadow.camera.bottom = -120; this.scene.add(this.sun);
    this.setLoad(0.42, 'folding roads into meadows…');
    this.world = new ChunkManager(this.scene, this.player, this.quality);
    this.particles = new ParticleSystem(this.scene, this.quality === 'low' ? 1000 : 2000);
    this.floaters = new FloatingText(dmgLayer, this.camera, this.quality === 'low' ? 36 : 64);
    this.addStarfield();
    this.makeShared();
    this.makeMotes();
    this.world.update(this.player.pos, 1, 4.5);
    this.player.setSolids(this.world.collectSolids(this.player.pos.x, this.player.pos.z, this.solids));
    this.setLoad(0.72, 'teaching enemies to resent beauty…');
    this.setupPost();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.setQualityButtons();
    this.setLoad(1, 'ready');
    await new Promise(r => setTimeout(r, 160));
    setScreen(startEl); this.mode = 'title'; hudEl.classList.add('hidden');
    this.updateSaveChip();
    requestAnimationFrame((t) => this.frame(t));
  }
  setLoad(p, text) { loadFill.style.width = `${Math.round(p * 100)}%`; loadText.textContent = text; }
  addStarfield() {
    const n = this.quality === 'low' ? 700 : 1700;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const tint = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * TAU, r = Math.sqrt(1 - u * u);
      const R = randRange(300, 620);
      pos[i * 3] = Math.cos(a) * r * R; pos[i * 3 + 1] = Math.abs(u) * R * 0.9 + 40; pos[i * 3 + 2] = Math.sin(a) * r * R;
      tint.setHSL(randRange(0.5, 0.72), 0.6, randRange(0.6, 0.92));
      col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.stars = new THREE.Points(geo, mat); this.stars.frustumCulled = false; this.scene.add(this.stars);
  }
  makeShared() {
    // enemy health bars (drawn through walls, billboarded each frame)
    this.barBgGeo = new THREE.PlaneGeometry(1, 0.16);
    this.barFgGeo = new THREE.PlaneGeometry(1, 0.16);
    this.barBgMat = new THREE.MeshBasicMaterial({ color: 0x0a0710, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false });
    this.barFgMat = new THREE.MeshBasicMaterial({ color: 0xff5672, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false });
    // muzzle flash sprite that lives just in front of the camera
    const mfMat = new THREE.SpriteMaterial({ color: 0xaff7ff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
    this.muzzleFlash = new THREE.Sprite(mfMat); this.muzzleFlash.scale.set(0.5, 0.5, 0.5); this.muzzleFlash.renderOrder = 999; this.scene.add(this.muzzleFlash); this.muzzleT = 0;
    this.enemyDarkMat = new THREE.MeshStandardMaterial({ color: 0x0b0812, roughness: 0.7, metalness: 0.2 }); // shared eye material — was re-created every enemy spawn
    this.projectileGeo = new THREE.SphereGeometry(0.18, 10, 6);
    this.enemyProjectileGeo = new THREE.SphereGeometry(0.22, 10, 6);
    this.projectileMat = new THREE.MeshStandardMaterial({ color: 0x9afcff, emissive: 0x62f7ff, emissiveIntensity: 1.8, roughness: 0.25 });
    this.enemyProjectileMat = new THREE.MeshStandardMaterial({ color: 0xff5672, emissive: 0xff2148, emissiveIntensity: 1.8, roughness: 0.25 });
    this.pickupGeos = { heart: new THREE.SphereGeometry(0.32, 10, 6), energy: new THREE.OctahedronGeometry(0.3, 0), awe: new THREE.IcosahedronGeometry(0.26, 0) };
    this.pickupMats = new Map();
    this.enemyGeos = {
      brute: new THREE.IcosahedronGeometry(1.2, 1), body: new THREE.SphereGeometry(0.72, 14, 8), ring: new THREE.TorusGeometry(1.1, 0.06, 8, 30),
      blade: new THREE.BoxGeometry(0.18, 1.8, 0.18), eye: new THREE.SphereGeometry(0.18, 8, 5),
      spike: new THREE.ConeGeometry(0.34, 1.5, 7), shell: new THREE.IcosahedronGeometry(0.86, 0), crown: new THREE.TorusGeometry(1.0, 0.1, 8, 22)
    };
    dirDmg.innerHTML = '<div class="arc"></div>';
    this.dirArc = dirDmg.querySelector('.arc');
  }
  makeHealthBar() {
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(this.barBgGeo, this.barBgMat); bg.scale.set(1.16, 1.0, 1); bg.renderOrder = 996; bar.add(bg);
    const pivot = new THREE.Group(); pivot.position.x = -0.5;
    const fg = new THREE.Mesh(this.barFgGeo, this.barFgMat); fg.position.x = 0.5; fg.renderOrder = 997; pivot.add(fg);
    bar.add(pivot); bar.userData.pivot = pivot;
    bar.visible = false; this.scene.add(bar);
    return bar;
  }
  // ---- combat feedback ----
  markHit(crit) {
    this.chHitTimer = 0.14;
    crosshairEl.classList.remove('hitmark'); void crosshairEl.offsetWidth; crosshairEl.classList.add('hitmark');
    this.audio.tone(crit ? 1180 : 920, 0.03, 'square', crit ? 0.04 : 0.028, 0.7);
  }
  markKill() {
    crosshairEl.classList.add('killmark');
    clearTimeout(this._killT); this._killT = setTimeout(() => crosshairEl.classList.remove('killmark'), 220);
  }
  flashMuzzle() {
    if (!this.muzzleFlash) return;
    const look = this.player.lookVector(this._muzzleLook ||= new THREE.Vector3());
    this.muzzleFlash.position.copy(this.camera.position).addScaledVector(look, 1.1).addScaledVector(this.player.right, 0.18).addScaledVector(this._down ||= new THREE.Vector3(0, -1, 0), 0.12);
    this.muzzleFlash.material.opacity = 0.9;
    this.muzzleFlash.scale.setScalar(randRange(0.5, 0.75));
    this.muzzleT = 0.06;
  }
  onPlayerHurt(amount, source) {
    this.shake = Math.max(this.shake, 0.66);
    this.hitStop = Math.max(this.hitStop, 0.045);
    damageVignette.classList.add('active');
    clearTimeout(this._dmgVigT); this._dmgVigT = setTimeout(() => damageVignette.classList.remove('active'), 160);
    this.floaters?.spawn((this._hurtFloat ||= new THREE.Vector3()).copy(this.player.pos).addScaledVector(this.player.forward, 1.4).setY(this.player.pos.y + 1.7), `-${Math.round(amount)}`, 'player');
    if (source) {
      const to = this.tmpV ||= new THREE.Vector3();
      to.copy(source).sub(this.player.pos); to.y = 0;
      const fwd = to.dot(this.player.forward), rgt = to.dot(this.player.right);
      const ang = Math.atan2(rgt, fwd);
      if (this.dirArc) { this.dirArc.style.transform = `rotate(${(ang * 180 / Math.PI).toFixed(0)}deg)`; this.dirArc.classList.add('show'); }
      this.dirDmgTimer = 0.7;
    }
  }
  setupPost() {
    const pass = new RenderPass(this.scene, this.camera);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(pass);
    if (this.quality !== 'low') {
      // medium runs bloom at half resolution (~1/4 the fill cost) so the neon glow stays without the full-res hit
      const bs = this.quality === 'high' ? 1 : 0.5;
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * bs, innerHeight * bs), this.quality === 'high' ? 0.54 : 0.34, 0.68, 0.34);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, this.quality === 'high' ? 1.25 : this.quality === 'medium' ? 0.9 : 0.82);
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.composer?.setSize(innerWidth, innerHeight);
    const bs = this.quality === 'high' ? 1 : 0.5;
    this.bloom?.setSize(innerWidth * bs, innerHeight * bs);
  }
  setQualityButtons() {
    document.querySelectorAll('[data-quality]').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.quality === this.quality);
      btn.addEventListener('click', () => {
        this.quality = btn.dataset.quality;
        save.quality = this.quality; storeSave(); localStorage.setItem(QUALITY_KEY, this.quality);
        document.querySelectorAll('[data-quality]').forEach(b => b.classList.toggle('selected', b.dataset.quality === this.quality));
        this.toast('Graphics quality saved. Reloading applies it cleanly, because WebGL is a fussy Victorian widow.');
      });
    });
  }
  updateSaveChip() { saveChip.textContent = save.runs ? `best ${formatMeters(save.best)} · ${save.discoveries || 0} wonders` : 'new run'; }
  startRun() {
    this.audio.start();
    this.mode = 'play'; setScreen(null); hide(startEl); show(hudEl); if (IS_TOUCH) show(touchEl);
    this.player.reset(); this.player.pos.set(0, this.world.heightAt(0, 10), 10); this.player.yaw = Math.PI; this.player.pitch = -0.04;
    this.clearActors();
    this._ghostPct = null; this.lowHp = false; lowHpVignette.classList.remove('active'); healthMeterEl?.classList.remove('low');
    this.hitStop = 0; this.dirDmgTimer = 0; this.spawnTimer = 1.8; if (this.dirArc) this.dirArc.classList.remove('show');
    touchInteractBtn.classList.add('hidden');
    this.run = { start: performance.now(), awe: 0, xp: 0, nextXp: 70, kills: 0, upgrades: 0, distance: 0, combo: 0, comboTimer: 0 };
    this.guardSpawned = new Set(); // POIs whose wardens have already been roused this run
    this.world.buildQueue.length = 0; this.world.buildSet.clear();
    this.world.update(this.player.pos, 1, 4.5);
    this.player.setSolids(this.world.collectSolids(this.player.pos.x, this.player.pos.z, this.solids));
    this.toast(choice(START_HINTS), 2.9);
    requestPointerLockSafe();
  }
  clearActors() {
    for (const e of this.enemies) { if (e.mesh) { this.scene.remove(e.mesh); e.mat?.dispose?.(); e.mesh.traverse?.(o => { if (o.material && o.material !== e.mat && o.material !== this.enemyDarkMat) o.material.dispose?.(); }); } if (e.bar) this.scene.remove(e.bar); }
    for (const arr of [this.projectiles, this.enemyProjectiles, this.pickups]) for (const o of arr) if (o.mesh) this.scene.remove(o.mesh);
    this.projectiles.length = this.enemyProjectiles.length = this.enemies.length = this.pickups.length = 0;
    this.input.shoot = this.input.slash = false; this.input.fireQueued = this.input.slashQueued = this.input.dashQueued = this.input.jumpQueued = this.input.surgeQueued = this.input.interactQueued = 0;
    this.floaters?.clear();
  }
  togglePause() {
    if (this.mode === 'play') this.pause(); else if (this.mode === 'pause') this.resume();
  }
  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'pause'; document.exitPointerLock?.(); pauseStats.textContent = this.runSummary(); setScreen(pauseEl);
  }
  resume() {
    if (this.mode !== 'pause') return;
    this.mode = 'play'; setScreen(null); show(hudEl); requestPointerLockSafe(); this.last = performance.now();
  }
  title() { this.mode = 'title'; document.exitPointerLock?.(); setScreen(startEl); hide(hudEl); hide(touchEl); this.updateSaveChip(); }
  die() {
    this.mode = 'death'; document.exitPointerLock?.();
    save.runs++; save.best = Math.max(save.best || 0, this.run.distance); save.totalAwe = (save.totalAwe || 0) + Math.floor(this.run.awe); storeSave();
    deathStats.textContent = this.runSummary(); setScreen(deathEl); hide(touchEl);
  }
  runSummary() { return `${formatMeters(this.run.distance)} from the center · ${this.run.kills} kills · ${this.run.upgrades} upgrades · ${Math.floor(this.run.awe)} awe stolen`; }
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    let dt = Math.min(0.033, Math.max(0.001, (t - this.last) / 1000)); this.last = t;
    const realDt = dt;
    if (this.hitStop > 0) { this.hitStop = Math.max(0, this.hitStop - realDt); dt *= 0.16; }
    if (this.bulletTime > 0) { this.bulletTime = Math.max(0, this.bulletTime - realDt); dt *= 0.4; } // Slow Light dash
    if (this.mode === 'play') this.update(dt);
    this.render(realDt);
  }
  update(dt) {
    this.clock += dt;
    const p = this.player;
    this.world.update(p.pos, 1, this.quality === 'low' ? 2.4 : 3.8);
    p.setSolids(this.world.collectSolids(p.pos.x, p.pos.z, this.solids));
    this.nearActive = this.world.activeNear(p.pos.x, p.pos.z);
    this.destructibles = this.nearActive.destructibles;
    const preVy = p.vel.y, wasAir = !p.onGround;
    p.update(dt, this.input, (x, z) => this.world.heightAt(x, z), this.audio, this.particles);
    // Gravity Sermon: a hard landing erupts a shockwave. Slow Light: dashing dilates time.
    if (p.slam && wasAir && p.onGround && preVy < -10) this.groundSlam(preVy);
    if (p.timeDodge && p.dashTime > 0 && this._prevDash <= 0) this.bulletTime = Math.max(this.bulletTime, 0.42);
    this._prevDash = p.dashTime;
    this.applyRailAssist(dt);
    this.handlePlayerAttacks(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateDestructibles(dt);
    this.handleInteractions(dt);
    this.particles.update(dt);
    this.updateMotes(dt);
    this.floaters.update(dt);
    this.updateEnvironment(dt);
    this.updateFeedback(dt);
    this.updateHud(dt);
    this.run.distance = Math.max(this.run.distance, Math.hypot(p.pos.x, p.pos.z));
    this.run.comboTimer = Math.max(0, this.run.comboTimer - dt);
    if (this.run.comboTimer <= 0) this.run.combo = Math.max(0, this.run.combo - dt * 1.5);
    if (p.hp <= 0) { if (p.revive > 0 && !p.usedRevive) this.triggerRevive(); else this.die(); }
  }
  triggerRevive() {
    const p = this.player; p.usedRevive = true; p.revive--;
    p.hp = Math.max(1, Math.round(p.maxHp * 0.4)); p.energy = p.maxEnergy; p.iframes = 2.0;
    for (const b of this.enemyProjectiles) b.life = Math.min(b.life, 0.04);
    this.particles.spawn((this._reviveFx ||= new THREE.Vector3()).set(p.pos.x, p.pos.y + 1, p.pos.z), 0xffd36e, 80, 2.0);
    this.particles.spawn(this._reviveFx, 0xffffff, 30, 1.2);
    this.shake = Math.max(this.shake, 0.8); this.hitStop = Math.max(this.hitStop, 0.08); this.audio.upgrade();
    this.toast('Second Verse. The killing blow lands and you simply refuse the punctuation.', 3.2);
  }
  groundSlam(vy) {
    const p = this.player, power = clamp(-vy / 18, 0.5, 2.2);
    const radius = (6 + p.slam * 2.6) * power, dmg = (26 + p.slam * 14) * power;
    for (const e of this.enemies) if (!e.dead && e.pos.distanceTo(p.pos) < radius + e.radius) { this.damageEnemy(e, dmg, p.pos, 0xffd36e, { crit: true }); e.slow = Math.max(e.slow, 1.0); }
    for (const d of this.destructibles) if (!d.dead && d.pos.distanceTo(p.pos) < radius + d.radius) this.damageDestructible(d, dmg, p.pos, { crit: true });
    this.particles.spawn((this._slamFx ||= new THREE.Vector3()).set(p.pos.x, p.pos.y + 0.2, p.pos.z), 0xffd36e, 50, 1.8);
    this.shake = Math.max(this.shake, 0.6); this.hitStop = Math.max(this.hitStop, 0.05); this.audio.tone(70, 0.3, 'sine', 0.09, 2.4);
  }
  // Arc Catechism: a hit forks lightning to nearby enemies, each jump drawing a crackle of sparks.
  arcChain(src, jumps, dmg) {
    let from = src; const hit = new Set([src]);
    const fx = this._arcFx ||= new THREE.Vector3();
    for (let j = 0; j < jumps; j++) {
      let best = null, bd = 13 * 13;
      for (const e of this.enemies) { if (e.dead || hit.has(e)) continue; const dx = e.pos.x - from.pos.x, dy = e.pos.y - from.pos.y, dz = e.pos.z - from.pos.z; const dd = dx * dx + dy * dy + dz * dz; if (dd < bd) { bd = dd; best = e; } }
      if (!best) break;
      for (let s = 1; s <= 5; s++) { const t = s / 5; fx.set(lerp(from.pos.x, best.pos.x, t) + randRange(-0.3, 0.3), lerp(from.pos.y, best.pos.y, t) + randRange(-0.3, 0.3), lerp(from.pos.z, best.pos.z, t) + randRange(-0.3, 0.3)); this.particles.spawn(fx, 0x9afcff, 2, 0.3); }
      this.damageEnemy(best, dmg, from.pos, 0x9afcff); hit.add(best); from = best;
    }
    this.audio.tone(900, 0.05, 'square', 0.03, 1.2);
  }
  updateEnvironment(dt) {
    const b = this.world.biomeAt(this.player.pos.x, this.player.pos.z);
    const info = BIOMES[b];
    this.scene.fog.color.lerp(info._fogColor, dt * 1.2);
    this.scene.background.lerp(info._skyColor, dt * 0.9);
    const dist = Math.hypot(this.player.pos.x, this.player.pos.z);
    this.scene.fog.density = lerp(this.scene.fog.density, clamp(0.0042 - this.player.viewBonus * 0.000006 + dist * 0.00000055, this.quality === 'high' ? 0.0018 : 0.0034, 0.0075), dt * 0.7);
    const sunA = this.clock * 0.025 + dist * 0.0007;
    this.sun.position.set(Math.cos(sunA) * 120, 90 + Math.sin(sunA * 0.47) * 30, Math.sin(sunA) * 120);
    this.audio.update(b, Math.hypot(this.player.vel.x, this.player.vel.z), dt);
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) toastEl.classList.remove('active'); }
    if (this.realizationTimer > 0) { this.realizationTimer -= dt; if (this.realizationTimer <= 0) realizationLog.classList.remove('active'); }
    // keep the starfield centered on the camera so it reads as the distant sky
    if (this.stars) { this.stars.position.copy(this.camera.position); this.stars.rotation.y = this.clock * 0.003; }
  }
  updateFeedback(dt) {
    const p = this.player;
    // dynamic crosshair: expand on fire, turn cyan when an enemy is under the reticle, flash on hits
    this.chHitTimer = Math.max(0, this.chHitTimer - dt);
    const look = p.lookVector(this._chLook ||= new THREE.Vector3());
    let onEnemy = false, onBreakable = false, onInteract = !!this.nearest, bestDot = 0.985;
    const eye = this.camera.position;
    const to = this._chTo ||= new THREE.Vector3();
    for (const e of this.enemies) {
      if (e.dead) continue;
      to.copy(e.pos).sub(eye);
      const d = to.length(); if (d <= 0.001 || d > 120) continue;
      const dot = to.multiplyScalar(1 / d).dot(look);
      if (dot > bestDot) { bestDot = dot; onEnemy = true; }
    }
    if (!onEnemy) for (const d of this.destructibles) {
      if (d.dead) continue;
      to.copy(d.pos).sub(eye);
      const dist = to.length(); if (dist > 85) continue;
      const dot = to.multiplyScalar(1 / Math.max(dist, 0.001)).dot(look);
      if (dot > 0.987) { onBreakable = true; break; }
    }
    const fireKick = (p.shotCd > 0.07) ? 0.28 : 0;
    this.chScale = lerp(this.chScale, 1 + fireKick + (this.chHitTimer > 0 ? 0.3 : 0) + (onInteract ? 0.08 : 0), Math.min(1, dt * 22));
    crosshairEl.style.setProperty('--ch-scale', this.chScale.toFixed(3));
    const chCol = onEnemy ? 'rgba(255,90,114,.95)' : onInteract ? INTERACT_RETICLE : onBreakable ? BREAKABLE_RETICLE : 'rgba(255,255,255,.55)';
    crosshairEl.style.setProperty('--ch-color', chCol);
    // directional damage arc fades out
    if (this.dirDmgTimer > 0) { this.dirDmgTimer -= dt; if (this.dirDmgTimer <= 0 && this.dirArc) this.dirArc.classList.remove('show'); }
    // low-hp heartbeat
    const low = p.hp / p.maxHp < 0.3 && p.hp > 0;
    if (low !== this.lowHp) { this.lowHp = low; lowHpVignette.classList.toggle('active', low); healthMeterEl?.classList.toggle('low', low); }
    // muzzle flash fade
    if (this.muzzleT > 0) { this.muzzleT -= dt; this.muzzleFlash.material.opacity = Math.max(0, this.muzzleFlash.material.opacity - dt * 14); }
  }
  // Drifting ambient glow motes — a cheap THREE.Points cloud that bobs around the player and
  // wraps to stay near them, so the air always shimmers with bioluminescent spores.
  makeMotes() {
    const N = this.quality === 'low' ? 28 : this.quality === 'medium' ? 56 : 84;
    const pos = new Float32Array(N * 3);
    this.moteData = [];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = randRange(-58, 58); pos[i * 3 + 1] = randRange(0.6, 22); pos[i * 3 + 2] = randRange(-58, 58);
      this.moteData.push({ phase: Math.random() * TAU, sp: randRange(0.3, 0.8) });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xbff0ff, size: 0.42, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.motes = new THREE.Points(g, m); this.motes.frustumCulled = false; this.scene.add(this.motes);
  }
  updateMotes(dt) {
    if (!this.motes) return;
    const arr = this.motes.geometry.attributes.position.array, px = this.player.pos.x, pz = this.player.pos.z;
    for (let i = 0; i < this.moteData.length; i++) {
      const d = this.moteData[i], j = i * 3; d.phase += dt * d.sp;
      arr[j] += Math.sin(d.phase) * dt * 0.7; arr[j + 1] += Math.cos(d.phase * 0.7) * dt * 0.5; arr[j + 2] += Math.cos(d.phase) * dt * 0.7;
      if (arr[j] - px > 58) arr[j] -= 116; else if (arr[j] - px < -58) arr[j] += 116;
      if (arr[j + 2] - pz > 58) arr[j + 2] -= 116; else if (arr[j + 2] - pz < -58) arr[j + 2] += 116;
      if (arr[j + 1] > 24) arr[j + 1] = 0.6; else if (arr[j + 1] < 0.4) arr[j + 1] = 24;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
  }
  applyRailAssist(dt) {
    const active = this.nearActive || this.world.activeNear(this.player.pos.x, this.player.pos.z);
    let best = null, bestD = Infinity;
    const ab = this._railAb ||= new THREE.Vector3();
    const ap = this._railAp ||= new THREE.Vector3();
    const cp = this._railCp ||= new THREE.Vector3();
    const bestPoint = this._railBestPoint ||= new THREE.Vector3();
    const bestDir = this._railBestDir ||= new THREE.Vector3();
    for (const r of active.rails) {
      const points = r.points || [r.start, r.end];
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        ab.subVectors(b, a);
        const lenSq = Math.max(0.0001, ab.lengthSq());
        ap.subVectors(this.player.pos, a);
        const t = clamp(ap.dot(ab) / lenSq, 0, 1);
        cp.copy(a).addScaledVector(ab, t);
        const d = cp.distanceTo(this.player.pos);
        if (d < bestD) {
          bestD = d; best = r;
          bestPoint.copy(cp);
          bestDir.copy(ab).multiplyScalar(1 / Math.sqrt(lenSq));
        }
      }
    }
    if (best) {
      const radius = best.radius || 11;
      if (bestD < radius) {
        const near = 1 - bestD / radius;
        const look = this.player.lookVector(this._railLook ||= new THREE.Vector3());
        const along = Math.sign(bestDir.dot(this.player.vel)) || Math.sign(bestDir.dot(look)) || 1;
        const sprinting = this.input.keys.ShiftLeft || this.input.keys.ShiftRight || this.player.dashTime > 0 || IS_TOUCH;
        const pull = this.player.railPull * (sprinting ? 1.0 : 0.62) * (0.55 + near);
        const center = (this._railCenter ||= new THREE.Vector3()).copy(bestPoint).sub(this.player.pos);
        if (center.lengthSq() > 0.0001) this.player.vel.addScaledVector(center.normalize(), (10 + this.player.railPull * 0.35) * near * dt);
        this.player.vel.addScaledVector(bestDir, along * pull * dt);
        // strong vertical snap so the rail actually lifts you on (beats gravity), and a gentle
        // assist-up when you're just below it so you can hop on from underneath
        const railDy = bestPoint.y - this.player.pos.y;
        this.player.vel.y += railDy * dt * (9 + near * 8);
        if (railDy > 0 && this.player.vel.y < 0) this.player.vel.y *= 0.4;
        if (railDy > 0.1) this.player.vel.y += (4 + near * 4) * dt;
        if (Math.random() < dt * (16 + near * 18)) this.particles.spawn((this._railFx ||= new THREE.Vector3()).set(this.player.pos.x, this.player.pos.y + 1.2, this.player.pos.z), best.color, 2, 0.45, bestDir);
      }
    }
  }

  findAimTarget(origin, look, cone = 0.982, range = 118) {
    let best = null, bestScore = cone;
    const to = this._aimTo ||= new THREE.Vector3();
    for (const e of this.enemies) {
      if (e.dead) continue;
      to.copy(e.pos).sub(origin);
      const d = to.length(); if (d <= 0.001 || d > range) continue;
      const dot = to.multiplyScalar(1 / d).dot(look);
      const score = dot + e.radius * 0.002 - d * 0.00065;
      if (dot > cone && score > bestScore) { bestScore = score; best = e.pos; }
    }
    for (const d of this.destructibles) {
      if (d.dead) continue;
      to.copy(d.pos).sub(origin);
      const dist = to.length(); if (dist <= 0.001 || dist > Math.min(range, 86)) continue;
      const dot = to.multiplyScalar(1 / dist).dot(look);
      const score = dot + d.radius * 0.0015 - dist * 0.0008;
      if (dot > Math.max(cone, 0.986) && score > bestScore) { bestScore = score; best = d.pos; }
    }
    return best;
  }
  handlePlayerAttacks(dt) {
    const p = this.player;
    this.autoFireCd = Math.max(0, this.autoFireCd - dt);
    // auto-aim (touch): shoot when a living enemy sits within a forward cone and range, so the thumb stays free
    let wantFire = this.input.shoot || this.input.consumeFire();
    if (this.input.autoFire && !wantFire && this.autoFireCd <= 0) {
      const look = p.lookVector(this._afLook ||= new THREE.Vector3());
      const eye = this.camera.position;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const to = (this._afTo ||= new THREE.Vector3()).copy(e.pos).sub(eye);
        const d = to.length(); if (d > 90) continue;
        if (to.divideScalar(d).dot(look) > 0.9) { wantFire = true; break; }
      }
    }
    if (wantFire && p.shotCd <= 0 && p.energy >= 3) {
      p.shotCd = 0.13; p.energy -= 3; this.fireProjectile(false); this.audio.shoot(); this.flashMuzzle();
      if (this.input.autoFire) this.autoFireCd = 0.04;
    }
    if ((this.input.consumeSlash() || this.input.slash) && p.slashCd <= 0 && p.energy >= 12) {
      p.slashCd = 0.48; p.energy -= 12; this.slash();
    }
    if (this.input.consumeSurge() && p.surgeCd <= 0 && p.energy >= 45) {
      p.surgeCd = 3.5; p.energy -= 45; this.surge();
    }
    if (p.dashTime > 0) {
      for (const e of this.enemies) if (!e.dead && e.pos.distanceTo(p.pos) < e.radius + 2.0) this.damageEnemy(e, p.dashDamage * dt * 8, p.pos, 0x62f7ff, { tick: true });
      for (const d of this.destructibles) if (!d.dead && d.pos.distanceTo(p.pos) < d.radius + 1.6) this.damageDestructible(d, p.dashDamage * dt * 10, p.pos, { tick: true });
    }
  }
  fireProjectile(enemy, pos = null, dir = null, kind = 'pulse') {
    const mesh = new THREE.Mesh(enemy ? this.enemyProjectileGeo : this.projectileGeo, enemy ? this.enemyProjectileMat : this.projectileMat);
    const origin = this._shotOrigin ||= new THREE.Vector3();
    const look = this._shotLook ||= new THREE.Vector3();
    if (pos) origin.copy(pos); else origin.copy(this.camera.position).addScaledVector(this.player.lookVector(look), 0.9);
    const vdir = this._shotDir ||= new THREE.Vector3();
    if (dir) vdir.copy(dir).normalize(); else {
      this.player.lookVector(vdir);
      const assisted = this.findAimTarget(origin, vdir, IS_TOUCH ? 0.955 : 0.982, IS_TOUCH ? 120 : 110);
      if (assisted) vdir.copy(assisted).sub(origin).normalize();
    }
    mesh.position.copy(origin); this.scene.add(mesh);
    const vel = vdir.clone().multiplyScalar(enemy ? 23 : 58);
    if (!enemy) vel.addScaledVector(this.player.vel, 0.35);
    const obj = { mesh, vel, life: enemy ? 4.2 : 2.3, damage: enemy ? 10 : this.player.shotDamage, radius: enemy ? 0.36 : 0.42, enemy, kind };
    (enemy ? this.enemyProjectiles : this.projectiles).push(obj);
  }
  slash() {
    const p = this.player;
    const dir = p.lookVector(this._slashDir ||= new THREE.Vector3());
    const base = (this._slashBase ||= new THREE.Vector3()).copy(this.camera.position);
    const to = this._slashTo ||= new THREE.Vector3();
    let hit = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      to.copy(e.pos).sub(base); const d = to.length();
      if (d > p.slashRange + e.radius) continue;
      const angle = to.multiplyScalar(1 / Math.max(d, 0.001)).dot(dir);
      if (angle > 0.45) { this.damageEnemy(e, p.slashDamage * (0.75 + angle * 0.4), p.pos, 0xffd36e, { crit: true }); hit++; }
    }
    for (const d of this.destructibles) {
      if (d.dead) continue;
      to.copy(d.pos).sub(base); const dd = to.length();
      if (dd > p.slashRange + d.radius) continue;
      if (to.multiplyScalar(1 / Math.max(dd, 0.001)).dot(dir) > 0.4) this.damageDestructible(d, p.slashDamage, p.pos, { crit: true });
    }
    p.energy = Math.min(p.maxEnergy, p.energy + hit * 8);
    this.audio.slash(); this.shake = Math.max(this.shake, hit ? 0.32 : 0.18);
    this.particles.spawn(base.addScaledVector(dir, 2.2), 0xffd36e, 32, 1.1, dir);
  }
  surge() {
    const p = this.player; let hit = 0;
    for (const e of this.enemies) if (!e.dead && e.pos.distanceTo(p.pos) < p.surgeRadius + e.radius) { this.damageEnemy(e, p.surgeDamage, p.pos, 0xbbe9ff, { crit: true }); e.slow = Math.max(e.slow, 1.6); hit++; }
    // also shatter nearby destructibles caught in the blast
    for (const dst of this.destructibles) if (!dst.dead && dst.pos.distanceTo(p.pos) < p.surgeRadius + dst.radius) this.breakDestructible(dst, p.pos);
    for (const b of this.enemyProjectiles) b.life = Math.min(b.life, 0.04);
    this.audio.tone(88, 0.42, 'sine', 0.09, 2.6);
    this.particles.spawn((this._surgePos ||= new THREE.Vector3()).set(p.pos.x, p.pos.y + 1.2, p.pos.z), 0xbbe9ff, 90, 1.75);
    this.shake = Math.max(this.shake, 0.7);
    if (hit >= 4) this.toast('Surge ate the room. Extremely rude. Beautifully constitutional.');
  }
  spawnEnemy() {
    const p = this.player.pos;
    const angle = Math.random() * TAU;
    const dist = randRange(44, 94);
    const x = p.x + Math.cos(angle) * dist, z = p.z + Math.sin(angle) * dist;
    const biome = this.world.biomeAt(x, z);
    this.spawnEnemyAt(choice(BIOMES[biome].enemy), x, z, biome);
  }
  // Build one enemy of a given type at a world position (used for ambient spawns, POI guardians,
  // and spore splits). Returns the enemy record.
  spawnEnemyAt(type, x, z, biome) {
    const stat = ENEMY[type] || ENEMY.mote;
    const y = this.world.heightAt(x, z) + stat.spawnY;
    const mesh = this.makeEnemyMesh(type, biome);
    mesh.position.set(x, y, z); mesh.scale.setScalar(0.01); this.scene.add(mesh);
    this.particles.spawn((this._spawnFx ||= new THREE.Vector3()).set(x, y, z), BIOMES[biome].accent, 12, 0.8);
    const fullHp = stat.hp + this.run.distance * (stat.boss ? 0.05 : 0.01);
    const e = { type, biome, mesh, pos: mesh.position, vel: new THREE.Vector3(), hp: fullHp, maxHp: fullHp, radius: stat.radius, fireCd: randRange(0.3, 1.8), hurt: 0, dead: false, slow: 0, phase: Math.random() * TAU, mat: mesh.userData.mat, baseEmissive: mesh.userData.mat.emissiveIntensity, emColor: mesh.userData.mat.emissive.clone(), flash: 0, bar: null, barTimer: 0, telegraph: 0, born: this.clock, windup: 0, chargeT: 0, chargeCd: randRange(1.6, 3.0), chargeDir: new THREE.Vector3(), burst: 0, burstCd: 0, boss: !!stat.boss };
    this.enemies.push(e);
    return e;
  }
  makeEnemyMesh(type, biome) {
    const info = BIOMES[biome];
    const stat = ENEMY[type] || ENEMY.mote;
    const group = new THREE.Group();
    const color = stat.color === 'accent' ? info.accent : stat.color;
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: type === 'mote' ? 0.9 : 1.35, roughness: 0.36, metalness: 0.05 });
    const dark = this.enemyDarkMat; // shared (the per-enemy animated material is `mat`, kept per-instance)
    const bodyGeo = (type === 'brute' || type === 'warden') ? this.enemyGeos.brute : type === 'spore' ? this.enemyGeos.shell : this.enemyGeos.body;
    const body = new THREE.Mesh(bodyGeo, mat); group.add(body);
    if (type === 'warden') body.scale.setScalar(1.5);
    if (type === 'sentinel' || type === 'orbiter' || type === 'warden') { const ring = new THREE.Mesh(this.enemyGeos.ring, mat); ring.rotation.x = Math.PI / 2; if (type === 'warden') ring.scale.setScalar(1.6); group.add(ring); group.userData.ring = ring; }
    if (type === 'duelist') { const blade = new THREE.Mesh(this.enemyGeos.blade, mat); blade.position.set(0.85, 0, 0); blade.rotation.z = 0.6; group.add(blade); }
    if (type === 'lancer') { const spike = new THREE.Mesh(this.enemyGeos.spike, mat); spike.position.set(0, 0, -0.78); spike.rotation.x = -Math.PI / 2; group.add(spike); }
    if (type === 'spore') for (let i = 0; i < 3; i++) { const nub = new THREE.Mesh(this.enemyGeos.eye, mat); const a = i / 3 * TAU; nub.position.set(Math.cos(a) * 0.72, 0.2, Math.sin(a) * 0.72); nub.scale.setScalar(1.4); group.add(nub); }
    if (type === 'warden') { const crown = new THREE.Mesh(this.enemyGeos.crown, mat); crown.rotation.x = Math.PI / 2; crown.position.y = 1.2; crown.scale.setScalar(1.5); group.add(crown); }
    const eye = new THREE.Mesh(this.enemyGeos.eye, dark); eye.position.set(0, type === 'warden' ? 0.34 : 0.15, type === 'warden' ? -1.05 : -0.62); if (type === 'warden') eye.scale.setScalar(1.8); group.add(eye);
    group.traverse(o => { if (o.isMesh) { o.castShadow = this.quality === 'high' && !IS_TOUCH; o.receiveShadow = this.quality !== 'low'; } });
    group.userData.mat = mat; group.userData.body = body;
    return group;
  }
  updateEnemies(dt) {
    this.spawnTimer -= dt;
    const maxEnemies = this.quality === 'low' ? 12 : 22 + Math.min(10, Math.floor(this.run.distance / 220));
    if (this.spawnTimer <= 0 && this.enemies.length < maxEnemies) { this.spawnTimer = randRange(0.38, 1.1); this.spawnEnemy(); }
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.hurt = Math.max(0, e.hurt - dt); e.slow = Math.max(0, e.slow - dt);
      e.flash = Math.max(0, e.flash - dt * 6); e.barTimer = Math.max(0, e.barTimer - dt); e.telegraph = Math.max(0, e.telegraph - dt * 2.2);
      const stat = ENEMY[e.type] || ENEMY.mote;
      const to = (this._enemyTo ||= new THREE.Vector3()).copy(p.pos).sub(e.pos); const d = Math.max(0.001, to.length()); const dir = to.multiplyScalar(1 / d);
      const slowMul = e.slow > 0 ? 0.42 : 1;
      let desired = (this._enemyDesired ||= new THREE.Vector3()).set(0, 0, 0);
      if (e.type === 'sentinel') {
        const tangent = (this._enemyTangent ||= new THREE.Vector3()).set(-dir.z, 0, dir.x).multiplyScalar(Math.sin(this.clock + e.phase) > 0 ? 1 : -1);
        desired.addScaledVector(dir, d > 22 ? 9 : d < 13 ? -7 : 0).addScaledVector(tangent, 8);
        e.fireCd -= dt;
        if (e.fireCd < 0.5 && d < 80) e.telegraph = 1;
        if (e.fireCd <= 0 && d < 80) {
          e.fireCd = randRange(1.1, 2.2);
          const shotDir = (this._enemyShotDir ||= new THREE.Vector3()).set(p.pos.x, p.pos.y + 1.1, p.pos.z).sub(e.pos);
          this.fireProjectile(true, e.pos, shotDir);
        }
      } else if (e.type === 'brute') {
        desired.addScaledVector(dir, d > 10 ? 6.0 : 1.5); // slower, especially up close — kiteable now
        if (d < 5.6) e.telegraph = 1;                     // telegraphs from farther so you can read it
        if (d < 2.1 && p.hurt(stat.contact, e.pos, this)) p.hp = 0;
      } else if (e.type === 'duelist') {
        const tangent = (this._enemyTangent ||= new THREE.Vector3()).set(-dir.z, 0, dir.x).multiplyScalar(Math.sin(this.clock * 2.1 + e.phase));
        desired.addScaledVector(dir, d > 5 ? 11 : -3).addScaledVector(tangent, 4);
        if (d < 4) e.telegraph = 1;
        if (d < 2.3 && p.hurt(stat.contact, e.pos, this)) p.hp = 0;
      } else if (e.type === 'wisp') {
        const weave = (this._enemyTangent ||= new THREE.Vector3()).set(-dir.z, 0, dir.x).multiplyScalar(Math.sin(this.clock * 3.4 + e.phase));
        desired.addScaledVector(dir, 13.5).addScaledVector(weave, 7.5); // fast + erratic
        if (d < 2.2) e.telegraph = 1;
        if (d < 1.35 && p.hurt(stat.contact, e.pos, this)) p.hp = 0;
      } else if (e.type === 'lancer') {
        // hangs at mid-range, winds up with a bright tell, then spears straight through you
        if (e.chargeT > 0) {
          e.chargeT -= dt;
          desired.copy(e.chargeDir).multiplyScalar(30);
          if (d < 2.2 && p.hurt(stat.contact, e.pos, this)) p.hp = 0;
        } else if (e.windup > 0) {
          e.windup -= dt; e.telegraph = 1;
          desired.addScaledVector(dir, -2.0); // brace backward before the lunge
          if (e.windup <= 0) { e.chargeDir.copy(dir); e.chargeT = 0.5; e.chargeCd = randRange(1.9, 3.0); }
        } else {
          e.chargeCd -= dt;
          desired.addScaledVector(dir, d > 16 ? 10 : d < 9 ? -6 : 2);
          if (e.chargeCd <= 0 && d < 30 && d > 7) e.windup = 0.5;
        }
      } else if (e.type === 'orbiter') {
        const tangent = (this._enemyTangent ||= new THREE.Vector3()).set(-dir.z, 0, dir.x).multiplyScalar(Math.sin(this.clock * 0.8 + e.phase) > 0 ? 1 : -1);
        desired.addScaledVector(dir, d > 24 ? 8 : d < 16 ? -7 : 0).addScaledVector(tangent, 9);
        e.fireCd -= dt;
        if (e.fireCd < 0.4 && d < 72) e.telegraph = 1;
        if (e.fireCd <= 0 && d < 72) { e.fireCd = randRange(1.9, 2.9); e.burst = 3; e.burstCd = 0; }
        if (e.burst > 0) { e.burstCd -= dt; if (e.burstCd <= 0) { e.burst--; e.burstCd = 0.15; const sd = (this._enemyShotDir ||= new THREE.Vector3()).set(p.pos.x, p.pos.y + 1.1, p.pos.z).sub(e.pos); this.fireProjectile(true, e.pos, sd); } }
      } else if (e.type === 'spore') {
        const weave = (this._enemyTangent ||= new THREE.Vector3()).set(-dir.z, 0, dir.x).multiplyScalar(Math.sin(this.clock * 1.6 + e.phase));
        desired.addScaledVector(dir, 5.5).addScaledVector(weave, 3.2); // slow, drifting; splits when it dies
        if (d < 3) e.telegraph = 1;
        if (d < 1.7 && p.hurt(stat.contact, e.pos, this)) p.hp = 0;
      } else if (e.type === 'warden') {
        desired.addScaledVector(dir, d > 7 ? 4.2 : 1.2); // big, slow, body-bully boss
        e.fireCd -= dt;
        if (e.fireCd < 0.7) e.telegraph = 1;
        if (e.fireCd <= 0 && d < 95) {
          e.fireCd = randRange(2.4, 3.6);
          for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; const sd = (this._wardenDir ||= new THREE.Vector3()).set(Math.cos(a), 0.05, Math.sin(a)); this.fireProjectile(true, e.pos, sd); } // radial spray
        }
        if (d < 2.8 && p.hurt(stat.contact, e.pos, this)) p.hp = 0;
      } else {
        desired.addScaledVector(dir, 12.5);
        if (d < 3) e.telegraph = 1;
        if (d < 1.55 && p.hurt(stat.contact, e.pos, this)) p.hp = 0;
      }
      desired.multiplyScalar(slowMul);
      e.vel.lerp(desired, Math.min(1, dt * (e.type === 'lancer' && e.chargeT > 0 ? 8 : 2.8)));
      e.pos.addScaledVector(e.vel, dt);
      const ground = this.world.heightAt(e.pos.x, e.pos.z);
      const fly = stat.flier ? stat.fly + Math.sin(this.clock * 2 + e.phase) * 0.7 : stat.fly;
      e.pos.y = lerp(e.pos.y, ground + fly, dt * 5);
      e.mesh.rotation.y = Math.atan2(dir.x, dir.z);
      e.mesh.rotation.x = Math.sin(this.clock * 2.8 + e.phase) * 0.08;
      // hit flash + attack telegraph: white when struck, red pulse while winding up to hit you
      const pulse = e.telegraph > 0 ? (0.5 + 0.5 * Math.sin(this.clock * 26)) * e.telegraph : 0;
      e.mat.emissiveIntensity = e.baseEmissive + e.flash * 4 + pulse * 2.2;
      e.mat.emissive.copy(e.emColor).lerp(WHITE, Math.min(1, e.flash)).lerp(HIT_RED, pulse * 0.85);
      const grow = smoother(clamp((this.clock - e.born) / 0.34, 0, 1));
      e.mesh.scale.setScalar(grow * (1 + e.flash * 0.16) + (1 - grow) * 0.01);
      // floating health bar appears after the enemy is hurt
      if (e.barTimer > 0) {
        if (!e.bar) e.bar = this.makeHealthBar();
        e.bar.visible = true;
        e.bar.position.set(e.pos.x, e.pos.y + e.radius + 0.95, e.pos.z);
        e.bar.quaternion.copy(this.camera.quaternion);
        e.bar.userData.pivot.scale.x = Math.max(0.0001, clamp(e.hp / e.maxHp, 0, 1));
        const s = clamp(e.pos.distanceTo(this.camera.position) * 0.05, 0.85, 2.6);
        e.bar.scale.set(s, s, s);
      } else if (e.bar) { e.bar.visible = false; }
      if (e.pos.distanceTo(p.pos) > 180) e.dead = true;
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) { const e = this.enemies[i]; this.scene.remove(e.mesh); e.mat?.dispose?.(); e.mesh.traverse?.(o => { if (o.material && o.material !== e.mat && o.material !== this.enemyDarkMat) o.material.dispose?.(); }); if (e.bar) this.scene.remove(e.bar); this.enemies.splice(i, 1); }
    }
  }
  updateProjectiles(dt) {
    const trail = this._trailVec ||= new THREE.Vector3();
    const playerHitY = this.player.pos.y + 1.0;
    const updateList = (arr, enemy) => {
      for (const b of arr) {
        // Pilgrim Rounds: player shots bend toward the nearest enemy before they move.
        if (!enemy && this.player.homing > 0 && this.enemies.length) {
          let best = null, bd = 58 * 58;
          for (const e of this.enemies) { if (e.dead) continue; const dx = e.pos.x - b.mesh.position.x, dy = e.pos.y - b.mesh.position.y, dz = e.pos.z - b.mesh.position.z; const dd = dx * dx + dy * dy + dz * dz; if (dd < bd) { bd = dd; best = e; } }
          if (best) { const to = (this._homeVec ||= new THREE.Vector3()).set(best.pos.x - b.mesh.position.x, best.pos.y - b.mesh.position.y, best.pos.z - b.mesh.position.z).normalize(); const sp = b.vel.length(); b.vel.lerp(to.multiplyScalar(sp), Math.min(1, dt * this.player.homing * 3.2)); }
        }
        b.life -= dt; b.mesh.position.addScaledVector(b.vel, dt);
        b.mesh.rotation.y += dt * 6;
        trail.copy(b.vel).normalize().multiplyScalar(-0.4);
        this.particles.spawn(b.mesh.position, enemy ? 0xff5672 : 0x62f7ff, 1, 0.18, trail);
        if (b.mesh.position.y < this.world.heightAt(b.mesh.position.x, b.mesh.position.z) - 1) b.life = 0;
        if (enemy) {
          const dx = b.mesh.position.x - this.player.pos.x, dy = b.mesh.position.y - playerHitY, dz = b.mesh.position.z - this.player.pos.z;
          const rr = b.radius + this.player.radius;
          if (dx * dx + dy * dy + dz * dz < rr * rr) { if (this.player.hurt(b.damage, b.mesh.position, this)) this.player.hp = 0; b.life = 0; }
        } else {
          let consumed = false;
          for (const e of this.enemies) {
            if (e.dead) continue;
            const dx = e.pos.x - b.mesh.position.x, dy = e.pos.y - b.mesh.position.y, dz = e.pos.z - b.mesh.position.z;
            const rr = e.radius + b.radius;
            if (dx * dx + dy * dy + dz * dz < rr * rr) { this.damageEnemy(e, b.damage, b.mesh.position, 0x62f7ff); if (this.player.chain) this.arcChain(e, this.player.chain, b.damage * 0.45); b.life = 0; consumed = true; break; }
          }
          if (!consumed) for (const d of this.destructibles) {
            if (d.dead) continue;
            const dx = d.pos.x - b.mesh.position.x, dy = d.pos.y - b.mesh.position.y, dz = d.pos.z - b.mesh.position.z;
            const rr = d.radius + b.radius;
            if (dx * dx + dy * dy + dz * dz < rr * rr) { this.damageDestructible(d, b.damage, b.mesh.position); b.life = 0; break; }
          }
          // your shots can knock incoming enemy bolts out of the air
          if (b.life > 0) for (const eb of this.enemyProjectiles) {
            if (eb.life <= 0) continue;
            const dx = eb.mesh.position.x - b.mesh.position.x, dy = eb.mesh.position.y - b.mesh.position.y, dz = eb.mesh.position.z - b.mesh.position.z;
            const rr = eb.radius + b.radius;
            if (dx * dx + dy * dy + dz * dz < rr * rr) {
              eb.life = 0; b.life = 0;
              this.particles.spawn(eb.mesh.position, 0xff5672, 12, 0.7);
              this.particles.spawn(eb.mesh.position, 0xffffff, 6, 0.5);
              break;
            }
          }
        }
      }
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i].life <= 0) { this.scene.remove(arr[i].mesh); arr.splice(i, 1); }
    };
    updateList(this.projectiles, false); updateList(this.enemyProjectiles, true);
  }
  damageEnemy(e, amount, source, color = 0xffffff, opts = {}) {
    if (e.dead) return;
    e.hp -= amount; e.hurt = 0.12; e.flash = 1; e.barTimer = 4;
    const knock = (this._knock ||= new THREE.Vector3()).copy(e.pos).sub(source).setY(0); if (knock.lengthSq() > 0.001) e.vel.addScaledVector(knock.normalize(), opts.crit ? 5.2 : 3.8);
    this.particles.spawn(e.pos, color, opts.crit ? 16 : 10, opts.crit ? 1.0 : 0.7);
    if (!opts.tick) {
      this.floaters?.spawn((this._enemyFloat ||= new THREE.Vector3()).set(e.pos.x + randRange(-0.3, 0.3), e.pos.y + e.radius + 0.4, e.pos.z + randRange(-0.3, 0.3)), `${Math.round(amount)}`, opts.crit ? 'crit' : '');
      this.markHit(!!opts.crit);
    }
    if (e.hp <= 0) this.killEnemy(e, source, color);
  }
  killEnemy(e, source, color) {
    if (e.dead) return;
    e.dead = true; this.scene.remove(e.mesh); if (e.bar) e.bar.visible = false;
    // satisfying death burst + brief hit-stop + kill marker
    this.particles.spawn(e.pos, color, e.type === 'brute' ? 46 : 28, 1.5);
    this.particles.spawn(e.pos, 0xffffff, 14, 0.9);
    this.audio.tone(330, 0.16, 'triangle', 0.05, 0.6); this.audio.pickup();
    this.shake = Math.max(this.shake, e.type === 'brute' ? 0.5 : 0.32);
    this.hitStop = Math.max(this.hitStop, e.type === 'brute' ? 0.06 : 0.035);
    this.markKill();
    this.run.kills++; this.run.combo = Math.min(20, this.run.combo + 1); this.run.comboTimer = 3.5;
    if (this.run.combo >= 3) this.showCombo(Math.floor(this.run.combo));
    this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + 8 + this.run.combo * 0.6);
    if (this.player.lifesteal && this.player.hp < this.player.maxHp) { this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.lifesteal); this.floaters?.spawn((this._lsFloat ||= new THREE.Vector3()).set(this.player.pos.x, this.player.pos.y + 1.8, this.player.pos.z), `+${this.player.lifesteal}`, 'heal'); }
    if (Math.random() < this.player.killDashRefund) this.player.dashCd = Math.min(this.player.dashCd, 0.06);
    const drops = e.type === 'brute' ? 8 : e.type === 'sentinel' ? 5 : 3;
    for (let i = 0; i < drops; i++) this.spawnPickup(e.pos, 'awe', e.type === 'brute' ? 8 : 5, color);
    if (Math.random() < 0.06 + this.run.combo * 0.005) this.spawnPickup(e.pos, 'heart', 1, 0xff5672);
    if (Math.random() < this.player.splitChance && performance.now() - this.lastShotSplit > 90) {
      this.lastShotSplit = performance.now();
      for (let i = 0; i < 3; i++) {
        const dir = new THREE.Vector3(Math.cos(i / 3 * TAU + Math.random()), randRange(-0.1, 0.25), Math.sin(i / 3 * TAU + Math.random())).normalize();
        this.fireProjectile(false, e.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), dir, 'split');
      }
    }
    // a popped spore scatters into two skittering motes
    if (e.type === 'spore' && this.enemies.length < 40) {
      for (let i = 0; i < 2; i++) { const a = Math.random() * TAU; this.spawnEnemyAt('mote', e.pos.x + Math.cos(a) * 1.2, e.pos.z + Math.sin(a) * 1.2, e.biome); }
    }
  }
  pickupMaterial(type, color) {
    const key = `${type}:${color}`;
    let mat = this.pickupMats.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: type === 'heart' ? 1.9 : 1.6, roughness: 0.28 });
      this.pickupMats.set(key, mat);
    }
    return mat;
  }
  spawnPickup(pos, type, value = 1, color = 0xffd36e) {
    const geo = this.pickupGeos[type] || this.pickupGeos.awe;
    const mat = this.pickupMaterial(type, color);
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(pos.x + randRange(-1, 1), pos.y + randRange(0.6, 2.2), pos.z + randRange(-1, 1)); this.scene.add(mesh);
    const vel = new THREE.Vector3(randRange(-3, 3), randRange(2, 6), randRange(-3, 3));
    this.pickups.push({ mesh, type, value, vel, life: 16, color, shared: true });
  }
  updatePickups(dt) {
    const p = this.player;
    const to = this._pickupTo ||= new THREE.Vector3();
    const targetY = p.pos.y + 1.0;
    for (const pk of this.pickups) {
      pk.life -= dt;
      to.set(p.pos.x - pk.mesh.position.x, targetY - pk.mesh.position.y, p.pos.z - pk.mesh.position.z);
      const d = to.length();
      if (d < p.pickupMagnet && d > 0.001) pk.vel.addScaledVector(to.multiplyScalar(1 / d), dt * (p.pickupRange + 8));
      pk.vel.y -= 7 * dt; pk.vel.multiplyScalar(1 - Math.min(0.7, dt * 1.4)); pk.mesh.position.addScaledVector(pk.vel, dt);
      const ground = this.world.heightAt(pk.mesh.position.x, pk.mesh.position.z) + 0.28;
      if (pk.mesh.position.y < ground) { pk.mesh.position.y = ground; pk.vel.y = Math.abs(pk.vel.y) * 0.24; }
      pk.mesh.rotation.y += dt * 3; pk.mesh.rotation.x += dt * 2.2;
      if (d < 1.55) { this.collectPickup(pk); pk.life = 0; }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) if (this.pickups[i].life <= 0) { const pk = this.pickups[i]; this.scene.remove(pk.mesh); if (!pk.shared) { pk.mesh.geometry.dispose(); pk.mesh.material.dispose(); } this.pickups.splice(i, 1); }
  }
  collectPickup(pk) {
    if (pk.type === 'heart') { this.player.hp = Math.min(this.player.maxHp, this.player.hp + 16); this.floaters?.spawn(pk.mesh.position, '+16', 'heal'); }
    else if (pk.type === 'energy') { this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + 24); this.floaters?.spawn(pk.mesh.position, '+EN', 'dest'); }
    else { this.run.awe += pk.value; this.run.xp += pk.value * (1 + this.run.combo * 0.04); }
    this.audio.pickup(); this.particles.spawn(pk.mesh.position, pk.color, 8, 0.5);
    if (this.run.xp >= this.run.nextXp) { this.run.xp -= this.run.nextXp; this.run.nextXp = Math.round(this.run.nextXp * 1.28 + 22); this.openUpgrade('combat'); }
  }
  updateDestructibles(dt) {
    for (const d of this.destructibles) {
      if (d.dead || !d.mesh) continue;
      d.t += dt;
      if (d.kind === 'pod') { d.mesh.rotation.y += dt * 0.9; d.mesh.position.y = d.baseY + Math.sin(d.t * 2.2) * 0.12; }
      else if (d.kind !== 'rock') d.mesh.rotation.y += dt * 0.34;
      const pulse = d.kind === 'rock' ? 1 + d.hitT * 0.16 : 1 + Math.sin(d.t * 2.7) * 0.035 + d.hitT * 0.18;
      if (d.baseScale) d.mesh.scale.copy(d.baseScale).multiplyScalar(pulse);
      if (d.hitT > 0) { d.hitT = Math.max(0, d.hitT - dt * 6); }
    }
  }
  damageDestructible(d, amount, source, opts = {}) {
    if (d.dead) return;
    d.hp -= amount; d.hitT = 1;
    this.particles.spawn(d.pos, d.color, opts.crit ? 12 : 7, opts.crit ? 0.9 : 0.6);
    if (!opts.tick) { this.floaters?.spawn((this._destFloat ||= new THREE.Vector3()).set(d.pos.x, d.pos.y + d.radius * 0.6 + 0.3, d.pos.z), `${Math.round(amount)}`, 'dest'); this.markHit(false); }
    if (d.hp <= 0) this.breakDestructible(d, source);
  }
  breakDestructible(d, source) {
    if (d.dead) return;
    d.dead = true;
    if (d.mesh && d.mesh.parent) d.mesh.parent.remove(d.mesh);
    this.particles.spawn(d.pos, d.color, d.kind === 'pod' ? 40 : 26, 1.3);
    this.particles.spawn(d.pos, 0xffffff, 10, 0.7);
    this.audio.tone(d.kind === 'rock' ? 150 : 520, 0.12, d.kind === 'rock' ? 'square' : 'triangle', 0.045, d.kind === 'rock' ? 0.7 : 1.4);
    this.shake = Math.max(this.shake, 0.22);
    const drop = d.drop || {};
    for (let i = 0; i < (drop.awe || 0); i++) this.spawnPickup(d.pos, 'awe', 3, d.color);
    if (Math.random() < (drop.heart || 0)) this.spawnPickup(d.pos, 'heart', 1, 0xff5672);
    if (Math.random() < (drop.energy || 0)) this.spawnPickup(d.pos, 'energy', 1, 0x62f7ff);
  }
  handleInteractions(dt) {
    const active = (this.nearActive || this.world.activeNear(this.player.pos.x, this.player.pos.z)).interactables;
    let nearest = null, dBest = Infinity;
    for (const it of active) {
      const d = it.pos.distanceTo(this.player.pos);
      // Points of interest are discovered Bethesda-style — just by walking up to them; their
      // guardians stir as you close in. They never take an E-prompt, so handle and skip here.
      if (it.type === 'poi') {
        if (!save.seen[it.key] && d < it.discoverR) this.discoverPOI(it);
        if (it.guarded && d < 46 && !this.guardSpawned.has(it.key)) { this.guardSpawned.add(it.key); this.spawnGuards(it); }
        continue;
      }
      const radius = it.radius + (it.type === 'vista' ? this.player.senseRange * 0.02 : 0);
      if (d < radius && d < dBest) { nearest = it; dBest = d; }
      if (it.type === 'home' && d < it.radius) this.player.hp = Math.min(this.player.maxHp, this.player.hp + dt * (this.player.homeHeal * 0.22));
      if (it.type === 'water' && d < it.radius && this.player.upgrades.oasis) this.player.hp = Math.min(this.player.maxHp, this.player.hp + dt * 2.2 * this.player.upgrades.oasis);
    }
    this.nearest = nearest;
    if (nearest) {
      promptEl.innerHTML = IS_TOUCH ? nearest.label : `<b>E</b> — ${nearest.label}`; promptEl.classList.add('active');
      if (IS_TOUCH) { touchInteractBtn.classList.remove('hidden'); if (touchInteractLabel) touchInteractLabel.textContent = nearest.label.split(' ').slice(0, 2).join(' '); }
      if (this.input.consumeInteract()) this.useInteractable(nearest);
    } else {
      promptEl.classList.remove('active'); promptEl.textContent = '';
      if (IS_TOUCH) touchInteractBtn.classList.add('hidden');
      this.input.consumeInteract();
    }
  }
  useInteractable(it) {
    if (it.type === 'home') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.homeHeal + 20);
      this.player.energy = this.player.maxEnergy;
      if (!save.seen[it.key]) { save.seen[it.key] = 1; save.discoveries = (save.discoveries || 0) + 1; storeSave(); this.showRealization('A warm room is proof that scale lies. The universe can be enormous and still lose an argument to one lamp.'); }
      else this.toast('The lit house remembers you. Health and energy restored.');
      this.audio.upgrade(); return;
    }
    if (it.type === 'water') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12); this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + 28);
      this.toast(it.label.includes('ocean') ? 'The coast says the old thing again: keep moving, but not because you are being chased.' : 'The oasis puts a cold hand on the back of your neck and refuses to explain itself.');
      this.audio.pickup(); return;
    }
    if (it.type === 'vista') {
      if (!save.seen[it.key]) { save.seen[it.key] = 1; save.discoveries = (save.discoveries || 0) + 1; storeSave(); this.openUpgrade('vista'); }
      else this.showRealization(choice(REALIZATIONS));
      return;
    }
  }
  discoverPOI(it) {
    save.seen[it.key] = 1; save.discoveries = (save.discoveries || 0) + 1; storeSave();
    this.run.awe += 14;
    this.toast(`Discovered: ${it.name}`, 3.6);
    this.showRealization(it.note || choice(REALIZATIONS));
    this.audio.upgrade();
    this.shake = Math.max(this.shake, 0.2);
    this.particles.spawn((this._poiFx ||= new THREE.Vector3()).copy(it.pos), 0xffd36e, 30, 1.3);
  }
  spawnGuards(it) {
    const biome = this.world.biomeAt(it.pos.x, it.pos.z);
    this.spawnEnemyAt('warden', it.pos.x, it.pos.z, biome);
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; this.spawnEnemyAt(choice(BIOMES[biome].enemy), it.pos.x + Math.cos(a) * 6, it.pos.z + Math.sin(a) * 6, biome); }
    this.toast(`A warden stirs at ${it.name}.`, 3.0);
  }
  openUpgrade(reason = 'vista') {
    if (this.mode !== 'play') return;
    this.mode = 'upgrade'; document.exitPointerLock?.(); setScreen(upgradeEl); hide(touchEl);
    const r = choice(REALIZATIONS);
    upgradeTitle.textContent = reason === 'combat' ? 'You fought hard enough to understand something.' : 'The atlas hands you a better law.';
    upgradeText.textContent = r;
    const pool = UPGRADE_POOL.filter(u => (this.player.upgrades[u.id] || 0) < 5);
    const cards = [];
    while (cards.length < 3 && pool.length) {
      const i = Math.floor(Math.random() * pool.length); cards.push(pool.splice(i, 1)[0]);
    }
    upgradeCards.innerHTML = '';
    cards.forEach(card => {
      const btn = document.createElement('button'); btn.className = 'upgrade-card'; btn.type = 'button';
      btn.innerHTML = `<p class="kicker">${card.tag}</p><h2>${card.name}</h2><p>${this.flavorFor(card.id)}</p><p class="effect">${card.effect}</p>`;
      btn.addEventListener('click', () => this.chooseUpgrade(card, r));
      upgradeCards.appendChild(btn);
    });
  }
  flavorFor(id) {
    const map = {
      velocity: 'Your legs stop asking permission from the pavement.', dash: 'Distance becomes a negotiable little bastard.', glide: 'Gravity remembers it was supposed to be a conversation.', hearth: 'Lit windows become coordinates, not decoration.', mirror: 'Your shots learn the ugly social habit of multiplying.', oasis: 'The body becomes less fragile in places that should kill it.', magnet: 'The city starts throwing its loose change into your ribs.', slash: 'Close range stops being panic and becomes punctuation.', surge: 'Weather briefly joins your side of the argument.', shield: 'Pain gets a smaller office and worse lighting.', rail: 'The lightlines decide your momentum is legally delicious.', vista: 'The horizon gets less stingy.',
      chain: 'Your aim develops a gossip problem; everyone nearby hears about it.', homing: 'Your bullets convert to a faith and go looking for sinners.', slam: 'You start charging the ground rent for your descent.', timeDodge: 'The dash buys a half-second the rest of the world has to honor.', lifesteal: 'Every kill leaves a small, warm tip in your chest.', revive: 'The story keeps a spare line for you, used once, without comment.'
    };
    return map[id] || 'The atlas improves one of your verbs.';
  }
  chooseUpgrade(card, realization) {
    card.apply(this.player); this.run.upgrades++; this.audio.upgrade(); this.showRealization(realization); this.mode = 'play'; setScreen(null); show(hudEl); if (IS_TOUCH) show(touchEl); else requestPointerLockSafe();
    if (this.run.upgrades % 4 === 0) { this.toast('The atlas noticed you improving and sent a larger objection. Reasonable. Petty, but reasonable.'); for (let i = 0; i < 4; i++) this.spawnEnemy(); }
  }
  showRealization(text) { realizationLog.textContent = text; realizationLog.classList.add('active'); this.realizationTimer = 6.2; }
  showCombo(n) { comboFlash.textContent = `${n}× combo`; comboFlash.classList.remove('pop'); void comboFlash.offsetWidth; comboFlash.classList.add('pop'); }
  toast(text, seconds = 3.7) { toastEl.textContent = text; toastEl.classList.add('active'); this.toastTimer = seconds; }
  updateHud(dt) {
    const p = this.player; const biome = this.world.biomeAt(p.pos.x, p.pos.z);
    const hpPct = clamp(p.hp / p.maxHp, 0, 1) * 100;
    hpFill.style.width = `${hpPct}%`; hpText.textContent = `${Math.max(0, Math.ceil(p.hp))}/${Math.ceil(p.maxHp)}`;
    // the ghost bar trails behind on damage to show what was just lost
    if (this._ghostPct == null) this._ghostPct = hpPct;
    if (this._ghostPct > hpPct) this._ghostPct = Math.max(hpPct, this._ghostPct - dt * 45);
    else this._ghostPct = hpPct;
    if (hpGhost) hpGhost.style.width = `${this._ghostPct}%`;
    energyFill.style.width = `${clamp(p.energy / p.maxEnergy, 0, 1) * 100}%`; energyText.textContent = `${Math.ceil(p.energy)}`;
    biomeReadout.textContent = `${BIOMES[biome].label} · ${formatMeters(this.run.distance)} from center`;
    statsEl.innerHTML = `kills ${this.run.kills}<br>awe ${Math.floor(this.run.awe)}<br>combo x${Math.max(1, this.run.combo).toFixed(1)}<br>upgrades ${this.run.upgrades}`;
    // Reuse the neighborhood scan update() already did this frame (this.nearActive) instead
    // of rebuilding the 25-chunk active set a second time per frame just for the HUD compass.
    const active = (this.nearActive || this.world.activeNear(p.pos.x, p.pos.z)).interactables;
    let nearest = null, best = Infinity;
    for (const it of active) if (!save.seen[it.key] && it.type !== 'water') { const d = it.pos.distanceTo(p.pos); if (d < best && d < p.senseRange + 160) { best = d; nearest = it; } }
    if (nearest) {
      const dx = nearest.pos.x - p.pos.x, dz = nearest.pos.z - p.pos.z;
      const angle = Math.atan2(dx, dz) + p.yaw;
      const arrows = ['↑','↗','→','↘','↓','↙','←','↖'];
      const idx = Math.round((((angle % TAU) + TAU) % TAU) / TAU * 8) % 8;
      compassEl.textContent = `${arrows[idx]} wonder ${formatMeters(best)}`;
    } else compassEl.textContent = 'no nearby wonder';
    // minimap refresh (throttled — the canvas is small but there's no need to redraw every frame)
    this.miniT = (this.miniT || 0) - dt;
    if (this.miniT <= 0) { this.miniT = 0.07; this.drawMinimap(); }
  }
  drawMinimap() {
    const cv = minimapEl; if (!cv) return;
    const ctx = this._miniCtx || (this._miniCtx = cv.getContext('2d'));
    if (!ctx) return;
    const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = Math.min(cx, cy) - 2;
    const p = this.player, range = 190, scale = R / range;
    const px = p.pos.x, pz = p.pos.z;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    // biome-tinted backdrop
    const info = BIOMES[this.world.biomeAt(px, pz)];
    const g = this.tmpColor2 || (this.tmpColor2 = new THREE.Color());
    g.set(info.sky);
    ctx.fillStyle = `rgba(${Math.round(g.r * 80 + 6)},${Math.round(g.g * 80 + 6)},${Math.round(g.b * 90 + 10)},0.82)`;
    ctx.fillRect(0, 0, W, H);
    // faint range rings
    ctx.strokeStyle = 'rgba(191,240,255,0.10)'; ctx.lineWidth = 1;
    for (let rr = R / 3; rr < R; rr += R / 3) { ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); }
    const active = this.nearActive || this.world.activeNear(px, pz);
    const onMap = (wx, wz) => { const bx = cx + (wx - px) * scale, by = cy + (wz - pz) * scale; return (bx - cx) * (bx - cx) + (by - cy) * (by - cy) <= R * R ? [bx, by] : null; };
    // rails as faint cyan threads
    ctx.strokeStyle = 'rgba(98,247,255,0.30)'; ctx.lineWidth = 1.4;
    for (const r of active.rails) {
      const a = onMap(r.start.x, r.start.z), b = onMap(r.end.x, r.end.z);
      if (a && b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    }
    // enemies (boss bigger)
    for (const e of this.enemies) {
      if (e.dead) continue; const m = onMap(e.pos.x, e.pos.z); if (!m) continue;
      ctx.fillStyle = e.boss ? '#ff3b5e' : 'rgba(255,96,118,0.85)';
      ctx.beginPath(); ctx.arc(m[0], m[1], e.boss ? 3.6 : 2, 0, TAU); ctx.fill();
    }
    // interactables: POIs (diamonds), shrines/landmarks (dots), homes (squares), water (faint)
    for (const it of active.interactables) {
      const m = onMap(it.pos.x, it.pos.z); if (!m) continue; const seen = !!save.seen[it.key];
      if (it.type === 'poi') {
        ctx.lineWidth = 1.4; ctx.strokeStyle = seen ? '#ffd36e' : 'rgba(255,211,110,0.6)'; ctx.fillStyle = '#ffd36e';
        const s = seen ? 4.2 : 3.6; ctx.beginPath(); ctx.moveTo(m[0], m[1] - s); ctx.lineTo(m[0] + s, m[1]); ctx.lineTo(m[0], m[1] + s); ctx.lineTo(m[0] - s, m[1]); ctx.closePath();
        if (seen) ctx.fill(); else ctx.stroke();
      } else if (it.type === 'vista') {
        ctx.fillStyle = seen ? 'rgba(159,116,255,0.75)' : '#cda6ff'; ctx.beginPath(); ctx.arc(m[0], m[1], 2.2, 0, TAU); ctx.fill();
      } else if (it.type === 'home') {
        ctx.fillStyle = '#ffb66e'; ctx.fillRect(m[0] - 2, m[1] - 2, 4, 4);
      } else if (it.type === 'water') {
        ctx.fillStyle = 'rgba(98,247,255,0.30)'; ctx.beginPath(); ctx.arc(m[0], m[1], 2, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    // ring border + player arrow (north-up; arrow rotates to facing)
    ctx.strokeStyle = 'rgba(191,240,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw)) + Math.PI / 2);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.4, 5); ctx.lineTo(0, 2.4); ctx.lineTo(-4.4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  render(dt) {
    if (!this.renderer) return;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.shake > 0.001 && this.mode === 'play') {
      const s = this.shake * 0.055;
      this.camera.position.x += randRange(-s, s); this.camera.position.y += randRange(-s, s); this.camera.position.z += randRange(-s, s);
    }
    this.composer ? this.composer.render() : this.renderer.render(this.scene, this.camera);
  }
}

const game = new Game();
// Debug handle only when explicitly asked for (?debug) — not exposed on the public build.
if (new URLSearchParams(location.search).has('debug')) window.__ATLAS = game;

playBtn.addEventListener('click', () => game.startRun());
resumeBtn.addEventListener('click', () => game.resume());
backToStartBtn.addEventListener('click', () => game.title());
retryBtn.addEventListener('click', () => game.startRun());
deathTitleBtn.addEventListener('click', () => game.title());
resetBtn.addEventListener('click', () => { localStorage.removeItem(SAVE_KEY); save = loadSave(); game.updateSaveChip(); game.toast('Save reset. The atlas politely pretends it never saw you naked.'); });

// Keep load screen visible until init either succeeds or the browser admits defeat.
game.init().catch((err) => {
  console.error(err);
  setScreen(webglError);
  webglError.querySelector('.lede').textContent = `The game failed during startup: ${err?.message || err}`;
});
