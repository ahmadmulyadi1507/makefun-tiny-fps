// Bots: waypoint navigation, line-of-sight spotting, burst fire, hearing,
// and the objective roles (plant for the attacking team, defuse for the
// defenders). Attackers push Site A along the waypoint graph; defenders hold
// the site and mid, and rotate toward gunfire they hear.
import * as THREE from 'three';
import { createSoldier } from './characters.js';
import { WEAPONS } from './weapons.js';
import { pick, range } from './rng.js';

const NAMES = {
  vipers: ['Rook', 'Havoc'],
  jackals: ['Dune', 'Sable', 'Vex', 'Onyx'],
};

const BOT_SPEED = 3.4;
const SPOT_RANGE = 46;
const HEAR_RANGE = 20;

export function createBots(scene, world, random, combat) {
  const bots = [];
  const waypoints = world.waypoints;
  const scratch = new THREE.Vector3();

  function nearestWaypoint(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < waypoints.length; i += 1) {
      const dx = waypoints[i].x - x;
      const dz = waypoints[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function collides(x, z, y) {
    for (const b of world.colliders) {
      if (y + 1.6 < b.min.y || y + 0.1 > b.max.y) continue;
      const cx = Math.max(b.min.x, Math.min(x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(z, b.max.z));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < 0.36 * 0.36) return true;
    }
    return false;
  }

  function makeBot(team, name, spawn, weaponId) {
    const mesh = createSoldier(scene, team, name);
    const bot = {
      team, name, mesh,
      weapon: WEAPONS[weaponId],
      pos: new THREE.Vector3(spawn.x, 0, spawn.z),
      yaw: spawn.yaw,
      hp: 100,
      alive: true,
      state: 'patrol',
      waypoint: nearestWaypoint(spawn.x, spawn.z),
      goal: team === 'vipers' ? 10 : 13,
      target: null,
      lastSeen: 0,
      burstLeft: 0,
      fireTimer: range(random, 0.2, 0.8),
      burstTimer: 0,
      channel: 0, // plant/defuse progress 0..1
      channelKind: null,
      strafeDir: 1,
      strafeTimer: 0,
      investigate: null,
      holdTimer: range(random, 2, 6),
      skill: range(random, 0.75, 1.1),
    };
    mesh.setPosition(bot.pos.x, bot.pos.z, bot.yaw);
    bots.push(bot);
    return bot;
  }

  function spawnAll() {
    for (const b of bots) b.mesh.dispose();
    bots.length = 0;
    for (let i = 0; i < NAMES.vipers.length; i += 1) {
      makeBot('vipers', NAMES.vipers[i], world.spawns.vipers[(i + 1) % world.spawns.vipers.length], i === 0 ? 'rifle' : 'smg');
    }
    for (let i = 0; i < NAMES.jackals.length; i += 1) {
      makeBot('jackals', NAMES.jackals[i], world.spawns.jackals[i], i === 2 ? 'smg' : 'rifle');
    }
  }

  function reset() {
    spawnAll();
  }

  function aliveCount(team) {
    let n = 0;
    for (const b of bots) if (b.team === team && b.alive) n += 1;
    return n;
  }

  function allBots() { return bots; }

  function visibleEnemy(bot, enemies) {
    let best = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - bot.pos.x;
      const dz = e.pos.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > SPOT_RANGE || d >= bestD) continue;
      // Facing cone (wide when close).
      const fx = -Math.sin(bot.yaw);
      const fz = -Math.cos(bot.yaw);
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (d > 7 && dot < 0.15) continue;
      if (!world.hasLineOfSight(bot.pos.x, bot.pos.z, e.pos.x, e.pos.z)) continue;
      best = e;
      bestD = d;
    }
    return best;
  }

  function moveToward(bot, tx, tz, dt, speed) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) return true;
    const vx = (dx / d) * speed;
    const vz = (dz / d) * speed;
    const nx = bot.pos.x + vx * dt;
    if (!collides(nx, bot.pos.z, 0)) bot.pos.x = nx;
    const nz = bot.pos.z + vz * dt;
    if (!collides(bot.pos.x, nz, 0)) bot.pos.z = nz;
    bot.yaw = Math.atan2(-vx, -vz);
    return d < 0.6;
  }

  function nextWaypointToward(bot, goal) {
    const node = waypoints[bot.waypoint];
    let best = null;
    let bestD = Infinity;
    for (const n of node.to) {
      const dx = waypoints[n].x - waypoints[goal].x;
      const dz = waypoints[n].z - waypoints[goal].z;
      const d = dx * dx + dz * dz + random() * 4;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best ?? bot.waypoint;
  }

  function aimError(bot, target, dist) {
    const targetSpeed = target.isPlayer ? combat.playerSpeed() : 3.2;
    const base = 0.022 + dist * 0.0011 + targetSpeed * 0.0035;
    return base / bot.skill;
  }

  function fireAt(bot, target, dt) {
    bot.fireTimer -= dt;
    if (bot.fireTimer > 0) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(random() * 3);
      bot.fireTimer = range(random, 0.5, 1.1);
      return;
    }
    bot.burstLeft -= 1;
    bot.fireTimer = bot.weapon.fireInterval * range(random, 1.6, 2.4);
    const from = scratch.set(bot.pos.x, 1.35, bot.pos.z);
    const dx = target.pos.x - bot.pos.x;
    const dz = target.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    const headshot = random() < 0.12;
    const aimY = headshot ? 1.42 : 1.1;
    const err = aimError(bot, target, dist);
    const dir = new THREE.Vector3(
      dx / (dist || 1) + (random() * 2 - 1) * err,
      (aimY - 1.35) / (dist || 1) + (random() * 2 - 1) * err,
      dz / (dist || 1) + (random() * 2 - 1) * err,
    ).normalize();
    combat.shoot(from, dir, bot.weapon, bot);
  }

  function stepBot(bot, dt, now, player, match) {
    if (!bot.alive) return;
    const enemies = [];
    if (bot.team === 'jackals') {
      if (player.alive) enemies.push({ pos: player.position, alive: true, isPlayer: true, ref: 'player' });
      for (const b of bots) if (b.team === 'vipers' && b.alive) enemies.push({ pos: b.pos, alive: true, isPlayer: false, ref: b });
    } else {
      for (const b of bots) if (b.team === 'jackals' && b.alive) enemies.push({ pos: b.pos, alive: true, isPlayer: false, ref: b });
    }
    const seen = visibleEnemy(bot, enemies);
    if (seen) {
      bot.target = seen;
      bot.lastSeen = now;
      bot.state = 'engage';
    } else if (bot.target && now - bot.lastSeen < 2.5) {
      bot.state = 'engage';
    } else {
      bot.target = null;
      if (bot.state === 'engage') bot.state = 'patrol';
    }

    // Objective roles.
    if (match.plant.state === 'planted' && bot.team === 'jackals' && !bot.target) {
      bot.state = 'defuse';
    } else if (match.plant.state === 'none' && bot.team === 'vipers' && !bot.target && !player.alive) {
      // If the player (charge carrier) is dead, a friendly bot takes the charge.
      const carrier = bots.filter((b) => b.team === 'vipers' && b.alive)[0];
      if (carrier === bot) bot.state = 'plant';
    }

    if (bot.state === 'engage' && bot.target) {
      const t = bot.target;
      const dx = t.pos.x - bot.pos.x;
      const dz = t.pos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      bot.yaw = Math.atan2(-dx, -dz);
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeTimer = range(random, 0.4, 0.9);
      }
      if (dist > 16) {
        moveToward(bot, t.pos.x, t.pos.z, dt, BOT_SPEED);
      } else if (dist < 5) {
        moveToward(bot, bot.pos.x - dx, bot.pos.z - dz, dt, BOT_SPEED * 0.6);
      } else {
        // Strafe while firing.
        const sx = -dz / (dist || 1) * bot.strafeDir;
        const sz = dx / (dist || 1) * bot.strafeDir;
        const nx = bot.pos.x + sx * BOT_SPEED * 0.5 * dt;
        if (!collides(nx, bot.pos.z, 0)) bot.pos.x = nx;
        const nz = bot.pos.z + sz * BOT_SPEED * 0.5 * dt;
        if (!collides(bot.pos.x, nz, 0)) bot.pos.z = nz;
      }
      fireAt(bot, t, dt);
    } else if (bot.state === 'plant') {
      if (world.insideSiteA(bot.pos.x, bot.pos.z)) {
        bot.channel += dt / 3;
        bot.channelKind = 'plant';
        if (bot.channel >= 1) {
          combat.plantCharge(bot);
          bot.channel = 0;
          bot.channelKind = null;
          bot.state = 'patrol';
        }
      } else {
        bot.channel = 0;
        bot.channelKind = null;
        bot.goal = 10;
        const wp = waypoints[bot.waypoint];
        const arrived = moveToward(bot, wp.x, wp.z, dt, BOT_SPEED);
        if (arrived) bot.waypoint = nextWaypointToward(bot, bot.goal);
      }
    } else if (bot.state === 'defuse') {
      if (world.insideSiteA(bot.pos.x, bot.pos.z)) {
        bot.channel += dt / 5;
        bot.channelKind = 'defuse';
        if (bot.channel >= 1) {
          combat.defuseCharge(bot);
          bot.channel = 0;
          bot.channelKind = null;
          bot.state = 'patrol';
        }
      } else {
        bot.channel = 0;
        bot.channelKind = null;
        bot.goal = 10;
        const wp = waypoints[bot.waypoint];
        const arrived = moveToward(bot, wp.x, wp.z, dt, BOT_SPEED);
        if (arrived) bot.waypoint = nextWaypointToward(bot, bot.goal);
      }
    } else if (bot.state === 'investigate' && bot.investigate) {
      const arrived = moveToward(bot, bot.investigate.x, bot.investigate.z, dt, BOT_SPEED);
      if (arrived) { bot.state = 'patrol'; bot.investigate = null; }
    } else {
      // Patrol / hold.
      bot.channel = 0;
      bot.channelKind = null;
      if (bot.team === 'jackals') {
        bot.holdTimer -= dt;
        if (bot.holdTimer <= 0) {
          bot.holdTimer = range(random, 3, 8);
          const holdNodes = bot.name === 'Dune' || bot.name === 'Sable' ? [9, 10, 11] : [11, 12, 6];
          bot.goal = pick(random, holdNodes);
        }
      } else {
        bot.goal = 10;
      }
      const wp = waypoints[bot.waypoint];
      const arrived = moveToward(bot, wp.x, wp.z, dt, BOT_SPEED * 0.9);
      if (arrived) bot.waypoint = nextWaypointToward(bot, bot.goal);
    }

    bot.mesh.setPosition(bot.pos.x, bot.pos.z, bot.yaw);
  }

  function step(dt, now, player, match) {
    for (const bot of bots) stepBot(bot, dt, now, player, match);
  }

  function hearNoise(x, z) {
    for (const bot of bots) {
      if (!bot.alive || bot.state === 'engage') continue;
      const d = Math.hypot(bot.pos.x - x, bot.pos.z - z);
      if (d < HEAR_RANGE && random() < 0.6) {
        bot.state = 'investigate';
        bot.investigate = { x, z };
      }
    }
  }

  function damage(bot, amount, attacker, headshot) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.mesh.setDead(true);
      combat.onKill(attacker, bot, headshot);
      return true;
    }
    // Getting shot snaps the bot toward the shooter.
    if (attacker && attacker.pos) {
      bot.target = { pos: attacker.pos, alive: true, isPlayer: attacker.isPlayer, ref: attacker };
      bot.lastSeen = performance.now() / 1000;
      bot.state = 'engage';
    }
    return false;
  }

  return { reset, step, allBots, aliveCount, hearNoise, damage, spawnAll };
}
