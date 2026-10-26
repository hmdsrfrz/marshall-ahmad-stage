import * as THREE from 'three';
import { mulberry32 } from '../../engine/noise.js';
import { glowTexture, smokeTexture, beamCone, aimAt } from '../../engine/fx.js';
import { createTarpMaterial, hangPlasticWalls } from '../../engine/plastic.js';
import { fit, shadows, eachMaterial, movable } from '../../engine/models.js';
import { ROOM } from '../../engine/warehouse.js';
import { concreteMaterial, signTexture } from './materials.js';

export const STAGE = { w: 17, h: 1.0, d: 8, z: 0 };
export const STAGE_TOP = STAGE.h;
export const STAGE_FRONT = STAGE.z + STAGE.d / 2;
// Truss rig: front and back beams across the stage, joined by side beams on four towers.
export const TRUSS = { y: 9, front: 3.4, back: -3.6, x: 9.2, size: 0.42 };
// Pipe across the rig that the singer's mic hangs from.
export const MIC_PIPE_Z = 1.45;

// Box truss between two points as a single InstancedMesh of struts (4 chords + zig-zag lacing).
function trussMembers(from, to, size, out) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  dir.normalize();
  const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(dir, up).normalize();
  const nrm = new THREE.Vector3().crossVectors(side, dir).normalize();
  const h = size / 2;
  const corners = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ].map(([a, b]) => side.clone().multiplyScalar(a).add(nrm.clone().multiplyScalar(b)));
  for (const c of corners) out.push([from.clone().add(c), to.clone().add(c), 0.028]);
  const segs = Math.max(2, Math.round(len / size));
  for (let s = 0; s < segs; s++) {
    const a = from.clone().addScaledVector(dir, (s / segs) * len);
    const b = from.clone().addScaledVector(dir, ((s + 1) / segs) * len);
    for (let f = 0; f < 4; f++) {
      const c0 = corners[f], c1 = corners[(f + 1) % 4];
      const [p, q] = s % 2 ? [c0, c1] : [c1, c0];
      out.push([a.clone().add(p), b.clone().add(q), 0.014]);
    }
  }
}

