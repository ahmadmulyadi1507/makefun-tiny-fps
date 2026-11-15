// DUSTLINE — Yard 7. Boot, the fixed-step loop, shooting, grenades, the plant
// objective, the buy phase and the round flow. The simulation runs at a fixed
// 60 Hz; rendering runs at the display rate. `?shot=start|play|buy|end&seed=N`
// stages a deterministic frame for screenshots, renders it twice and freezes.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld, SITE_A } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { WEAPONS, GRENADE, ARMOR, damageAtDistance, createViewmodel } from './weapons.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createTouch } from './touch.js';
import { createMatch, startRound, beginLive, endRound, nextRound, awardMoney, FUSE_TIME } from './state.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x272d3a);
scene.fog = new THREE.Fog(new THREE.Color(0x3a3247), 26, 60);

// Dusk sky: a gradient dome (zenith indigo → purple → ember horizon) and a
// low sun disc in the south-west, matching the directional sun. Canvas
// textures only — no network, no new files.
function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#10142a');
  grad.addColorStop(0.35, '#3d3358');
  grad.addColorStop(0.5, '#c96f3e');
  grad.addColorStop(0.58, '#8a4a3a');
  grad.addColorStop(1, '#241f26');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(140, 24, 16),
  new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false }),
);
scene.add(skyDome);
function makeSunTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 220, 160, 1)');
  grad.addColorStop(0.25, 'rgba(255, 170, 90, 0.85)');
  grad.addColorStop(0.6, 'rgba(255, 120, 60, 0.25)');
  grad.addColorStop(1, 'rgba(255, 120, 60, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeSunTexture(), fog: false, depthWrite: false, transparent: true }));
sunSprite.position.set(-70, 22, 70);
sunSprite.scale.setScalar(46);
scene.add(sunSprite);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const effects = createEffects(scene);
const match = createMatch();
const player = createPlayer(world.colliders);
const viewmodel = createViewmodel(camera);
const raycaster = new THREE.Raycaster();
raycaster.far = 140;

// Player hit meshes (for bot shots): head sphere + body cylinder, invisible.
const playerHitGroup = new THREE.Group();
const playerHeadHit = new THREE.Mesh(
  new THREE.SphereGeometry(0.27, 8, 8),
  new THREE.MeshBasicMaterial({ visible: false }),
);
playerHeadHit.position.y = 1.42;
playerHeadHit.userData = { player: true, part: 'head' };
const playerBodyHit = new THREE.Mesh(
  new THREE.CylinderGeometry(0.42, 0.42, 1.15, 8),
  new THREE.MeshBasicMaterial({ visible: false }),
);
playerBodyHit.position.y = 0.85;
playerBodyHit.userData = { player: true, part: 'body' };
playerHitGroup.add(playerHeadHit, playerBodyHit);
scene.add(playerHitGroup);

// Loadout state.
const loadout = {
  weapons: new Set(['pistol']),
  current: 'pistol',
  ammo: { pistol: { mag: 12, reserve: 36 } },
  nades: 0,
  armor: 0,
  reloading: 0,
  fireTimer: 0,
  bloom: 0,
  prevFiring: false,
  aiming: false,
};

const grenades = [];
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2e4d2a, roughness: 0.6, metalness: 0.3 });

let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let buyOpen = false;
let plantProgress = 0;
let plantBeepStep = 0;
let bobPhase = 0;
let spectateBot = null;

