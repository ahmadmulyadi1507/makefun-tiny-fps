// Yard 7 — the map. A 44 x 30 m dusk industrial yard with three lanes:
// west lane, mid (through the container yard) and east lane, plus Site A in the
// north-west corner where the charge is planted. Every solid is an axis-aligned
// box: a collider for movement, a surface bullets stop on, and (if tall enough)
// a sight blocker for the bots' line-of-sight test.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph the bots walk: node positions (x, z) and neighbour lists.
export const WAYPOINTS = [
  { x: 0, z: 13, to: [1, 2, 3] },       // 0 attacker spawn
  { x: -14, z: 10, to: [0, 4, 5] },     // 1 west lane south
  { x: 0, z: 9, to: [0, 4, 6, 7] },     // 2 mid south
  { x: 14, z: 10, to: [0, 6, 8] },      // 3 east lane south
  { x: -14, z: 0, to: [1, 5, 9] },      // 4 west lane mid
  { x: -13, z: -8, to: [4, 9, 10] },    // 5 site approach west
  { x: 0, z: 1, to: [2, 7, 11] },       // 6 mid crates
  { x: 14, z: 0, to: [3, 6, 12] },      // 7 east lane mid
  { x: 14, z: -9, to: [7, 12, 13] },    // 8 east lane north
  { x: -6, z: -8, to: [5, 10, 11] },    // 9 site A south edge
  { x: -12, z: -10, to: [5, 9] },       // 10 site A (plant zone)
  { x: 0, z: -8, to: [6, 9, 11, 12] },  // 11 mid north
  { x: 8, z: -10, to: [7, 8, 11, 13] }, // 12 north-east corner
  { x: 0, z: -13, to: [11, 12] },       // 13 defender spawn
];

export const SPAWNS = {
  vipers: [
    { x: -4, z: 13, yaw: 0 },
    { x: 0, z: 13, yaw: 0 },
    { x: 4, z: 13, yaw: 0 },
  ],
  jackals: [
    { x: -4, z: -13, yaw: Math.PI },
    { x: 0, z: -13, yaw: Math.PI },
    { x: 4, z: -13, yaw: Math.PI },
    { x: 8, z: -11, yaw: Math.PI },
  ],
};