function strutMesh(struts, material) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
  const mesh = new THREE.InstancedMesh(geo, material, struts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  struts.forEach(([a, b, r], i) => {
    const d = b.clone().sub(a);
    q.setFromUnitVectors(Y, d.clone().normalize());
    s.set(r, d.length(), r);
    m.compose(a.clone().add(b).multiplyScalar(0.5), q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = true;
  return mesh;
}

function chain(from, to, material) {
  const link = new THREE.TorusGeometry(0.045, 0.012, 5, 10);
  const len = from.distanceTo(to);
  const n = Math.ceil(len / 0.07);
  const mesh = new THREE.InstancedMesh(link, material, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3();
  const dirQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  for (let i = 0; i < n; i++) {
    p.lerpVectors(from, to, i / (n - 1));
    // alternate links turn 90° about the chain axis
    q.copy(dirQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (i % 2) * Math.PI / 2, Math.PI / 2)));
    m.compose(p, q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
  }
  return mesh;
}

export function buildWarehouse(scene, gl, { quality }) {
  const movables = [];
  const steel = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.45, metalness: 0.8 });

  // --- concrete floor (walls, roof and house lights come from the shared warehouse room)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w + 4, ROOM.front - ROOM.back + 4), concreteMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = (ROOM.front + ROOM.back) / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // --- stage riser with diffused footlights under the lip
  const stage = new THREE.Group();
  stage.position.z = STAGE.z;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(STAGE.w, 0.1, STAGE.d), new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.55, metalness: 0.1 }));
  deck.position.y = STAGE.h - 0.05;
  deck.receiveShadow = true;
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(STAGE.w - 0.3, STAGE.h - 0.1, STAGE.d - 0.3), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.95 }));
  skirt.position.y = (STAGE.h - 0.1) / 2;
  const footMat = new THREE.MeshBasicMaterial({ color: 0xffb36a });
  const foot = new THREE.Mesh(new THREE.BoxGeometry(STAGE.w - 0.3, 0.035, 0.035), footMat);
  foot.position.set(0, STAGE.h - 0.13, STAGE.d / 2 - 0.13);
  stage.add(deck, skirt, foot);
  scene.add(stage);
  const washTex = (() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0.05)');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(c);
  })();
  const washMat = new THREE.MeshBasicMaterial({ map: washTex, color: 0xffb36a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(STAGE.w - 0.3, STAGE.h - 0.12), washMat);
  wash.position.set(0, (STAGE.h - 0.12) / 2, STAGE_FRONT - 0.14);
  scene.add(wash);
  const glowTex = glowTexture('rgba(255,255,255,1)', 0.3);
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(STAGE.w * 1.3, 4),
    new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffb36a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.01, STAGE_FRONT + 0.6);
  scene.add(pool);
  const footLights = [-5, 5].map((x) => {
    const l = new THREE.PointLight(0xffb36a, 10, 9, 1.6);
    l.position.set(x, 0.4, STAGE_FRONT + 0.5);
    scene.add(l);
    return l;
  });

  // --- truss rig, towers and the mic pipe
  const struts = [];
  const { y, front, back: tb, x: tx, size } = TRUSS;
  const V = (a, b, c) => new THREE.Vector3(a, b, c);
  trussMembers(V(-tx - 0.6, y, front), V(tx + 0.6, y, front), size, struts);
  trussMembers(V(-tx - 0.6, y, tb), V(tx + 0.6, y, tb), size, struts);
  for (const sx of [-1, 1]) {
    trussMembers(V(sx * tx, y, tb), V(sx * tx, y, front), size, struts);
    for (const z of [front, tb]) trussMembers(V(sx * tx, 0, z), V(sx * tx, y, z), size, struts);
  }
  scene.add(strutMesh(struts, steel));
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, tx * 2), steel);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0, y - 0.15, MIC_PIPE_Z);
  scene.add(pipe);

  // --- hanging speaker line arrays on both sides of the front truss
  const cabinet = fit(gl.speaker.scene, { size: 1.0, axis: 'max' });
  eachMaterial(cabinet, (m) => {
    m.color.multiplyScalar(0.25);
    m.roughness = 0.7;
  });
  for (const sx of [-1, 1]) {
    const array = movable(`speakers-${sx < 0 ? 'left' : 'right'}`, 'Speaker array');
    for (let i = 0; i < 4; i++) {
      const cab = shadows(cabinet.clone(), true, false);
      cab.position.set(0, -i * 0.72, 0);
      cab.rotation.x = 0.08 + i * 0.07;
      array.add(cab);
    }
    array.position.set(sx * (tx + 1.3), y - 1.1, front + 0.2);
    array.rotation.y = -sx * 0.25;
    scene.add(array);
    movables.push(array);
  }

  // --- loose plastic sheeting on the back and sides, hung from the truss down to the deck
  const plasticMat = createTarpMaterial({ opacity: 0.3, color: 0xe8ecee, emissive: 0x1a1418, emissiveIntensity: 0.06 });
  const ph = y - STAGE.h;
  const plasticRoot = new THREE.Group();
  plasticRoot.position.y = STAGE.h;
  scene.add(plasticRoot);
  const sideLen = front - tb;
  const loose = { slack: 0.03, creases: 34, clip: [1.2, 2.4] };
  const plastic = hangPlasticWalls(
    [
      { len: tx * 2, height: ph, center: [0, ph / 2, tb - 0.35], rot: [0, 0, 0], along: [1, 0, 0], inward: [0, 0, 1], layers: 2, ...loose },
      { len: sideLen, height: ph, center: [-tx - 0.35, ph / 2, (front + tb) / 2], rot: [0, Math.PI / 2, 0], along: [0, 0, -1], inward: [1, 0, 0], layers: 2, ...loose },
      { len: sideLen, height: ph, center: [tx + 0.35, ph / 2, (front + tb) / 2], rot: [0, -Math.PI / 2, 0], along: [0, 0, 1], inward: [-1, 0, 0], layers: 2, ...loose },
    ],
    { material: plasticMat, parent: plasticRoot, seed: 100 },
  );

  // --- pink glow behind the back plastic
  const pink = new THREE.PointLight(0xff6f9a, 40, 14, 1.4);
  pink.position.set(1.5, 5.5, tb - 2.2);
  scene.add(pink);
  const pinkGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff6f9a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  pinkGlow.position.set(2, 5, tb - 1.2);
  pinkGlow.scale.set(14, 9, 1);
  scene.add(pinkGlow);

  // --- warm diffused top light glowing down through the haze from the truss
  const topLights = [-5.5, 0, 5.5].map((x) => {
    const l = new THREE.PointLight(0xffb070, 18, 13, 1.5);
    l.position.set(x, y - 0.8, -0.4);
    scene.add(l);
    return l;
  });
  const panelMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.42).multiplyScalar(1.6) });
  const topGlows = [];
  for (let i = 0; i < 6; i++) {
    const x = -7 + i * 2.8;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.5), panelMat);
    panel.position.set(x, y - 0.3, tb + 0.5);
    scene.add(panel);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa860, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.position.set(x, y - 1.6, tb + 0.8);
    halo.scale.set(4.5, 4.5, 1);
    scene.add(halo);
    topGlows.push(halo);
  }

  // --- haze inside the plastic box: drifting teal-tinted smoke sprites
  const smoke = smokeTexture();
  const r = mulberry32(31);
  const puffs = [];
  for (let i = 0; i < 30; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color: 0x9fb8c4, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.position.set((r() - 0.5) * 17, STAGE.h + 0.5 + r() * 6, -3.2 + r() * 6.5);
    const sc = 4 + r() * 5;
    s.scale.set(sc, sc, 1);
    s.userData = { base: s.position.clone(), speed: 0.04 + r() * 0.08, phase: r() * 10, rot: (r() - 0.5) * 0.04 };
    puffs.push(s);
    scene.add(s);
  }

  // --- MADE MEN signboard hanging on two chains from the front truss
  const sign = movable('sign', 'MADE MEN sign');
  const face = new THREE.MeshStandardMaterial({ map: signTexture('MADE MEN'), roughness: 0.9 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.95 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.26, 0.09), [edge, edge, edge, edge, face, edge]);
  board.castShadow = true;
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.8, roughness: 0.5 });
  const signY = 6.6;
  for (const cx of [-1.7, 1.7]) sign.add(chain(V(cx, 0.6, 0), V(cx, y - signY - 0.1, 0), chainMat));
  sign.add(board);
  sign.position.set(0, signY, front - 0.15);
  sign.rotation.z = 0.025;
  scene.add(sign);
  movables.push(sign);

  // --- low spotlight on the floor in front of the singer, throwing his shadow onto the plastic
  const shadowSpot = new THREE.SpotLight(0xffe2c0, 260, 30, 0.42, 0.5, 1.4);
  shadowSpot.position.set(0.4, 1.1, STAGE_FRONT + 3.2);
  shadowSpot.target.position.set(0, 4.6, tb);
  shadowSpot.castShadow = quality === 'high';
  shadowSpot.shadow.mapSize.set(2048, 2048);
  shadowSpot.shadow.bias = -0.0005;
  shadowSpot.shadow.camera.near = 0.5;
  scene.add(shadowSpot, shadowSpot.target);
  // Thin film barely darkens under a shadow, so a shadow-only surface just in front of the back
  // plastic carries the big silhouette.
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(tx * 2, ph), new THREE.ShadowMaterial({ color: 0x03060a, opacity: 0.6 }));
  catcher.position.set(0, STAGE.h + ph / 2, tb);
  catcher.receiveShadow = true;
  scene.add(catcher);
  const spotBeam = beamCone(10, 3.8, 0xffe2c0);
  aimAt(spotBeam, shadowSpot.position, shadowSpot.target.position);
  scene.add(spotBeam);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.35, 12), steel);
  lamp.position.copy(shadowSpot.position).add(V(0, -0.15, 0.1));
  lamp.rotation.x = -0.9;
  scene.add(lamp);

  const amber = new THREE.Color(0xffb36a);
  return {
    movables,
    update(t, dt, levels, o) {
      const pulse = Math.pow(levels.bass, 1.6) * o.reactivity;
      footMat.color.copy(amber).multiplyScalar((0.8 + pulse * 3) * o.footlights);
      washMat.color.copy(amber).multiplyScalar((0.15 + pulse * 1.2) * o.footlights);
      pool.material.opacity = (0.18 + pulse * 0.6) * o.footlights;
      for (const l of footLights) l.intensity = (6 + pulse * 60) * o.footlights;
      const breathe = 1 + levels.mid * 0.3 * o.reactivity;
      for (const l of topLights) l.intensity = 18 * o.topLight * breathe;
      for (const h of topGlows) h.material.opacity = 0.1 * o.topLight * Math.min(o.haze, 1.6);
      pink.intensity = 40 * o.pink;
      pinkGlow.material.opacity = 0.22 * o.pink * Math.min(o.haze, 1.6);
      shadowSpot.intensity = 260 * o.shadowSpot;
      spotBeam.material.uniforms.intensity.value = 0.08 * o.shadowSpot * o.haze;
      for (const s of puffs) {
        const u = s.userData;
        s.position.x = u.base.x + Math.sin(t * u.speed + u.phase) * 0.8;
        s.position.y = u.base.y + Math.sin(t * u.speed * 0.7 + u.phase * 2) * 0.4;
        s.material.rotation += u.rot * dt;
        s.material.opacity = 0.1 * o.haze;
      }
      if (o.plasticSway) plastic.sway(t, 0.35);
    },
    apply(o) {
      plasticMat.opacity = o.plasticOpacity;
      pink.color.set(o.pinkColor);
      pinkGlow.material.color.set(o.pinkColor);
    },
  };
}
