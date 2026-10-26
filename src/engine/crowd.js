import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';

const H = 1.75; // figures are modelled at this height, then scaled per person
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function limb(a, b, r) {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r * 0.85, d.length(), 7);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
  return g;
}

// Stylised audience member facing +z, merged into one geometry. 'phone' raises the right hand to
// film; 'cheer' throws both arms up. Returns the geometry and (for 'phone') the hand position.
function figure(pose) {
  const parts = [];
  for (const sx of [-1, 1]) parts.push(limb(V(sx * 0.1, 0, 0), V(sx * 0.095, 0.88, 0), 0.075));
  const torso = new THREE.CapsuleGeometry(0.17, 0.42, 4, 10);
  torso.scale(1.2, 1, 0.72);
  torso.translate(0, 1.17, 0);
  const head = new THREE.SphereGeometry(0.105, 10, 8);
  head.translate(0, 1.63, 0.01);
  parts.push(torso, head);
  const sh = (sx) => V(sx * 0.2, 1.43, 0);
  const down = (sx) => [limb(sh(sx), V(sx * 0.235, 0.84, 0.05), 0.046)];
  const raised = (sx, elbow, hand) => [limb(sh(sx), elbow, 0.05), limb(elbow, hand, 0.045)];
  let hand = null;
  if (pose === 'phone') {
    hand = V(0.24, 1.98, 0.27);
    parts.push(...down(-1), ...raised(1, V(0.31, 1.72, 0.15), hand));
  } else if (pose === 'cheer') {
    for (const sx of [-1, 1]) parts.push(...raised(sx, V(sx * 0.36, 1.72, 0.05), V(sx * 0.43, 2.03, 0.1)));
  } else {
    parts.push(...down(-1), ...down(1));
  }
  const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  return { geo, hand };
}

// Dark silhouettes with a rim of stage light around their edges, so the crowd reads against the floor.
function crowdMaterial(rim) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = rim;
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 rimColor;\nvoid main() {')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = 1.0 - abs(dot(normal, normalize(vViewPosition)));
        totalEmissiveRadiance += rimColor * pow(rimF, 4.0) * (0.2 + 0.8 * max(normal.y, 0.0));`,
      );
  };
  return mat;
}

/**
 * Instanced audience between the stage and the camera. `keepClear`: [x, z, radius] circles where
 * nobody stands. `rim` tints the edge light. Returns a group with `update(t, levels, reactivity)`.
 */
export function buildCrowd(scene, { count = 250, area = { x: [-12.5, 12.5], z: [6.6, 21] }, keepClear = [], rim = 0xffa860, seed = 5 } = {}) {
  const group = new THREE.Group();
  group.name = 'crowd';
  const r = mulberry32(seed);

  const spots = [];
  const cols = Math.round((area.x[1] - area.x[0]) / 0.95);
  const rows = Math.ceil(count / cols);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols && spots.length < count; col++) {
      const u = (col + 0.5 + (r() - 0.5) * 0.7) / cols;
      const v = Math.pow((row + 0.5 + (r() - 0.5) * 0.6) / rows, 1.15); // denser near the stage
      const x = area.x[0] + u * (area.x[1] - area.x[0]), z = area.z[0] + v * (area.z[1] - area.z[0]);
      if (keepClear.some(([cx, cz, rad]) => Math.hypot(x - cx, z - cz) < rad)) continue;
      spots.push({ x, z, height: 1.6 + r() * 0.3, yaw: Math.PI + (r() - 0.5) * 0.5, phase: r() * Math.PI * 2, pose: r() < 0.2 ? 'phone' : r() < 0.12 ? 'cheer' : 'idle' });
    }
  }

  const rimColor = { value: new THREE.Color(rim) };
  const baseRim = new THREE.Color(rim);
  const mat = crowdMaterial(rimColor);
  const poses = { idle: figure('idle'), phone: figure('phone'), cheer: figure('cheer') };
  const meshes = {};
  for (const [name, f] of Object.entries(poses)) {
    const n = spots.filter((s) => s.pose === name).length;
    meshes[name] = new THREE.InstancedMesh(f.geo, mat, Math.max(n, 1));
    meshes[name].count = n;
    group.add(meshes[name]);
  }
  const nPhones = meshes.phone.count;
  // phone: dark body plus a screen on the side facing its owner (and anyone standing behind them)
  const phoneBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.15, 0.012), new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.4, metalness: 0.5 }), Math.max(nPhones, 1));
  const screenGeo = new THREE.PlaneGeometry(0.066, 0.135);
  screenGeo.rotateY(Math.PI);
  screenGeo.translate(0, 0, -0.0065);
  const screenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.74, 0.95).multiplyScalar(1.15), fog: false });
  const screens = new THREE.InstancedMesh(screenGeo, screenMat, Math.max(nPhones, 1));
  phoneBody.count = screens.count = nPhones;
  group.add(phoneBody, screens);

  const palette = [0x15171c, 0x1b1714, 0x101318, 0x221c18, 0x181b20, 0x2a2420, 0x0e1014, 0x2b1f1a, 0x1a2026].map((c) => new THREE.Color(c));
  const idx = { idle: 0, phone: 0, cheer: 0 };
  for (const s of spots) {
    s.i = idx[s.pose]++;
    meshes[s.pose].setColorAt(s.i, palette[Math.floor(r() * palette.length)]);
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const Y = V(0, 1, 0);
  // screen tipped back toward the owner's eyes
  const phoneTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, 0.12));
  function place(lift) {
    for (const s of spots) {
      q.setFromAxisAngle(Y, s.yaw);
      const bob = lift * (0.6 + 0.4 * Math.sin(s.phase));
      p.set(s.x, bob, s.z);
      const k = s.height / H;
      m.compose(p, q, sc.setScalar(k));
      meshes[s.pose].setMatrixAt(s.i, m);
      if (s.pose === 'phone') {
        const hand = poses.phone.hand.clone().multiplyScalar(k).applyQuaternion(q).add(p);
        hand.y += 0.07;
        m.compose(hand, q.clone().multiply(phoneTilt), sc.setScalar(1));
        phoneBody.setMatrixAt(s.i, m);
        screens.setMatrixAt(s.i, m);
      }
    }
    for (const mesh of [...Object.values(meshes), phoneBody, screens]) mesh.instanceMatrix.needsUpdate = true;
  }
  place(0);
  for (const mesh of Object.values(meshes)) mesh.instanceColor.needsUpdate = true;
  scene.add(group);
  console.info(`[crowd] ${spots.length} people, ${nPhones} filming, ${idx.cheer} cheering`);

  let lastLift = 0;
  group.userData.update = (t, levels, reactivity = 1) => {
    if (!group.visible) return;
    const pulse = Math.pow(levels.bass, 2) * reactivity;
    rimColor.value.copy(baseRim).multiplyScalar(0.22 + pulse * 0.6);
    const lift = Math.min(pulse, 1.5) * 0.06;
    // skip re-uploading ~250 matrices when nothing visibly moved
    if (Math.abs(lift - lastLift) < 0.002) return;
    lastLift = lift;
    place(lift);
  };
  return group;
}