// Site A plant zone, as an XZ rectangle.
export const SITE_A = { x0: -16, x1: -8, z0: -13.5, z1: -7 };

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  const defs = {
    ground: { color: PALETTE.ground, roughness: 0.95 },
    groundDark: { color: PALETTE.groundDark, roughness: 0.95 },
    wall: { color: PALETTE.wall, roughness: 0.9 },
    wallDark: { color: PALETTE.wallDark, roughness: 0.9 },
    crate: { color: PALETTE.crate, roughness: 0.85 },
    crateDark: { color: PALETTE.crateDark, roughness: 0.85 },
    container: { color: PALETTE.container, roughness: 0.6, metalness: 0.35 },
    containerRust: { color: PALETTE.containerRust, roughness: 0.7, metalness: 0.25 },
    accent: { color: PALETTE.accent, roughness: 0.5, emissive: PALETTE.accent, emissiveIntensity: 0.35 },
  };
  for (const [name, d] of Object.entries(defs)) {
    materials[name] = new THREE.MeshStandardMaterial(d);
  }

  const colliders = [];
  const shootables = [];
  // Tall boxes that block bot sight (height >= 1.6), kept as XZ rects.
  const sightBlockers = [];

  function box(w, h, d, x, y, z, mat, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const b = new THREE.Box3().setFromObject(mesh);
    if (!opts.noCollide) colliders.push(b);
    if (!opts.noShoot) shootables.push(mesh);
    if (h >= 1.6 && !opts.noBlock) {
      sightBlockers.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    }
    return mesh;
  }

  // Ground: two slabs with a darker mid strip, plus a sand-coloured centre pad.
  box(44.4, 0.4, 30.4, 0, -0.2, 0, 'ground');
  box(10, 0.06, 30, 0, 0.03, 0, 'groundDark', { noCollide: true, noShoot: true });
  box(8, 0.06, 6, -12, 0.03, -10, 'containerRust', { noCollide: true, noShoot: true });

  // Perimeter walls, 5 m high.
  box(0.6, 5, 30.4, -22.2, 2.5, 0, 'wall');
  box(0.6, 5, 30.4, 22.2, 2.5, 0, 'wall');
  box(44.4, 5, 0.6, 0, 2.5, -15.2, 'wallDark');
  box(44.4, 5, 0.6, 0, 2.5, 15.2, 'wallDark');

  // Site A marker: low amber frame posts at the four corners of the zone.
  for (const [cx, cz] of [[-16, -13.5], [-8, -13.5], [-16, -7], [-8, -7]]) {
    box(0.3, 1.1, 0.3, cx, 0.55, cz, 'accent', { noBlock: true });
  }
  box(8, 0.12, 0.12, -12, 0.06, -13.5, 'accent', { noCollide: true, noShoot: true, noBlock: true });
  box(8, 0.12, 0.12, -12, 0.06, -7, 'accent', { noCollide: true, noShoot: true, noBlock: true });

  // Containers: the mid yard. Two stacked rust containers form the mid wall.
  box(6, 2.6, 2.4, -3, 1.3, -1, 'container');
  box(6, 2.6, 2.4, 3, 1.3, 4, 'containerRust');
  box(4.8, 2.6, 2.4, 2.4, 3.9, -1, 'containerRust');
  box(2.4, 2.6, 6, 10, 1.3, -4, 'container');

  // Crates: crouch cover in each lane.
  const crates = [
    [-14, 1.2, 5, 'crate'], [-10, 1.2, 2, 'crateDark'], [-16, 1.2, -2, 'crate'],
    [-6, 1.2, 6, 'crateDark'], [6, 1.2, 8, 'crate'], [12, 1.2, 4, 'crateDark'],
    [16, 1.2, -3, 'crate'], [-2, 1.2, -5, 'crateDark'], [6, 1.2, -6, 'crate'],
    [-18, 1.2, 6, 'crateDark'], [18, 1.2, 9, 'crate'], [0, 1.2, 11, 'crateDark'],
  ];
  for (const [x, s, z, m] of crates) box(s, s, s, x, s / 2, z, m);

  // Low walls that split lanes and give head-glitch spots.
  box(0.5, 1.15, 8, -8, 0.575, 2, 'wallDark');
  box(0.5, 1.15, 8, 8, 0.575, -2, 'wallDark');
  box(8, 1.15, 0.5, -12, 0.575, 4, 'wallDark');
  box(6, 1.15, 0.5, 12, 0.575, -8, 'wallDark');

  // Raised platform at the back of Site A.
  box(6, 0.5, 3, -12, 0.25, -13.5, 'wall');

  // Lighting: low dusk sun from the south-west, cool sky fill, warm bounce.
  const sky = new THREE.HemisphereLight(new THREE.Color(0x8a97b5), new THREE.Color(PALETTE.ground), 1.8);
  scene.add(sky);
  scene.add(new THREE.AmbientLight(new THREE.Color(0x404860), 0.7));
  const sun = new THREE.DirectionalLight(new THREE.Color(0xffd9a0), 3.2);
  sun.position.set(-14, 18, 16);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x5a6b8a), 0.9);
  fill.position.set(12, 10, -14);
  scene.add(fill);

  // 2D line-of-sight: does the segment (x1,z1)-(x2,z2) cross any sight blocker?
  function segmentHitsRect(x1, z1, x2, z2, r) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    let t0 = 0;
    let t1 = 1;
    if (Math.abs(dx) < 1e-9) {
      if (x1 < r.x0 || x1 > r.x1) return false;
    } else {
      let a = (r.x0 - x1) / dx;
      let b = (r.x1 - x1) / dx;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return false;
    }
    if (Math.abs(dz) < 1e-9) {
      if (z1 < r.z0 || z1 > r.z1) return false;
    } else {
      let a = (r.z0 - z1) / dz;
      let b = (r.z1 - z1) / dz;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return false;
    }
    return true;
  }

  function hasLineOfSight(x1, z1, x2, z2) {
    for (const r of sightBlockers) {
      if (segmentHitsRect(x1, z1, x2, z2, r)) return false;
    }
    return true;
  }

  function insideSiteA(x, z) {
    return x >= SITE_A.x0 && x <= SITE_A.x1 && z >= SITE_A.z0 && z <= SITE_A.z1;
  }

  return { colliders, shootables, group, hasLineOfSight, insideSiteA, waypoints: WAYPOINTS, spawns: SPAWNS };
}
