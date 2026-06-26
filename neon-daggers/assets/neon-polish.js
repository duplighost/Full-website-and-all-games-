(() => {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const forceTouch = new URLSearchParams(location.search).has('touch');
  const coarse = forceTouch || matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  if (forceTouch) document.documentElement.classList.add('force-touch');

  function boot() {
    const game = window.__game;
    if (!game || !game.stage || !game.input) { setTimeout(boot, 40); return; }

    tuneRenderer(game);
    tuneFlow(game);
    wireStability(game);
    wireKeyboardStart(game);
    if (coarse) wireTouch(game);
  }

  function tuneRenderer(game) {
    const stage = game.stage;
    const baseCap = coarse ? 0.95 : 1.12;
    let cap = Math.min(devicePixelRatio || 1, baseCap);
    const floor = coarse ? 0.62 : 0.72;

    const applyCap = (next) => {
      cap = clamp(next, floor, baseCap);
      stage.renderer?.setPixelRatio?.(cap);
      stage.composer?.setPixelRatio?.(cap);
      if (stage.crt?.uniforms?.uGrain) stage.crt.uniforms.uGrain.value = coarse ? 0.026 : 0.032;
      if (stage.crt?.uniforms?.uScanline) stage.crt.uniforms.uScanline.value = coarse ? 0.11 : 0.14;
      if (stage.crt?.uniforms?.uAberration) stage.crt.uniforms.uAberration.value = coarse ? 0.0008 : 0.00105;
    };

    const rawResize = stage.resize?.bind(stage);
    if (rawResize && !stage.__polishedResize) {
      stage.resize = () => { rawResize(); applyCap(cap); };
      stage.__polishedResize = true;
    }
    applyCap(cap);
    rawResize?.();

    let avg = 16.7, last = performance.now(), lastCut = last;
    const watch = (now) => {
      if (document.hidden) { last = now; requestAnimationFrame(watch); return; }
      const dt = now - last; last = now;
      if (dt > 0 && dt < 120) avg = avg * 0.94 + dt * 0.06;
      if (dt > 80 && cap > floor + 0.02) { applyCap(cap - 0.18); lastCut = now; }
      if (now - lastCut > 1800) {
        if (avg > 25 && cap > floor + 0.02) { applyCap(cap - 0.12); lastCut = now; }
        else if (avg < 18 && cap < baseCap - 0.08) { applyCap(cap + 0.035); lastCut = now; }
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }

  function tuneFlow(game) {
    if (game.__polishedFlow) return;
    game.__polishedFlow = true;
    const restart = game.restart.bind(game);
    game.restart = () => {
      restart();
      game.player.invuln = Math.max(game.player.invuln || 0, 1.05);
      game.director.spawnTimer = Math.max(game.director.spawnTimer || 0, 1.35);
      game.comboTimer = Math.max(game.comboTimer || 0, 0.2);
    };
  }

  function wireStability(game) {
    if (game.__polishedStability) return;
    game.__polishedStability = true;
    const clearInput = () => {
      const input = game.input;
      if (!input) return;
      input.lmb = false;
      input.rmb = false;
      input.lmbPressedThisFrame = false;
      input.lmbReleasedThisFrame = false;
      input._touchFireHeld = false;
      input.keys?.clear?.();
    };
    addEventListener('blur', clearInput);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
  }

  function wireKeyboardStart(game) {
    addEventListener('keydown', (ev) => {
      if ((ev.code === 'Enter' || ev.code === 'Space') && game.state === 0) {
        ev.preventDefault();
        game.start();
      }
    }, { passive: false });
  }

  function wireTouch(game) {
    if (document.getElementById('touch-neon')) return;
    const input = game.input;
    input._touchAxis = { x: 0, z: 0 };
    const moveAxis = input.moveAxis.bind(input);
    input.moveAxis = () => {
      const k = moveAxis();
      return { x: clamp(k.x + input._touchAxis.x, -1, 1), z: clamp(k.z + input._touchAxis.z, -1, 1) };
    };

    const layer = document.createElement('div');
    layer.id = 'touch-neon';
    layer.className = 'touch-neon hidden';
    layer.innerHTML = `
      <div class="touch-look" aria-hidden="true"></div>
      <div class="touch-stick" aria-label="move"><span></span></div>
      <div class="touch-actions" aria-hidden="false">
        <button class="touch-act fire" data-act="fire" aria-label="fire">◉</button>
        <button class="touch-act dash" data-act="dash" aria-label="dash">»</button>
        <button class="touch-act jump" data-act="jump" aria-label="hop">⤒</button>
        <button class="touch-act heavy" data-act="heavy" aria-label="heavy blast">◆</button>
        <button class="touch-act bomb" data-act="bomb" aria-label="neon bomb">✦</button>
      </div>`;
    document.getElementById('app')?.appendChild(layer);

    const stick = layer.querySelector('.touch-stick');
    const knob = stick.querySelector('span');
    const look = layer.querySelector('.touch-look');
    let stickId = null, lookId = null, lastX = 0, lastY = 0, lookMoved = 0, lookStarted = 0;
    const pressFire = () => {
      if (!input._touchFireHeld) input.lmbPressedThisFrame = true;
      input._touchFireHeld = true;
      input.lmb = true;
    };
    const releaseFire = () => {
      if (!input._touchFireHeld && !input.lmb) return;
      input._touchFireHeld = false;
      input.lmb = false;
      input.lmbReleasedThisFrame = true;
    };

    const updateVisibility = () => {
      layer.classList.toggle('hidden', game.state !== 1);
      requestAnimationFrame(updateVisibility);
    };
    updateVisibility();

    const setAxis = (ev) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = ev.clientX - cx, dy = ev.clientY - cy;
      const len = Math.hypot(dx, dy), max = r.width * 0.34;
      const k = len > max ? max / len : 1;
      const nx = clamp(dx / max, -1, 1), nz = clamp(dy / max, -1, 1);
      input._touchAxis.x = nx;
      input._touchAxis.z = nz;
      knob.style.transform = `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`;
    };
    const clearAxis = () => {
      input._touchAxis.x = 0; input._touchAxis.z = 0;
      knob.style.transform = 'translate(0px, 0px)';
      stickId = null;
    };

    stick.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); stickId = ev.pointerId; stick.setPointerCapture(stickId); setAxis(ev);
    }, { passive: false });
    stick.addEventListener('pointermove', (ev) => { if (ev.pointerId === stickId) setAxis(ev); }, { passive: false });
    stick.addEventListener('pointerup', clearAxis, { passive: false });
    stick.addEventListener('pointercancel', clearAxis, { passive: false });

    look.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); lookId = ev.pointerId; look.setPointerCapture(lookId);
      lastX = ev.clientX; lastY = ev.clientY; lookMoved = 0; lookStarted = performance.now();
    }, { passive: false });
    look.addEventListener('pointermove', (ev) => {
      if (ev.pointerId !== lookId) return;
      const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
      lastX = ev.clientX; lastY = ev.clientY; lookMoved += Math.abs(dx) + Math.abs(dy);
      input.mouseDX += dx * 1.15; input.mouseDY += dy * 1.15;
    }, { passive: false });
    look.addEventListener('pointerup', (ev) => {
      if (ev.pointerId !== lookId) return;
      if (lookMoved < 11 && performance.now() - lookStarted < 240 && game.state === 1) {
        pressFire();
        setTimeout(releaseFire, 70);
      }
      lookId = null;
    }, { passive: false });
    look.addEventListener('pointercancel', () => { lookId = null; }, { passive: false });

    const pulseKey = (code, ms = 120) => { input.keys.add(code); setTimeout(() => input.keys.delete(code), ms); };
    layer.querySelectorAll('.touch-act').forEach((btn) => {
      btn.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        const act = btn.dataset.act;
        if (act === 'fire') pressFire();
        if (act === 'dash') pulseKey('ShiftLeft', 150);
        if (act === 'jump') pulseKey('Space', 130);
        if (act === 'heavy') { input.rmb = true; setTimeout(() => { input.rmb = false; }, 90); }
        if (act === 'bomb') game._bomb?.();
        btn.classList.add('down');
      }, { passive: false });
      const up = () => { if (btn.dataset.act === 'fire') releaseFire(); btn.classList.remove('down'); };
      btn.addEventListener('pointerup', up, { passive: false });
      btn.addEventListener('pointercancel', up, { passive: false });
      btn.addEventListener('lostpointercapture', up, { passive: false });
    });
  }

  boot();
})();