// --- Bots ---------------------------------------------------------------
const combat = {
  playerSpeed: () => player.groundSpeed(),
  shoot(from, dir, def, shooter) {
    raycaster.set(from, dir);
    const targets = [];
    for (const b of bots.allBots()) {
      if (b.alive && b !== shooter) targets.push(b.mesh.headHit, b.mesh.bodyHit);
    }
    if (player.state.alive) targets.push(playerHeadHit, playerBodyHit);
    const hits = raycaster.intersectObjects(targets.concat(world.shootables), false);
    const hit = hits[0];
    const end = new THREE.Vector3().copy(from).addScaledVector(dir, def.range);
    if (hit) {
      end.copy(hit.point);
      if (hit.object.userData.bot) {
        const bot = bots.allBots().find((b) => b.mesh.headHit === hit.object || b.mesh.bodyHit === hit.object);
        if (bot) {
          const dist = hit.distance;
          const dmg = damageAtDistance(def, dist) * (hit.object.userData.part === 'head' ? def.headMult : 1);
          bots.damage(bot, dmg, shooter, hit.object.userData.part === 'head');
        }
      } else if (hit.object.userData.player) {
        const dist = hit.distance;
        const dmg = damageAtDistance(def, dist) * (hit.object.userData.part === 'head' ? def.headMult : 1);
        damagePlayer(dmg, shooter);
      } else {
        effects.spark(hit.point);
      }
    }
    effects.tracer(from, end, def.tracer);
    effects.muzzle(from, dir);
    const distToPlayer = from.distanceTo(player.state.position);
    if (distToPlayer < 30) audio.distantShot();
    bots.hearNoise(from.x, from.z);
  },
  plantCharge(by) {
    match.plant.state = 'planted';
    match.plant.fuse = FUSE_TIME;
    match.plant.planter = by.name || 'You';
    audio.plant();
    hud.killfeed(`Charge planted at Site A by ${match.plant.planter}`, 'good');
    hud.setObjective('Charge planted — defend Site A until it detonates');
  },
  defuseCharge(by) {
    match.plant.state = 'defused';
    endRound(match, 'jackals', `Charge defused by ${by.name}`);
    afterRoundEnd();
  },
  onKill(attacker, victim, headshot) {
    const aName = attacker === 'player' || attacker?.isPlayer ? 'You' : attacker?.name ?? 'Unknown';
    const vName = victim.name;
    const team = victim.team === 'jackals' ? 'good' : 'bad';
    hud.killfeed(`${aName} ${headshot ? '◉ ' : ''}▸ ${vName}`, team);
    if (attacker === 'player' || attacker?.isPlayer) {
      awardMoney(match, 300);
      hud.setMoney(match.money);
      audio.kill();
    }
  },
};
const bots = createBots(scene, world, random, combat);

// --- HUD ----------------------------------------------------------------
const hud = createHud({
  onPlay: () => {
    audio.unlock();
    if (match.phase === 'matchEnd') restartMatch();
    else if (!started) { started = true; }
    hud.hideOverlay();
    input.requestLock();
  },
  onBuy: (id) => buyItem(id),
});

function buyItem(id) {
  if (match.phase !== 'buy') return;
  const price = id === 'grenade' ? GRENADE.price : id === 'armor' ? ARMOR.price : WEAPONS[id].price;
  if (match.money < price) return;
  match.money -= price;
  if (id === 'grenade') loadout.nades += 1;
  else if (id === 'armor') { loadout.armor = ARMOR.amount; player.state.armor = ARMOR.amount; }
  else {
    loadout.weapons.add(id);
    loadout.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    switchWeapon(id);
  }
  audio.buy();
  hud.setMoney(match.money);
  hud.showBuy(match.money, { weapons: loadout.weapons, nades: loadout.nades, armor: loadout.armor });
  refreshAmmoHud();
}

function switchWeapon(id) {
  if (!loadout.weapons.has(id)) return;
  loadout.current = id;
  loadout.reloading = 0;
  loadout.bloom = 0;
  viewmodel.build(WEAPONS[id]);
  refreshAmmoHud();
}

function refreshAmmoHud() {
  const a = loadout.ammo[loadout.current];
  hud.setAmmo(a.mag, a.reserve, loadout.current, loadout.nades);
}

function damagePlayer(amount, attacker) {
  const p = player.state;
  if (!p.alive || match.phase !== 'live') return;
  let remaining = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, remaining * 0.5);
    p.armor -= absorbed;
    remaining -= absorbed;
  }
  p.hp -= remaining;
  hud.damageFlash();
  if (attacker?.pos) {
    // Direction the shot came from, relative to where the player faces.
    const dx = attacker.pos.x - p.position.x;
    const dz = attacker.pos.z - p.position.z;
    hud.damageFrom(Math.atan2(dx, -dz) + p.yaw);
  }
  hud.setHealth(p.hp, p.armor);
  audio.hurt();
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    hud.killfeed(`${attacker?.name ?? 'Jackals'} ▸ You`, 'bad');
    spectateBot = bots.allBots().find((b) => b.team === 'vipers' && b.alive) ?? null;
    hud.setObjective('You are down — spectating your team');
  }
}

