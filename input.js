// Input: pointer lock, keyboard set, mouse deltas and fire state. The game
// only reads input while locked (or in screenshot mode, where it is scripted).
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, firing: false, aiming: false, lookX: 0, lookY: 0, locked: false };

  function onKeyDown(e) {
    if (e.code === 'Space') e.preventDefault();
    keys.add(e.code);
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMouseMove(e) {
    if (!state.locked) return;
    state.lookX += e.movementX;
    state.lookY += e.movementY;
  }
  function onMouseDown(e) {
    if (!state.locked) return;
    if (e.button === 0) state.firing = true;
    if (e.button === 2) state.aiming = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) state.firing = false;
    if (e.button === 2) state.aiming = false;
  }
  function onLock() {
    state.locked = document.pointerLockElement === canvas;
    onLockChange(state.locked);
  }
  function onContext(e) { e.preventDefault(); }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);
  canvas.addEventListener('contextmenu', onContext);

  return {
    state,
    requestLock() { canvas.requestPointerLock(); },
    releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    takeLook() {
      const out = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return out;
    },
    consumeKey(code) {
      if (keys.has(code)) { keys.delete(code); return true; }
      return false;
    },
  };
}
