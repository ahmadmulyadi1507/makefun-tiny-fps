// Transient combat effects: tracers, impact sparks, muzzle flash and the
// plant explosion. All pooled: no geometry or material is created per shot,
// only reused meshes whose visibility and life are recycled.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 12;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    // One material per tracer so each shot can carry its weapon's colour.
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe082, transparent: true, opacity: 0.9 }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;

  const sparkMat = new THREE.PointsMaterial({ color: 0xffc46b, size: 0.09, transparent: true, opacity: 1 });
  const sparks = [];
  for (let i = 0; i < MAX_SPARKS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const pts = new THREE.Points(geo, sparkMat.clone());
    pts.visible = false;
    pts.frustumCulled = false;
    scene.add(pts);
    sparks.push({ pts, life: 0 });
  }
  let sparkCursor = 0;

  // Dust puffs that hang briefly where a bullet strikes a surface.
  const MAX_DUST = 8;
  const dusts = [];
  for (let i = 0; i < MAX_DUST; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9a8878, size: 0.24, transparent: true, opacity: 0.55 }));
    pts.visible = false;
    pts.frustumCulled = false;
    scene.add(pts);
    dusts.push({ pts, life: 0 });
  }
  let dustCursor = 0;

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
  );
  flash.visible = false;
  scene.add(flash);
  // A real light at the muzzle so each shot briefly lights the yard.
  const flashLight = new THREE.PointLight(0xffc46b, 0, 14);
  scene.add(flashLight);
  let flashLife = 0;

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff9d00, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(0xff9d00, 0, 30);
  scene.add(blastLight);
  let blastLife = 0;
  let blastPos = new THREE.Vector3();

  function tracer(from, to, color = 0xffe082) {
    const t = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = 0.12;
  }

  function spark(at) {
    const s = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
    const pos = s.pts.geometry.attributes.position;
    pos.setXYZ(0, at.x, at.y, at.z);
    pos.needsUpdate = true;
    s.pts.visible = true;
    s.life = 0.25;
    // A dust puff beside the spark, drifting up a touch as it fades.
    const d = dusts[dustCursor];
    dustCursor = (dustCursor + 1) % MAX_DUST;
    const dp = d.pts.geometry.attributes.position;
    dp.setXYZ(0, at.x + (Math.random() - 0.5) * 0.15, at.y + 0.08, at.z + (Math.random() - 0.5) * 0.15);
    dp.needsUpdate = true;
    d.pts.visible = true;
    d.life = 0.5;
  }

  function muzzle(at, dir) {
    flash.position.copy(at);
    flash.lookAt(at.x + dir.x, at.y + dir.y, at.z + dir.z);
    flash.visible = true;
    flashLife = 0.05;
    flash.rotation.z = Math.random() * Math.PI;
    flashLight.position.copy(at);
    flashLight.intensity = 14;
  }

  function explosion(at) {
    blastPos.copy(at);
    blast.position.copy(at);
    blast.position.y = 1;
    blast.visible = true;
    blast.scale.setScalar(0.5);
    blastLight.position.copy(at);
    blastLight.position.y = 2;
    blastLight.intensity = 60;
    blastLife = 0.7;
  }

  function step(dt) {
    for (const t of tracers) {
      if (!t.line.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
    }
    for (const s of sparks) {
      if (!s.pts.visible) continue;
      s.life -= dt;
      s.pts.material.opacity = Math.max(0, s.life / 0.25);
      if (s.life <= 0) s.pts.visible = false;
    }
    for (const d of dusts) {
      if (!d.pts.visible) continue;
      d.life -= dt;
      d.pts.material.opacity = Math.max(0, 0.55 * (d.life / 0.5));
      if (d.life <= 0) d.pts.visible = false;
    }
    if (flash.visible) {
      flashLife -= dt;
      flashLight.intensity = flashLife > 0 ? 14 * (flashLife / 0.05) : 0;
      if (flashLife <= 0) { flash.visible = false; flashLight.intensity = 0; }
    }
    if (blast.visible) {
      blastLife -= dt;
      const k = 1 - Math.max(0, blastLife) / 0.7;
      blast.scale.setScalar(0.5 + k * 6);
      blast.material.opacity = Math.max(0, 0.8 * (1 - k));
      blastLight.intensity = 60 * (1 - k);
      if (blastLife <= 0) { blast.visible = false; blastLight.intensity = 0; }
    }
  }

  return { tracer, spark, muzzle, explosion, step };
}
