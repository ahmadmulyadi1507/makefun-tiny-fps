// Transient combat effects: tracers, impact sparks, muzzle flash and the
// plant explosion. All pooled: no geometry or material is created per shot,
// only reused meshes whose visibility and life are recycled.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 12;

export function createEffects(scene) {
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe082, transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat);
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

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
  );
  flash.visible = false;
  scene.add(flash);
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

  function tracer(from, to) {
    const t = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.09;
  }

  function spark(at) {
    const s = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
    const pos = s.pts.geometry.attributes.position;
    pos.setXYZ(0, at.x, at.y, at.z);
    pos.needsUpdate = true;
    s.pts.visible = true;
    s.life = 0.25;
  }

  function muzzle(at, dir) {
    flash.position.copy(at);
    flash.lookAt(at.x + dir.x, at.y + dir.y, at.z + dir.z);
    flash.visible = true;
    flashLife = 0.05;
    flash.rotation.z = Math.random() * Math.PI;
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
    if (flash.visible) {
      flashLife -= dt;
      if (flashLife <= 0) flash.visible = false;
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
