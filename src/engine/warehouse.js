import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { glowTexture, beamCone, aimAt } from './fx.js';

export const ROOM = { w: 38, h: 13, back: -9, front: 30 };

export function corrugatedMaterial(color = 0x1c2630) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 256, 0);
  for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, i % 2 ? '#202020' : '#e0e0e0');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 16);
  const bump = new THREE.CanvasTexture(c);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(12, 1);
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.6, bumpMap: bump, bumpScale: 3 });
}

// Vertical fan of light spilling down a wall below a floodlight: bright at the lamp, fading out.
function wallWashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 0, 0, 64, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/**
 * The warehouse shell around a stage: corrugated walls, roof beams, pallet racking along the sides,
 * hanging pendants over the audience and sodium floodlights on the walls. The floor stays with each
 * stage. Returns { group, update(), apply({ warehouse, warehouseLights }) }.
 */
export function buildWarehouseRoom(scene) {
  const { w, h, back, front } = ROOM;
  const group = new THREE.Group();
  group.name = 'warehouse';
  const steel = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.45, metalness: 0.8 });
  const r = mulberry32(41);
  const glow = glowTexture('rgba(255,255,255,1)', 0.3);

  // --- shell
  const wallMat = corrugatedMaterial();
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
  backWall.position.set(0, h / 2, back);
  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
  frontWall.rotation.y = Math.PI;
  frontWall.position.set(0, h / 2, front);
  group.add(backWall, frontWall);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(front - back, h), wallMat);
    side.rotation.y = -sx * Math.PI / 2;
    side.position.set((sx * w) / 2, h / 2, (front + back) / 2);
    side.receiveShadow = true;
    group.add(side);
  }
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(w, front - back), new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 1 }));
  roof.rotation.x = Math.PI / 2;
  roof.position.set(0, h, (front + back) / 2);
  group.add(roof);
  for (let z = back + 3; z < front; z += 6) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 0.3), steel);
    beam.position.set(0, h - 0.3, z);
    group.add(beam);
  }

  // --- pallet racking along both side walls: blue uprights, orange beams, cartons and wrapped pallets
  const frames = [], cartons = [];
  const rackZ = [4, 9, 14, 19, 24];
  const levels = [0.12, 2.1, 4.1];
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.8);
    for (const z of rackZ) {
      for (const dz of [-2.4, 2.4]) for (const dx of [-0.5, 0.5]) frames.push({ p: [x + dx, 2.9, z + dz], s: [0.08, 5.8, 0.08], c: 0x1d3f7a });
      for (const y of levels.slice(1)) for (const dx of [-0.5, 0.5]) frames.push({ p: [x + dx, y - 0.08, z], s: [0.08, 0.14, 4.8], c: 0xc8561a });
      for (const y of levels) {
        for (let k = 0; k < 4; k++) {
          if (r() < 0.18) continue; // gaps make it look used
          const bw = 0.8 + r() * 0.2, bh = 0.6 + r() * 0.9, bd = 0.9 + r() * 0.2;
          const tone = r() < 0.3 ? 0x9c9890 : 0x7a5c3c; // shrink-wrapped vs cardboard
          cartons.push({ p: [x + (r() - 0.5) * 0.1, y + 0.02 + bh / 2, z - 1.8 + k * 1.2], s: [bd, bh, bw], c: tone });
        }
      }
    }
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const [list, mat] of [
    [frames, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.6 })],
    [cartons, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })],
  ]) {
    const mesh = new THREE.InstancedMesh(boxGeo, mat, list.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    list.forEach((b, i) => {
      m.compose(new THREE.Vector3(...b.p), new THREE.Quaternion(), new THREE.Vector3(...b.s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(b.c).multiplyScalar(0.7 + r() * 0.4));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  // --- pendants over the audience: hazy cone of light and a pool on the floor; four carry real lights
  const warm = 0xffc88a;
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.78, 0.5).multiplyScalar(3) });
  const shade = new THREE.MeshStandardMaterial({ color: 0x1a1e22, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide });
  const poolMat = new THREE.MeshBasicMaterial({ map: glow, color: warm, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  const pendantY = h - 3.2;
  const pendants = [];
  for (const [x, z, real] of [[-9, 10, true], [0, 12, false], [9, 10, true], [-9, 21, true], [0, 23, false], [9, 21, true], [-14, 15, false], [14, 15, false]]) {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.4, 14, 1, true), shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bulbMat);
    bulb.position.y = -0.14;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.9), steel);
    cord.position.y = 1.6;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: warm, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.position.y = -0.2;
    halo.scale.set(1.6, 1.6, 1);
    g.add(cone, bulb, cord, halo);
    g.position.set(x, pendantY, z);
    group.add(g);
    const beam = beamCone(pendantY - 0.3, 2.6, warm);
    aimAt(beam, new THREE.Vector3(x, pendantY - 0.15, z), new THREE.Vector3(x, 0, z));
    group.add(beam);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.02, z);
    group.add(pool);
    let light = null;
    if (real) {
      light = new THREE.PointLight(warm, 60, 18, 1.3);
      light.position.set(x, pendantY - 0.4, z);
      group.add(light);
    }
    pendants.push({ halo, beam, light });
  }

  // --- sodium floodlights high on the side walls washing down the corrugation
  const sodium = 0xff9a3c;
  const washTex = wallWashTexture();
  const floods = [];
  for (const sx of [-1, 1]) {
    for (const z of [0, 11, 22]) {
      const x = sx * (w / 2 - 0.05);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.7), steel);
      housing.position.set(x - sx * 0.3, 8.5, z);
      housing.rotation.z = sx * 0.5;
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(sodium).multiplyScalar(3), side: THREE.DoubleSide }));
      lens.rotation.set(Math.PI / 2, 0, 0);
      lens.position.set(x - sx * 0.3, 8.31, z);
      const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: sodium, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      flare.position.set(x - sx * 0.35, 8.2, z);
      flare.scale.set(2.2, 2.2, 1);
      const wash = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 8.5),
        new THREE.MeshBasicMaterial({ map: washTex, color: sodium, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      wash.rotation.y = -sx * Math.PI / 2;
      wash.position.set(x - sx * 0.03, 8.4 - 4.25, z);
      group.add(housing, lens, flare, wash);
      floods.push({ flare, wash });
    }
    const fill = new THREE.PointLight(sodium, 50, 20, 1.4);
    fill.position.set(sx * (w / 2 - 2), 7.5, 11);
    group.add(fill);
    floods.push({ light: fill });
  }

  // --- green exit signs by the back corners
  for (const sx of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 1, 0.35).multiplyScalar(1.4) }));
    sign.position.set(sx * (w / 2 - 3), 3.2, back + 0.05);
    group.add(sign);
  }

  scene.add(group);
  let o = { warehouseLights: 1 };
  return {
    group,
    update() {
      if (!group.visible) return;
      const k = o.warehouseLights;
      for (const p of pendants) {
        p.halo.material.opacity = 0.5 * Math.min(k, 1.5);
        p.beam.material.uniforms.intensity.value = 0.14 * k;
        if (p.light) p.light.intensity = 60 * k;
      }
      poolMat.opacity = 0.3 * Math.min(k, 2);
      for (const f of floods) {
        if (f.light) f.light.intensity = 50 * k;
        else {
          f.flare.material.opacity = 0.6 * Math.min(k, 1.5);
          f.wash.material.opacity = 0.35 * Math.min(k, 2);
        }
      }
    },
    apply(s) {
      o = s;
      group.visible = s.warehouse;
    },
  };
}
