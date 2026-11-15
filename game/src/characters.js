// Bot characters: low-poly soldiers built from boxes and capsules, one mesh
// group per bot, team-coloured. The head and body meshes carry userData so the
// raycaster can tell a headshot from a body hit and which bot was hit.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BODY_H = 1.05;
const HEAD_R = 0.21;

export function createSoldier(scene, team, name) {
  const group = new THREE.Group();
  const teamColor = team === 'vipers' ? PALETTE.viper : PALETTE.jackal;
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.9 });
  const vest = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.6, metalness: 0.3 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.26), cloth);
  legs.position.y = 0.28;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), cloth);
  torso.position.y = 0.86;
  group.add(torso);
  const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.34), vest);
  vestMesh.position.y = 0.9;
  group.add(vestMesh);
  const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 12, 10), skin);
  head.position.y = 1.42;
  group.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R + 0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), dark);
  helmet.position.y = 1.45;
  group.add(helmet);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.18, 1.05, -0.28);
  group.add(gun);
  // Team stripe above the head so teams read at a glance.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), new THREE.MeshBasicMaterial({ color: teamColor }));
  stripe.position.y = 1.72;
  group.add(stripe);

  group.traverse((m) => {
    if (m.isMesh) { m.castShadow = true; }
  });

  // Hit meshes: head sphere and torso box, tagged for the shooter.
  const headHit = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R + 0.06, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
  headHit.position.y = 1.42;
  headHit.userData = { bot: true, part: 'head' };
  group.add(headHit);
  const bodyHit = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.15, 0.42), new THREE.MeshBasicMaterial({ visible: false }));
  bodyHit.position.y = 0.85;
  bodyHit.userData = { bot: true, part: 'body' };
  group.add(bodyHit);

  scene.add(group);
  return {
    group, name, team,
    headHit, bodyHit,
    setPosition(x, z, yaw) {
      group.position.set(x, 0, z);
      group.rotation.y = yaw;
    },
    setDead(dead) {
      group.rotation.z = dead ? Math.PI / 2 : 0;
      group.position.y = dead ? -0.5 : 0;
      headHit.visible = false;
      bodyHit.visible = false;
    },
    setVisible(v) { group.visible = v; },
    dispose() { scene.remove(group); },
  };
}

export { BODY_H, HEAD_R };