// --- Shooting -----------------------------------------------------------
const shootDir = new THREE.Vector3();
const shootFrom = new THREE.Vector3();

function spreadNow() {
  const def = WEAPONS[loadout.current];
  const p = player.state;
  let s = def.spreadBase + loadout.bloom;
  const speed = player.groundSpeed();
  if (speed > 0.5) s += def.spreadMove * Math.min(1, speed / 4.6);
  if (!p.onGround) s += def.spreadAir;
  if (p.crouched) s *= 0.7;
  if (loadout.aiming) s *= 0.45;
  return s;
}

function playerShoot() {
  const def = WEAPONS[loadout.current];
  const a = loadout.ammo[loadout.current];
  if (loadout.reloading > 0 || loadout.fireTimer > 0) return false;
  if (a.mag <= 0) {
    audio.dryFire();
    loadout.fireTimer = 0.3;
    return false;
  }
  a.mag -= 1;
  loadout.fireTimer = def.fireInterval;
  loadout.bloom = Math.min(0.05, loadout.bloom + def.recoil * 0.55);
  camera.getWorldDirection(shootDir);
  const spread = spreadNow();
  shootDir.x += (random() * 2 - 1) * spread;
  shootDir.y += (random() * 2 - 1) * spread;
  shootDir.z += (random() * 2 - 1) * spread;
  shootDir.normalize();
  viewmodel.muzzleWorld(shootFrom);
  raycaster.set(camera.position, shootDir);
  const targets = [];
  for (const b of bots.allBots()) {
    if (b.alive && b.team === 'jackals') targets.push(b.mesh.headHit, b.mesh.bodyHit);
  }
  const hits = raycaster.intersectObjects(targets.concat(world.shootables), false);
  const hit = hits[0];
  const end = new THREE.Vector3().copy(camera.position).addScaledVector(shootDir, def.range);
  if (hit) {
    end.copy(hit.point);
    if (hit.object.userData.bot) {
      const bot = bots.allBots().find((b) => b.mesh.headHit === hit.object || b.mesh.bodyHit === hit.object);
      const headshot = hit.object.userData.part === 'head';
      const dmg = damageAtDistance(def, hit.distance) * (headshot ? def.headMult : 1);
      const killed = bots.damage(bot, dmg, { isPlayer: true, pos: player.state.position }, headshot);
      hud.hitMarker(killed);
      audio.hit();
    } else {
      effects.spark(hit.point);
    }
  }
  effects.tracer(shootFrom, end, def.tracer);
  effects.muzzle(shootFrom, shootDir);
  audio.shot(def.id);
  player.recoil(def.recoil * (0.9 + random() * 0.3), (random() * 2 - 1) * def.recoil * 0.4);
  viewmodel.setKick(0.03);
  bots.hearNoise(player.state.position.x, player.state.position.z);
  refreshAmmoHud();
  return true;
}

function reload() {
  const def = WEAPONS[loadout.current];
  const a = loadout.ammo[loadout.current];
  if (loadout.reloading > 0 || a.mag === def.mag || a.reserve <= 0) return;
  loadout.reloading = def.reloadTime;
  audio.reload();
}

function throwGrenade() {
  if (loadout.nades <= 0 || match.phase !== 'live') return;
  loadout.nades -= 1;
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  camera.getWorldDirection(shootDir);
  mesh.position.copy(camera.position).addScaledVector(shootDir, 0.6);
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: shootDir.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4.5, 0)),
    fuse: GRENADE.fuse,
  });
  audio.shot('smg');
  refreshAmmoHud();
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  const at = g.mesh.position.clone();
  effects.explosion(at);
  audio.explosion();
  bots.hearNoise(at.x, at.z);
  const victims = [];
  if (player.state.alive) victims.push({ pos: player.state.position, isPlayer: true });
  for (const b of bots.allBots()) if (b.alive) victims.push({ pos: b.pos, bot: b });
  for (const v of victims) {
    const d = Math.hypot(v.pos.x - at.x, v.pos.z - at.z);
    if (d < GRENADE.radius) {
      const dmg = GRENADE.damage * (1 - d / GRENADE.radius);
      if (v.isPlayer) damagePlayer(dmg, { name: 'Grenade' });
      else bots.damage(v.bot, dmg, { isPlayer: true, pos: player.state.position }, false);
    }
  }
}

