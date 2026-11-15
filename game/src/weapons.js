// Weapons: definitions, ammo state, spread and recoil model, and the first-person
// viewmodel (a low-poly gun built from boxes, parented to the camera).
// Damage falls off with distance; headshots multiply it. Spread grows while
// moving or firing and shrinks while crouched, still, or aiming down sights.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', slot: 1, price: 0, auto: false,
    damage: 26, headMult: 3, falloff: 0.55, range: 60,
    mag: 12, reserve: 36, reloadTime: 1.1, fireInterval: 0.22,
    spreadBase: 0.011, spreadMove: 0.02, spreadAir: 0.05,
    recoil: 0.011, kick: 0.006, tracer: 0xffd54f, zoom: 1.15,
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Carbine', slot: 2, price: 2100, auto: true,
    damage: 33, headMult: 3, falloff: 0.6, range: 90,
    mag: 30, reserve: 90, reloadTime: 1.9, fireInterval: 0.105,
    spreadBase: 0.008, spreadMove: 0.024, spreadAir: 0.055,
    recoil: 0.013, kick: 0.009, tracer: 0xffe082, zoom: 1.35,
  },
  smg: {
    id: 'smg', name: 'Hornet SMG', slot: 3, price: 1500, auto: true,
    damage: 22, headMult: 3, falloff: 0.45, range: 55,
    mag: 32, reserve: 96, reloadTime: 1.6, fireInterval: 0.075,
    spreadBase: 0.013, spreadMove: 0.03, spreadAir: 0.06,
    recoil: 0.009, kick: 0.007, tracer: 0xffcc80, zoom: 1.2,
  },
  sniper: {
    id: 'sniper', name: 'Longbow DMR', slot: 4, price: 3800, auto: false,
    damage: 95, headMult: 4, falloff: 0.85, range: 120,
    mag: 5, reserve: 15, reloadTime: 2.6, fireInterval: 1.1,
    spreadBase: 0.001, spreadMove: 0.05, spreadAir: 0.09,
    recoil: 0.05, kick: 0.03, tracer: 0xffffff, zoom: 3.2,
  },
};

export const GRENADE = { id: 'grenade', name: 'Frag Grenade', price: 300, damage: 95, radius: 5.5, fuse: 2.6 };
export const ARMOR = { id: 'armor', name: 'Kevlar Vest', price: 650, amount: 50 };

export function damageAtDistance(def, distance) {
  const t = Math.min(1, distance / def.range);
  return def.damage * (1 - (1 - def.falloff) * t);
}

export function createViewmodel(camera) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.5 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.45, metalness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.5, metalness: 0.2 });
  camera.add(group);
  group.position.set(0.28, -0.24, -0.5);

  let body = null;
  let barrel = null;
  let sight = null;

  function build(def) {
    while (group.children.length) group.remove(group.children[0]);
    const len = def.id === 'sniper' ? 0.62 : def.id === 'smg' ? 0.34 : def.id === 'pistol' ? 0.2 : 0.46;
    body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, len), dark);
    body.position.set(0, 0, -len / 2);
    group.add(body);
    barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.22), mid);
    barrel.position.set(0, 0.02, -len - 0.08);
    group.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.07), dark);
    grip.position.set(0, -0.12, 0.02);
    grip.rotation.x = 0.25;
    group.add(grip);
    if (def.id === 'sniper') {
      sight = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), mid);
      sight.rotation.x = Math.PI / 2;
      sight.position.set(0, 0.09, -len / 2);
      group.add(sight);
    } else {
      sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.06), accent);
      sight.position.set(0, 0.075, -len + 0.06);
      group.add(sight);
    }
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), mid);
    mag.position.set(0, -0.11, -len / 2 + 0.05);
    group.add(mag);
  }

  // Muzzle world position, used for tracer origins and the flash quad.
  const muzzle = new THREE.Vector3();
  function muzzleWorld() {
    if (!barrel) return muzzle.set(0, 0, 0);
    barrel.getWorldPosition(muzzle);
    return muzzle;
  }

  return {
    group,
    build,
    muzzleWorld,
    setKick(amount) { group.position.z = -0.5 + amount; },
    setAim(aiming, def) {
      if (aiming) group.position.set(0.0, -0.155, -0.42);
      else group.position.set(0.28, -0.24, -0.5);
      return def;
    },
    // Subtle walk bob: sways the viewmodel while moving, nearly still while
    // aiming. setAim sets the base position each frame; bob adds on top.
    setBob(phase, speed, aiming) {
      const amp = speed > 0.5 ? (aiming ? 0.002 : 0.007) : 0;
      const bx = group.position.x;
      const by = group.position.y;
      group.position.x = bx + Math.sin(phase * 2) * amp;
      group.position.y = by + Math.abs(Math.cos(phase * 2)) * amp * 0.8;
    },
  };
}
