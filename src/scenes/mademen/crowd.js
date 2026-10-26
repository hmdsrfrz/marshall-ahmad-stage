import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mulberry32 } from '../../engine/noise.js';

// Bakes the rigged man into a static, 1 m tall geometry in the idle pose. With `raiseArm`, the right
// upper arm is turned (trying a few axes, keeping whichever lifts the hand highest and forward) so
// the figure holds a phone up; the baked hand position comes back for placing the phone.
function bakeFigure(gltf, raiseArm) {
  const model = SkeletonUtils.clone(gltf.scene);
  const mixer = new THREE.AnimationMixer(model);
  const clip = gltf.animations.find((a) => a.name.endsWith('Man_Idle'));
  mixer.clipAction(clip).play();
  mixer.update(0);
  model.updateMatrixWorld(true);

  const palm = model.getObjectByName('PalmR');
  if (raiseArm) {
    const upper = model.getObjectByName('UpperArmR');
    const lower = model.getObjectByName('LowerArmR');
    const base = upper.quaternion.clone();
    const score = () => {
      model.updateMatrixWorld(true);
      const p = palm.getWorldPosition(new THREE.Vector3());
      return p.y + p.z * 0.5;
    };
    let best = { s: -Infinity, q: base };
    for (const axis of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
      for (const angle of [-2.4, -1.9, 1.9, 2.4]) {
        upper.quaternion.copy(base).multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
        const s = score();
        if (s > best.s) best = { s, q: upper.quaternion.clone() };
      }
    }
    upper.quaternion.copy(best.q);
    // slight elbow bend so it reads as holding something up to film
    const lb = lower.quaternion.clone();
    let bestL = { s: -Infinity, q: lb };
    for (const axis of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)]) {
      for (const angle of [-0.5, 0.5]) {
        lower.quaternion.copy(lb).multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
        const s = score();
        if (s > bestL.s) bestL = { s, q: lower.quaternion.clone() };
      }
    }
    lower.quaternion.copy(bestL.q);
    model.updateMatrixWorld(true);
  }

  let skinned;
  model.traverse((o) => {
    if (o.isSkinnedMesh) skinned = o;
  });
  const src = skinned.geometry;
  const pos = src.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    skinned.applyBoneTransform(i, v);
    v.applyMatrix4(skinned.matrixWorld);
    out.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geo.setIndex(src.index.clone());
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const h = bb.max.y - bb.min.y;
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const norm = new THREE.Matrix4().makeScale(1 / h, 1 / h, 1 / h).multiply(new THREE.Matrix4().makeTranslation(-cx, -bb.min.y, -cz));
  geo.applyMatrix4(norm);
  geo.computeVertexNormals();
  const hand = palm.getWorldPosition(new THREE.Vector3()).applyMatrix4(norm);
  return { geo, hand };
}

// ~250 audience members as two instanced meshes (arms down / phone up) plus instanced phone screens.
// `keepClear`: [x, z, radius] circles (e.g. the tyre mounds) where nobody stands.
export function buildCrowd(scene, gl, { count = 250, area = { x: [-12.5, 12.5], z: [6.6, 21] }, keepClear = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'crowd';
  const r = mulberry32(5);
  const idle = bakeFigure(gl.person, false);
  const filming = bakeFigure(gl.person, true);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });

  // jittered grid, denser near the stage
  const spots = [];
  const cols = 26;
  const rows = Math.ceil(count / cols);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols && spots.length < count; col++) {
      const u = (col + 0.5 + (r() - 0.5) * 0.7) / cols;
      const v = Math.pow((row + 0.5 + (r() - 0.5) * 0.6) / rows, 1.15);
      const x = area.x[0] + u * (area.x[1] - area.x[0]), z = area.z[0] + v * (area.z[1] - area.z[0]);
      if (keepClear.some(([cx, cz, rad]) => Math.hypot(x - cx, z - cz) < rad)) continue;
      spots.push([x, z]);
    }
  }
  const phoneShare = 0.22;
  const nPhone = Math.round(spots.length * phoneShare);
  const idleMesh = new THREE.InstancedMesh(idle.geo, mat, spots.length - nPhone);
  const filmMesh = new THREE.InstancedMesh(filming.geo, mat, nPhone);
  const phoneMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.075, 0.14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.85, 1).multiplyScalar(1.05), side: THREE.DoubleSide }),
    nPhone,
  );
  const palette = [0x15171c, 0x1b1714, 0x101318, 0x221c18, 0x181b20, 0x2a2420, 0x0e1014].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  let ii = 0, fi = 0;
  // shuffle which spots are filming so phones are spread through the crowd
  const filmingSpot = new Set();
  while (filmingSpot.size < nPhone) filmingSpot.add(Math.floor(r() * spots.length));
  spots.forEach(([x, z], i) => {
    const height = 1.6 + r() * 0.3;
    const yaw = Math.PI + (r() - 0.5) * 0.5;
    q.setFromAxisAngle(Y, yaw);
    s.setScalar(height);
    p.set(x, 0, z);
    m.compose(p, q, s);
    const color = palette[Math.floor(r() * palette.length)];
    if (filmingSpot.has(i)) {
      filmMesh.setMatrixAt(fi, m);
      filmMesh.setColorAt(fi, color);
      // phone screen at the raised hand, turned to face its owner (and the camera behind the crowd)
      const hand = filming.hand.clone().multiplyScalar(height).applyQuaternion(q).add(p);
      hand.y += 0.06;
      m.compose(hand, new THREE.Quaternion().setFromAxisAngle(Y, yaw + Math.PI), new THREE.Vector3(1, 1, 1));
      phoneMesh.setMatrixAt(fi, m);
      fi++;
    } else {
      idleMesh.setMatrixAt(ii, m);
      idleMesh.setColorAt(ii, color);
      ii++;
    }
  });
  group.add(idleMesh, filmMesh, phoneMesh);
  scene.add(group);
  console.info(`[crowd] ${spots.length} people, ${nPhone} filming`);
  return group;
}