// --- Round flow ---------------------------------------------------------
function resetPositions() {
  const spawns = world.spawns;
  player.reset(spawns.vipers[0].x, spawns.vipers[0].z, 0);
  bots.reset();
  spectateBot = null;
  plantProgress = 0;
  plantBeepStep = 0;
  grenades.forEach((g) => scene.remove(g.mesh));
  grenades.length = 0;
  loadout.nades = 0;
  loadout.armor = 0;
  loadout.weapons = new Set(['pistol']);
  loadout.ammo = { pistol: { mag: 12, reserve: 36 } };
  loadout.current = 'pistol';
  loadout.reloading = 0;
  loadout.bloom = 0;
  viewmodel.build(WEAPONS.pistol);
  hud.setHealth(100, 0);
  hud.setMoney(match.money);
  hud.setScore(match.wins.vipers, match.wins.jackals, match.round);
  hud.setObjective('Plant the charge at Site A — or eliminate the Jackals');
  hud.setPlant(null, 0);
  refreshAmmoHud();
  syncCamera();
}

function afterRoundEnd() {
  hud.showBanner(match.banner.title, match.banner.sub, match.banner.team);
  if (match.banner.team === 'vipers') audio.roundWin();
  else audio.roundLose();
  hud.setMoney(match.money);
  hud.setScore(match.wins.vipers, match.wins.jackals, match.round);
  if (match.phase === 'matchEnd') {
    input.releaseLock();
    hud.showOverlay('end', `${match.wins.vipers} — ${match.wins.jackals} after ${match.round} rounds`);
  }
}

function restartMatch() {
  match.round = 1;
  match.wins = { vipers: 0, jackals: 0 };
  match.money = 800;
  startRound(match);
  resetPositions();
  hud.hideBanner();
  started = true;
}

// --- Input --------------------------------------------------------------
const input = createInput(renderer.domElement, (locked) => {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
    buyOpen = false;
  } else if (match.phase !== 'matchEnd' && !buyOpen) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
});

// Touch controls (joystick, drag-to-look, FIRE/JUMP/RELOAD/PLANT/BUY): built
// only on touch devices, never in ?shot= staging mode.
createTouch(input);

function syncCamera() {
  const p = player.state;
  if (!p.alive && spectateBot) {
    camera.position.set(spectateBot.pos.x, 1.6, spectateBot.pos.z);
    camera.rotation.set(0, spectateBot.yaw, 0, 'YXZ');
    return;
  }
  camera.position.set(p.position.x, p.position.y + p.eye, p.position.z);
  camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
}

