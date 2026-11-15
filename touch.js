// Touch controls for DUSTLINE — Yard 7: a virtual joystick (left), drag-to-look
// (right half), and FIRE / JUMP / RELOAD / PLANT / BUY buttons. The UI is built
// only on touch devices and never in ?shot= staging mode, so desktop play and
// the deterministic screenshots are untouched. It drives the same input state
// the keyboard/mouse path uses (input.state.keys, input.state.firing and the
// look deltas drained by takeLook), so no game logic changes.
export function createTouch(input) {
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const shot = new URLSearchParams(window.location.search).has('shot');
  if (!isTouch || shot) return { enabled: false };

  const keys = input.state.keys;
  const JOY_RADIUS = 48;
  const DEAD = 0.22;

  // Aim sensitivity: 0.5–2.0, persisted per device.
  let sens = 1;
  try {
    const saved = parseFloat(localStorage.getItem('dustline-sens') ?? '1');
    if (Number.isFinite(saved) && saved >= 0.5 && saved <= 2) sens = saved;
  } catch { /* storage unavailable: keep 1 */ }

  // --- DOM ---------------------------------------------------------------
  const ui = document.createElement('div');
  ui.id = 'touch-ui';
  ui.innerHTML = `
    <div id="joy-base"><div id="joy-knob"></div></div>
    <button id="btn-pause" type="button" aria-label="Pause">II</button>
    <button id="btn-fire" type="button" aria-label="Fire">FIRE</button>
    <button id="btn-jump" type="button" aria-label="Jump">JUMP</button>
    <button id="btn-reload" type="button" aria-label="Reload">RLD</button>
    <button id="btn-plant" type="button" aria-label="Plant or defuse">PLANT</button>
    <button id="btn-buy" type="button" aria-label="Buy menu">BUY</button>`;
  document.body.appendChild(ui);

  const joyBase = ui.querySelector('#joy-base');
  const joyKnob = ui.querySelector('#joy-knob');

  // Touch-appropriate start copy and no keyboard hints on touch screens.
  const hint = document.getElementById('hint');
  if (hint) hint.style.display = 'none';
  const startCopy = document.getElementById('overlay-copy');
  if (startCopy) startCopy.textContent = 'Plant the charge at Site A or eliminate the Jackals. First to 5 rounds takes the yard. Left stick to move, drag the right side to aim. Tap to play.';
  const playBtn = document.getElementById('play');
  if (playBtn) playBtn.textContent = 'Tap to play';
  const sensRow = document.getElementById('sens-row');
  const sensInput = document.getElementById('sens');
  const sensValue = document.getElementById('sens-value');
  if (sensRow && sensInput) {
    sensRow.hidden = false;
    sensInput.value = String(sens);
    if (sensValue) sensValue.textContent = `${sens.toFixed(1)}×`;
    sensInput.addEventListener('input', () => {
      sens = parseFloat(sensInput.value) || 1;
      if (sensValue) sensValue.textContent = `${sens.toFixed(1)}×`;
      try { localStorage.setItem('dustline-sens', String(sens)); } catch { /* ignore */ }
    });
  }

  // --- Joystick ----------------------------------------------------------
  let joyId = null;
  let joyCenter = { x: 0, y: 0 };
  const joyKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

  function setJoy(dx, dy) {
    const nx = dx / JOY_RADIUS;
    const ny = dy / JOY_RADIUS;
    for (const k of joyKeys) keys.delete(k);
    if (ny < -DEAD) keys.add('KeyW');
    if (ny > DEAD) keys.add('KeyS');
    if (nx > DEAD) keys.add('KeyD');
    if (nx < -DEAD) keys.add('KeyA');
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function joyStart(t) {
    const r = joyBase.getBoundingClientRect();
    joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    joyId = t.identifier;
    setJoy(0, 0);
  }

  function joyMove(t) {
    let dx = t.clientX - joyCenter.x;
    let dy = t.clientY - joyCenter.y;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) {
      dx = (dx / len) * JOY_RADIUS;
      dy = (dy / len) * JOY_RADIUS;
    }
    setJoy(dx, dy);
  }

  function joyEnd() {
    joyId = null;
    for (const k of joyKeys) keys.delete(k);
    joyKnob.style.transform = 'translate(0px, 0px)';
  }

  // --- Look (drag on the right half of the screen) ------------------------
  let lookId = null;
  let lookLast = { x: 0, y: 0 };
  const LOOK_SCALE = 2.2;

  function lookStart(t) {
    lookId = t.identifier;
    lookLast = { x: t.clientX, y: t.clientY };
  }

  function lookMove(t) {
    const dx = t.clientX - lookLast.x;
    const dy = t.clientY - lookLast.y;
    lookLast = { x: t.clientX, y: t.clientY };
    input.state.lookX += dx * LOOK_SCALE * sens;
    input.state.lookY += dy * LOOK_SCALE * sens;
  }

  // --- Buttons ------------------------------------------------------------
  function holdButton(id, on, off) {
    const btn = ui.querySelector(id);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); btn.classList.add('down'); on(); }, { passive: false });
    const end = (e) => { e.preventDefault(); btn.classList.remove('down'); off(); };
    btn.addEventListener('touchend', end, { passive: false });
    btn.addEventListener('touchcancel', end, { passive: false });
    // Keep mouse clicks from double-firing on hybrid devices.
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  }

  function tapButton(id, code) {
    const btn = ui.querySelector(id);
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.add('down');
      setTimeout(() => btn.classList.remove('down'), 150);
      keys.add(code);
      // If the game does not consume it (wrong phase), drop it shortly so
      // it cannot fire later by surprise.
      setTimeout(() => keys.delete(code), 200);
    }, { passive: false });
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  }

  holdButton('#btn-fire', () => { input.state.firing = true; }, () => { input.state.firing = false; });
  holdButton('#btn-jump', () => keys.add('Space'), () => keys.delete('Space'));
  holdButton('#btn-plant', () => keys.add('KeyE'), () => keys.delete('KeyE'));
  tapButton('#btn-reload', 'KeyR');
  tapButton('#btn-buy', 'KeyB');

  // Pause: show the overlay; the overlay's Play button resumes.
  const pauseBtn = ui.querySelector('#btn-pause');
  pauseBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const overlay = document.getElementById('overlay');
    if (overlay && overlay.hidden) {
      // Reuse the HUD's paused copy via a synthetic overlay show: the main
      // loop only shows it on pointer-lock loss, so set the texts directly.
      document.getElementById('overlay-title').textContent = 'Paused';
      document.getElementById('overlay-copy').textContent = 'Tap to resume the round.';
      document.getElementById('play').textContent = 'Resume';
      overlay.hidden = false;
    }
  }, { passive: false });
  pauseBtn.addEventListener('mousedown', (e) => e.preventDefault());

  // --- Routing: touches on the game surface -------------------------------
  function isUiTarget(target) {
    return target.closest('#touch-ui, #overlay, #buy-menu') !== null;
  }

  function nearJoystick(t) {
    const r = joyBase.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return Math.hypot(t.clientX - cx, t.clientY - cy) < 110;
  }

  document.addEventListener('touchstart', (e) => {
    let handled = false;
    for (const t of e.changedTouches) {
      if (isUiTarget(t.target)) continue;
      handled = true;
      if (joyId === null && nearJoystick(t)) joyStart(t);
      else if (lookId === null) lookStart(t);
    }
    if (handled && e.cancelable) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    let handled = false;
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) { joyMove(t); handled = true; }
      else if (t.identifier === lookId) { lookMove(t); handled = true; }
    }
    if (handled && e.cancelable) e.preventDefault();
  }, { passive: false });

  function touchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) joyEnd();
      else if (t.identifier === lookId) lookId = null;
    }
  }
  document.addEventListener('touchend', touchEnd);
  document.addEventListener('touchcancel', touchEnd);
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('#touch-ui')) e.preventDefault();
  });

  return { enabled: true };
}
