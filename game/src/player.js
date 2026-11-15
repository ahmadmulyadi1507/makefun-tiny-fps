// The player body: acceleration-based movement with friction, crouching and
// jumping, resolved against the world's axis-aligned colliders as a vertical
// capsule approximated by a circle in XZ. No new allocations in the hot path:
// velocity and the scratch vectors live on the state.
import * as THREE from 'three';

const RADIUS = 0.36;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.05;
const GRAVITY = 22;
const JUMP_SPEED = 7.2;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(0, 0, 13),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: EYE_STAND,
    crouched: false,
    onGround: true,
    hp: 100,
    armor: 0,
    alive: true,
  };
  const scratch = new THREE.Vector3();

  function collides(x, z) {
    for (const b of colliders) {
      if (state.position.y + 1.7 < b.min.y || state.position.y + 0.1 > b.max.y) continue;
      const cx = Math.max(b.min.x, Math.min(x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(z, b.max.z));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < RADIUS * RADIUS) return true;
    }
    return false;
  }

  function moveAxis(dx, dz) {
    const nx = state.position.x + dx;
    if (!collides(nx, state.position.z)) state.position.x = nx;
    const nz = state.position.z + dz;
    if (!collides(state.position.x, nz)) state.position.z = nz;
  }

  function step(dt, keys) {
    if (!state.alive) return;
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const crouch = keys.has('ControlLeft') || keys.has('KeyC');
    state.crouched = crouch;
    const targetEye = crouch ? EYE_CROUCH : EYE_STAND;
    state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);

    let forward = 0;
    let strafe = 0;
    if (keys.has('KeyW')) forward += 1;
    if (keys.has('KeyS')) forward -= 1;
    if (keys.has('KeyD')) strafe += 1;
    if (keys.has('KeyA')) strafe -= 1;
    const moving = forward !== 0 || strafe !== 0;
    const speed = crouch ? 2.1 : sprint ? 6.4 : 4.6;
    const accel = state.onGround ? 42 : 12;

    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    // Forward is -Z rotated by yaw; strafe is +X rotated by yaw.
    const wx = (-sin * forward + cos * strafe);
    const wz = (-cos * forward - sin * strafe);
    const len = Math.hypot(wx, wz) || 1;
    const tx = (wx / len) * speed * (moving ? 1 : 0);
    const tz = (wz / len) * speed * (moving ? 1 : 0);

    state.velocity.x += (tx - state.velocity.x) * Math.min(1, accel * dt / speed * 4.6);
    state.velocity.z += (tz - state.velocity.z) * Math.min(1, accel * dt / speed * 4.6);
    // Friction when no input.
    if (!moving) {
      const f = Math.max(0, 1 - dt * 10);
      state.velocity.x *= f;
      state.velocity.z *= f;
    }

    moveAxis(state.velocity.x * dt, state.velocity.z * dt);

    if (keys.has('Space') && state.onGround) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    state.velocity.y -= GRAVITY * dt;
    state.position.y += state.velocity.y * dt;
    if (state.position.y <= 0) {
      state.position.y = 0;
      state.velocity.y = 0;
      state.onGround = true;
    }
    // Stay inside the yard.
    state.position.x = Math.max(-21.4, Math.min(21.4, state.position.x));
    state.position.z = Math.max(-14.4, Math.min(14.4, state.position.z));
  }

  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch -= dy * 0.0021;
    state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch += pitchKick;
    state.yaw += yawKick;
    state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch));
  }

  function groundSpeed() {
    scratch.set(state.velocity.x, 0, state.velocity.z);
    return scratch.length();
  }

  function reset(x, z, yaw) {
    state.position.set(x, 0, z);
    state.velocity.set(0, 0, 0);
    state.yaw = yaw;
    state.pitch = 0;
    state.hp = 100;
    state.armor = 0;
    state.alive = true;
    state.eye = EYE_STAND;
  }

  return { state, step, look, recoil, groundSpeed, reset };
}