function step(dt) {
  elapsed += dt;
  const p = player.state;

  // Phase timers.
  if (match.phase === 'buy') {
    match.timer -= dt;
    if (match.timer <= 0) {
      beginLive(match);
      audio.roundStart();
      hud.hideBuy();
      buyOpen = false;
      input.requestLock();
    }
  } else if (match.phase === 'live') {
    match.timer -= dt;
    if (match.plant.state === 'planted') {
      match.plant.fuse -= dt;
      if (match.plant.fuse <= 0) {
        effects.explosion(new THREE.Vector3(-12, 1, -10));
        audio.explosion();
        endRound(match, 'vipers', 'Charge detonated at Site A');
        afterRoundEnd();
      }
    }
    if (match.timer <= 0 && match.phase === 'live') {
      if (match.plant.state === 'planted') {
        // Fuse decides; timer running out does not end the round.
        match.timer = 0.01;
      } else {
        endRound(match, 'jackals', 'Time expired — Site A held');
        afterRoundEnd();
      }
    }
  } else if (match.phase === 'roundEnd') {
    match.timer -= dt;
    if (match.timer <= 0) {
      hud.hideBanner();
      nextRound(match);
      resetPositions();
    }
  }

  // Player movement (frozen during buy phase and round end).
  if (match.phase === 'live' && p.alive && !buyOpen) {
    player.step(dt, input.state.keys);
  }

  // Look, aim, fire.
  const look = input.takeLook();
  if (p.alive && match.phase !== 'buy') player.look(look.x, look.y);
  loadout.aiming = input.state.aiming && p.alive && match.phase === 'live';
  const targetFov = loadout.aiming ? 74 / WEAPONS[loadout.current].zoom : 74;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
  camera.updateProjectionMatrix();
  viewmodel.setAim(loadout.aiming, WEAPONS[loadout.current]);
  bobPhase += player.groundSpeed() * dt * 1.7;
  viewmodel.setBob(bobPhase, player.groundSpeed(), loadout.aiming);

  if (loadout.fireTimer > 0) loadout.fireTimer -= dt;
  if (loadout.reloading > 0) {
    loadout.reloading -= dt;
    if (loadout.reloading <= 0) {
      const def = WEAPONS[loadout.current];
      const a = loadout.ammo[loadout.current];
      const need = def.mag - a.mag;
      const take = Math.min(need, a.reserve);
      a.mag += take;
      a.reserve -= take;
      refreshAmmoHud();
    }
  }
  loadout.bloom = Math.max(0, loadout.bloom - dt * 0.09);
  viewmodel.setKick(0);

  if (match.phase === 'live' && p.alive && !buyOpen) {
    const def = WEAPONS[loadout.current];
    const firing = input.state.firing;
    if (def.auto ? firing : firing && !loadout.prevFiring) playerShoot();
    loadout.prevFiring = firing;
    if (input.consumeKey('KeyR')) reload();
    if (input.consumeKey('KeyG')) throwGrenade();
    if (input.consumeKey('Digit1')) switchWeapon('pistol');
    if (input.consumeKey('Digit2')) switchWeapon('rifle');
    if (input.consumeKey('Digit3')) switchWeapon('smg');
    if (input.consumeKey('Digit4')) switchWeapon('sniper');
  }

  // Plant channel: hold E inside Site A.
  if (match.phase === 'live' && p.alive && match.plant.state === 'none') {
    const inSite = world.insideSiteA(p.position.x, p.position.z);
    if (inSite && input.state.keys.has('KeyE')) {
      plantProgress += dt / 3;
      const beepAt = Math.floor(plantProgress * 3);
      if (beepAt > plantBeepStep) {
        plantBeepStep = beepAt;
        audio.plantTick();
      }
      hud.setPlant('PLANTING CHARGE…', plantProgress);
      if (plantProgress >= 1) {
        combat.plantCharge({ name: 'You' });
        awardMoney(match, 300);
        hud.setMoney(match.money);
        hud.setPlant(null, 0);
        plantProgress = 0;
      }
    } else {
      plantProgress = Math.max(0, plantProgress - dt / 1.5);
      if (plantProgress === 0) plantBeepStep = 0;
      hud.setPlant(plantProgress > 0.02 ? 'PLANTING CHARGE…' : null, plantProgress);
    }
  } else {
    hud.setPlant(match.plant.state === 'planted' ? `CHARGE LIVE — ${Math.ceil(match.plant.fuse)}s` : null, match.plant.state === 'planted' ? 1 - match.plant.fuse / FUSE_TIME : 0);
  }

  // Buy menu toggle during the buy phase.
  if (input.consumeKey('KeyB') && match.phase === 'buy') {
    buyOpen = !buyOpen;
    if (buyOpen) {
      input.releaseLock();
      hud.showBuy(match.money, { weapons: loadout.weapons, nades: loadout.nades, armor: loadout.armor });
    } else {
      hud.hideBuy();
      input.requestLock();
    }
  }

  // Bots and effects. Bots are frozen in screenshot mode so staged shots are
  // deterministic; in real play they always step during live rounds.
  if (match.phase === 'live' && !shot) bots.step(dt, elapsed, p, match);
  effects.step(dt);

  // Grenades.
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 14 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.09) {
      g.mesh.position.y = 0.09;
      g.vel.y *= -0.35;
      g.vel.x *= 0.6;
      g.vel.z *= 0.6;
    }
    if (g.fuse <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }

  // Win by elimination.
  if (match.phase === 'live') {
    const jackalsAlive = bots.aliveCount('jackals');
    const vipersAlive = bots.aliveCount('vipers') + (p.alive ? 1 : 0);
    if (jackalsAlive === 0) {
      endRound(match, 'vipers', 'Jackal squad eliminated');
      afterRoundEnd();
    } else if (vipersAlive === 0) {
      endRound(match, 'jackals', 'Viper squad eliminated');
      afterRoundEnd();
    }
  }

  // HUD.
  hud.setTimer(match.timer, match.phase);
  hud.setCrosshairGap(2 + spreadNow() * 900);
  playerHitGroup.position.set(p.position.x, p.position.y, p.position.z);
  hud.drawMinimap(p, bots.allBots(), match.plant.state);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && started) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function aimAt(x, y, z) {
  const p = player.state;
  const dx = x - p.position.x;
  const dy = y - (p.position.y + p.eye);
  const dz = z - p.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  started = true;
  match.money = 2450;
  hud.setMoney(match.money);
  if (name === 'start') {
    startRound(match);
    resetPositions();
    aimAt(0, 1.4, -6);
    settle(30);
  } else if (name === 'play') {
    beginLive(match);
    resetPositions();
    // Stage a mid fight: player at the south end of mid with the VK-7, two
    // Jackals in the open lane ahead, and a real kill on the first one. The
    // bot keeps moving during the staging, so each shot re-aims at its live
    // position.
    player.state.position.set(0, 0, 10);
    player.state.yaw = 0;
    loadout.weapons.add('rifle');
    loadout.ammo.rifle = { mag: 30, reserve: 90 };
    switchWeapon('rifle');
    const jackals = bots.allBots().filter((b) => b.team === 'jackals');
    jackals[0].pos.set(-4, 0, 2);
    jackals[0].mesh.setPosition(-4, 2, 0);
    jackals[1].pos.set(4, 0, 1);
    jackals[1].mesh.setPosition(4, 1, 0);
    // The renderer has not run yet in shot mode, so bot and wall matrices are
    // still identity — refresh them before any raycast, or every shot would
    // hit phantom geometry sitting at the origin.
    scene.updateMatrixWorld(true);
    settle(20);
    // Five aimed shots at the torso: the rifle's bloom grows per shot, so
    // the loop re-aims and clears bloom each time, and five body hits (5 x
    // ~32) are more than enough to drop the 100 hp bot.
    for (let i = 0; i < 5; i += 1) {
      const target = jackals[0];
      loadout.bloom = 0;
      aimAt(target.pos.x, 1.1, target.pos.z);
      playerShoot();
      settle(8);
    }
    settle(2);
  } else if (name === 'buy') {
    startRound(match);
    resetPositions();
    match.money = 2450;
    hud.showBuy(match.money, { weapons: loadout.weapons, nades: 0, armor: 0 });
    aimAt(0, 1.4, -6);
    settle(20);
  } else {
    // end: a won round with the banner up.
    match.wins.vipers = 2;
    match.wins.jackals = 1;
    match.round = 4;
    endRound(match, 'vipers', 'Jackal squad eliminated');
    afterRoundEnd();
    resetPositions();
    hud.setScore(3, 1, 4);
    settle(20);
  }
  hud.setScore(match.wins.vipers, match.wins.jackals, match.round);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Boot.
startRound(match);
resetPositions();
viewmodel.build(WEAPONS.pistol);
hud.setHealth(100, 0);
hud.setMoney(match.money);
hud.setScore(0, 0, 1);
syncCamera();

// Read-only hook for automated play-testing (movement, firing, phase). It
// exposes no setters and changes nothing about the game.
window.__dustline = {
  get pos() { return player.state.position.toArray(); },
  get yaw() { return player.state.yaw; },
  get hp() { return player.state.hp; },
  get phase() { return match.phase; },
  get started() { return started; },
  get ammo() { return loadout.ammo[loadout.current].mag; },
  get money() { return match.money; },
  get touch() { return !!document.getElementById('touch-ui'); },
};
if (shot) runShot(shot);
else requestAnimationFrame(frame);
