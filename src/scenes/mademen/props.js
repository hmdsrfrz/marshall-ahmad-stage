import * as THREE from 'three';
import { mulberry32 } from '../../engine/noise.js';
import { glowTexture, smokeTexture, beamCone, aimAt } from '../../engine/fx.js';
import { fit, shadows, eachMaterial, movable, posePerson } from '../../engine/models.js';
import { rustify, pegboardMaterial, tyreGeometry, rubberMaterial, rubberTints, qingqiTexture, fasciaTexture, crateMaterial } from './materials.js';
import { STAGE_TOP, STAGE_FRONT, TRUSS, MIC_PIPE_Z } from './warehouse.js';

const _box = new THREE.Box3();
const sizeOf = (obj) => _box.setFromObject(obj, true).getSize(new THREE.Vector3());

// Turns a tool model so its longest side points up and its thinnest side faces out of the board.
function hangFlat(obj, length) {
  const wrap = fit(obj, { size: length, axis: 'max' });
  const inner = wrap.children[0];
  let s = sizeOf(inner);
  if (s.x >= s.y && s.x >= s.z) inner.rotateZ(Math.PI / 2);
  else if (s.z >= s.y && s.z >= s.x) inner.rotateX(Math.PI / 2);
  s = sizeOf(inner);
  if (s.x < s.z) inner.rotateY(Math.PI / 2);
  // re-centre after turning
  wrap.updateMatrixWorld(true);
  const c = _box.setFromObject(inner, true).getCenter(new THREE.Vector3());
  inner.position.sub(c);
  return wrap;
}

// Dark trousers over the model's bare lower legs (the base model wears shorts).
function trousers() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.85 });
  for (const x of [-0.09, 0.09]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.06, 0.5, 8), mat);
    leg.position.set(x, 0.29, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  return g;
}

// Long open-fronted overcoat: a lathe shell from the shoulders to below the knee, with a slit at the front.
function overcoat() {
  const pts = [
    [0.12, 1.46],
    [0.215, 1.4],
    [0.205, 1.22],
    [0.19, 1.02],
    [0.22, 0.8],
    [0.27, 0.42],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const coat = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 20, 0.32, Math.PI * 2 - 0.64),
    new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.8, side: THREE.DoubleSide }),
  );
  coat.castShadow = true;
  return coat;
}

function bandMember(gl, pose) {
  const g = new THREE.Group();
  g.add(posePerson(gl.person, pose, { outfit: { Shirt: 0x17181b, Pants: 0x121214, Socks: 0x101010 } }));
  if (pose === 'Man_Idle') g.add(trousers());
  return g;
}

// Transforms are [position, [tilt x, yaw y, roll z], scale]; 'YXZ' order applies the yaw after the
// tilt, so tyres stood on edge face every direction. Each instance gets a dusty rubber tint.
function instancedPile(geo, material, transforms, id, label) {
  const mesh = new THREE.InstancedMesh(geo, material, transforms.length);
  const m = new THREE.Matrix4();
  transforms.forEach(([p, e, s = 1], i) => {
    m.compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...e, 'YXZ')), new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, rubberTints[(i * 7 + transforms.length) % rubberTints.length]);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = movable(id, label);
  g.add(mesh);
  return g;
}

export function buildProps(scene, gl, { add }) {
  const r = mulberry32(77);
  const flare = glowTexture('rgba(255,255,255,1)', 0.15);
  const smoke = smokeTexture();
  const animated = [];
  const tyreGeo = tyreGeometry();
  const rubber = rubberMaterial(); // white base, tinted per instance
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: 0.92 });

  // ---------------------------------------------------------------- car
  const car = movable('car', 'Car');
  const body = fit(gl.car.scene.clone(), { size: 4.3, axis: 'max', longAxis: 'z' });
  eachMaterial(body, (m) => {
    if (m.name === 'Main') return rustify(new THREE.MeshStandardMaterial({ color: 0xb08326, roughness: 0.6, metalness: 0.3 }), { amount: 0.45, scale: 1.6 });
    // fogged-up glass with a warm glow from inside
    if (m.name === 'Windows') return new THREE.MeshStandardMaterial({ color: 0x3a2a16, emissive: 0xff9440, emissiveIntensity: 0.55, roughness: 0.55 });
    return rustify(m, { amount: 0.3 });
  });
  shadows(body);
  car.add(body);
  const cs = sizeOf(body);
  const W = cs.x, H = cs.y, L = cs.z;

  const hoodMat = rustify(new THREE.MeshStandardMaterial({ color: 0xb08326, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }), { amount: 0.5, scale: 1.6 });
  const hinge = new THREE.Group();
  hinge.position.set(0, H * 0.62, L / 2 - 1.35);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.035, 1.25), hoodMat);
  hood.position.z = 0.62;
  hood.castShadow = true;
  hinge.add(hood);
  hinge.rotation.x = -1.05;
  car.add(hinge);

  // flowers and ivy spilling out of the engine bay and over the bonnet
  const bloom = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const f = fit(gl.flowers.scene.clone(), { size: 0.8 + r() * 0.4, axis: 'max' });
    f.position.set((r() - 0.5) * W * 0.7, H * 0.66, L / 2 - 1.1 + r() * 0.9);
    f.rotation.y = r() * 6.28;
    bloom.add(f);
  }
  for (let i = 0; i < 9; i++) {
    const d = fit(gl.daisy.scene.clone(), { size: 0.45 + r() * 0.25 });
    d.position.set((r() - 0.5) * W * 0.75, H * 0.68, L / 2 - 1.2 + r() * 1.1);
    d.rotation.set((r() - 0.5) * 0.6, r() * 6.28, (r() - 0.5) * 0.6);
    bloom.add(d);
  }
  for (let i = 0; i < 3; i++) {
    const iv = fit(gl.ivy.scene.clone(), { size: 1.1, axis: 'max' });
    iv.position.set((i - 1) * W * 0.3, H * 0.5, L / 2 - 0.5);
    iv.rotation.set(-0.5, r() * 6.28, 0);
    bloom.add(iv);
  }
  for (const x of [-W * 0.3, W * 0.2]) {
    const vine = fit(gl.vine.scene.clone(), { size: 0.9 });
    vine.position.set(x, H * 0.05, L / 2 + 0.05);
    bloom.add(vine);
  }
  car.add(bloom);

  const cabin = new THREE.PointLight(0xff9440, 6, 3.2, 1.6);
  cabin.position.set(0, H * 0.7, -0.2);
  car.add(cabin);

  const headlights = [];
  for (const sx of [-1, 1]) {
    const from = new THREE.Vector3(sx * W * 0.32, H * 0.42, L / 2 + 0.02);
    const spot = new THREE.SpotLight(0xffe6b0, 180, 22, 0.32, 0.5, 1.5);
    spot.position.copy(from);
    spot.target.position.set(sx * 0.6, 0.1, L / 2 + 12);
    const beam = beamCone(9, Math.tan(0.32) * 9, 0xffe6b0);
    aimAt(beam, from, spot.target.position);
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flare, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glare.position.copy(from).add(new THREE.Vector3(0, 0, 0.05));
    glare.scale.set(0.45, 0.45, 1);
    car.add(spot, spot.target, beam, glare);
    headlights.push({ spot, beam, glare });
  }

  const hoodSmoke = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color: 0xc9d4da, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    s.userData = { phase: i / 8, x: (r() - 0.5) * W * 0.6, z: L / 2 - 0.8 + r() * 0.6 };
    car.add(s);
    hoodSmoke.push(s);
  }
  animated.push((t, o) => {
    for (const s of hoodSmoke) {
      const u = s.userData;
      const k = (t * 0.12 + u.phase) % 1;
      s.position.set(u.x + Math.sin(t * 0.5 + u.phase * 9) * 0.2, H * 0.6 + k * 1.8, u.z);
      const sc = 0.6 + k * 1.8;
      s.scale.set(sc, sc, 1);
      s.material.opacity = Math.sin(k * Math.PI) * 0.35 * o.haze;
    }
    for (const h of headlights) {
      h.spot.intensity = 180 * o.headlights;
      h.beam.material.uniforms.intensity.value = 0.45 * o.headlights * o.haze;
      h.glare.material.opacity = Math.min(1, o.headlights);
    }
  });
  car.position.set(3.6, STAGE_TOP, 0.2);
  car.rotation.y = -1.05;
  add(scene, car);

  // ---------------------------------------------------------------- chingchi (qingqi): red motorbike pulling an orange tubular cab
  // Local frame: +x is the direction of travel, so the bike sits at +x and the cab's open rear at -x.
  // It's parked turned away so the open rear (and the keys player) faces the audience, like the reference photo.
  const ching = movable('chingchi', 'Chingchi');
  const bike = fit(gl.motorbike.scene, { size: 2.0, axis: 'max', longAxis: 'x' });
  eachMaterial(bike, (m) => {
    if (m.name === 'Green_Motor') m.color.set(0x8e1e16);
    if (m.name === 'Yellow_Motor') m.color.set(0x9a8a6a);
    return rustify(m, { amount: 0.35 });
  });
  bike.position.x = 1.3;
  ching.add(shadows(bike));

  const orange = rustify(new THREE.MeshStandardMaterial({ color: 0xc4621f, roughness: 0.55, metalness: 0.35 }), { amount: 0.45, scale: 2.6 });
  const tube = (from, to, rad = 0.022) => {
    const d = new THREE.Vector3().subVectors(to, from);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, d.length(), 8), orange);
    m.position.addVectors(from, to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const cab = new THREE.Group();
  const floorY = 0.56, roofY = 2.05, front = 0.25, rear = -1.3, half = 0.66;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(front - rear, 0.06, half * 2), orange);
  deck.position.set((front + rear) / 2, floorY, 0);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(front - rear, 0.18, half * 2 - 0.04), orange);
  skirt.position.set((front + rear) / 2, floorY - 0.12, 0);
  const drawbar = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 0.08), orange);
  drawbar.position.set(front + 0.35, floorY - 0.1, 0);
  cab.add(deck, skirt, drawbar);
  // bulkhead behind the rider: solid lower panel, rails above, QINGQI board under the roof
  const bulk = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, half * 2), orange);
  bulk.position.set(front, floorY + 0.3, 0);
  const nameMat = new THREE.MeshStandardMaterial({ map: qingqiTexture(), roughness: 0.7 });
  const nameBoard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, half * 2), [orange, nameMat, orange, orange, orange, orange]);
  nameBoard.position.set(front - 0.01, roofY - 0.32, 0);
  cab.add(bulk, nameBoard);
  for (const y of [floorY + 0.75, floorY + 0.95]) cab.add(tube(V(front, y, -half), V(front, y, half)));
  // corner posts, side rails and a low back rail; the rear stays open
  for (const x of [front, rear]) for (const z of [-half, half]) cab.add(tube(V(x, floorY, z), V(x, roofY, z), 0.026));
  for (const z of [-half, half]) {
    for (const y of [floorY + 0.38, floorY + 0.72, floorY + 1.0]) cab.add(tube(V(front, y, z), V(rear, y, z)));
    for (let x = rear + 0.3; x < front; x += 0.3) cab.add(tube(V(x, floorY, z), V(x, floorY + 0.72, z), 0.016));
  }
  cab.add(tube(V(rear, floorY + 0.38, -half), V(rear, floorY + 0.38, half)));
  // bench along the bulkhead, facing the open rear
  const seat = new THREE.MeshStandardMaterial({ color: 0x4a1e14, roughness: 0.8 });
  const bench = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, half * 2 - 0.1), seat);
  bench.position.set(front - 0.25, floorY + 0.42, 0);
  const benchBase = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, half * 2 - 0.12), orange);
  benchBase.position.set(front - 0.25, floorY + 0.2, 0);
  cab.add(bench, benchBase);
  // flat roof with a decorated fascia all round, overhanging the cab
  const roofW = front - rear + 0.35, roofD = half * 2 + 0.3;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.05, roofD), new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.8 }));
  roof.position.set((front + rear) / 2, roofY + 0.03, 0);
  cab.add(roof);
  const fascia = new THREE.MeshStandardMaterial({ map: fasciaTexture(), roughness: 0.7 });
  for (const sz of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.17, 0.02), [orange, orange, orange, orange, fascia, fascia]);
    strip.position.set((front + rear) / 2, roofY + 0.09, (sz * roofD) / 2);
    cab.add(strip);
  }
  for (const sx of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, roofD), [fascia, fascia, orange, orange, orange, orange]);
    strip.position.set((front + rear) / 2 + (sx * roofW) / 2, roofY + 0.09, 0);
    cab.add(strip);
  }
  // two small rear wheels with white rims
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.5, metalness: 0.4 });
  for (const z of [-half - 0.08, half + 0.08]) {
    const wheel = new THREE.Mesh(tyreGeo, tyreMat);
    wheel.scale.setScalar(0.62);
    wheel.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16), rimMat);
    rim.rotation.x = Math.PI / 2;
    for (const w of [wheel, rim]) w.position.set(-0.55, 0.21, z);
    cab.add(wheel, rim);
  }
  // a little ivy creeping up the posts
  for (const z of [-half, half]) {
    const vine = fit(gl.vine.scene.clone(), { size: 1.3 });
    vine.position.set(rear + 0.02, floorY + 0.2, z);
    cab.add(vine);
  }
  ching.add(shadows(cab));

  const keysPlayer = bandMember(gl, 'Man_Sitting');
  keysPlayer.rotation.y = -Math.PI / 2; // face the open rear
  keysPlayer.position.set(front - 0.32, floorY + 0.02, 0);
  const keyboard = shadows(fit(gl.keyboard.scene.clone(), { size: 1.0, axis: 'max', longAxis: 'x' }));
  keyboard.rotation.y = -Math.PI / 2; // keys toward the player
  // seated playing height: the keys' top edge about 0.75 m above the deck
  keyboard.position.set(front - 0.95, floorY + Math.max(0.02, 0.75 - sizeOf(keyboard).y), 0);
  ching.add(keysPlayer, keyboard);
  ching.position.set(7.0, STAGE_TOP, 0.6);
  ching.rotation.y = Math.PI - 2.25;
  add(scene, ching);

  // ---------------------------------------------------------------- mechanic's corner: pegboard of tools
  const corner = movable('pegboard', 'Tool wall');
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.0, 0.04), pegboardMaterial());
  board.position.y = 1.9;
  board.castShadow = board.receiveShadow = true;
  corner.add(board);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a221b, roughness: 0.9 });
  for (const x of [-1.45, 1.45]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.9, 0.08), frameMat);
    leg.position.set(x, 1.45, -0.04);
    corner.add(leg);
  }
  const tools = [
    ['wrench1', 0.45, -1.15, 2.4], ['wrench2', 0.38, -0.85, 2.45], ['wrench1', 0.32, -0.6, 2.5],
    ['hammer', 0.5, -0.25, 2.3], ['pipewrench', 0.55, 0.15, 2.3], ['saw', 0.7, 0.7, 2.25],
    ['screwdriver', 0.28, 1.15, 2.5], ['screwdriver', 0.25, 1.3, 2.48], ['pliers', 0.3, -1.05, 1.5],
    ['wrench2', 0.42, -0.6, 1.45], ['hammer', 0.42, 0.0, 1.45], ['pliers', 0.28, 0.45, 1.5], ['wrench1', 0.5, 0.95, 1.45],
  ];
  for (const [name, len, x, y] of tools) {
    const tool = hangFlat(gl[name].scene.clone(), len);
    eachMaterial(tool, (m) => rustify(m, { amount: 0.25, scale: 6 }));
    tool.position.set(x, y, 0.05);
    tool.rotation.z = (r() - 0.5) * 0.15;
    corner.add(tool);
  }
  shadows(corner);
  corner.position.set(-5.9, STAGE_TOP, -3.05);
  corner.rotation.y = 0.25;
  add(scene, corner);

  // Tall red rolling tool chest: casters, a stack of deep drawers, a top box of thin drawers with
  // its lid propped open, chrome handles and a side handle bar.
  const chest = movable('toolchest', 'Tool chest');
  const red = rustify(new THREE.MeshStandardMaterial({ color: 0x9a1e16, roughness: 0.42, metalness: 0.5 }), { amount: 0.28, scale: 3.2 });
  const redDark = new THREE.MeshStandardMaterial({ color: 0x3a0a07, roughness: 0.6, metalness: 0.4 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.25, metalness: 1 });
  const CW = 0.92, CD = 0.5;
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    chest.add(m);
    return m;
  };
  const drawerStack = (y0, heights) => {
    let y = y0;
    for (const h of heights) {
      box(CW - 0.06, h - 0.012, 0.025, red, 0, y + h / 2, CD / 2 + 0.012);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, CW * 0.7, 8), chromeMat);
      handle.rotation.z = Math.PI / 2;
      handle.position.set(0, y + h - 0.03, CD / 2 + 0.035);
      chest.add(handle);
      y += h;
    }
    return y;
  };
  for (const [x, z] of [[-0.38, -0.18], [0.38, -0.18], [-0.38, 0.18], [0.38, 0.18]]) {
    const caster = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 12), redDark);
    caster.rotation.z = Math.PI / 2;
    caster.position.set(x, 0.045, z);
    chest.add(caster);
  }
  const lowH = 0.86, lowY = 0.1;
  box(CW, lowH, CD, red, 0, lowY + lowH / 2, 0);
  drawerStack(lowY + 0.02, [0.13, 0.15, 0.16, 0.18, 0.2]);
  const topY = lowY + lowH + 0.02, topH = 0.46;
  box(CW - 0.04, topH, CD - 0.03, red, 0, topY + topH / 2, -0.015);
  drawerStack(topY + 0.02, [0.065, 0.065, 0.065, 0.065, 0.08, 0.1]);
  const lid = new THREE.Group();
  lid.position.set(0, topY + topH, -CD / 2 + 0.01);
  const lidPanel = new THREE.Mesh(new THREE.BoxGeometry(CW - 0.02, 0.05, CD - 0.02), red);
  lidPanel.position.z = (CD - 0.02) / 2;
  lid.add(lidPanel);
  lid.rotation.x = -1.15;
  chest.add(lid);
  // side handle bar on brackets
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, CD + 0.05, 8), chromeMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(CW / 2 + 0.07, lowY + lowH - 0.08, 0);
  chest.add(bar);
  for (const z of [-0.2, 0.2]) box(0.08, 0.025, 0.025, chromeMat, CW / 2 + 0.035, lowY + lowH - 0.08, z);
  shadows(chest);
  const can = shadows(fit(gl.jerrycan.scene, { size: 0.55 }));
  eachMaterial(can, (m) => rustify(m, { amount: 0.35, scale: 4 }));
  can.position.set(0.95, 0, 0.3);
  can.rotation.y = 0.4;
  chest.add(can);
  for (const [name, x, z, rot] of [['wrench2', -0.6, 0.9, 0.3], ['screwdriver', 0.3, 1.1, 1.2], ['pliers', 1.0, 0.95, 2.2]]) {
    const loose = fit(gl[name].scene.clone(), { size: 0.35, axis: 'max' });
    loose.position.set(x, 0.01, z);
    loose.rotation.y = rot;
    chest.add(shadows(loose));
  }
  chest.position.set(-7.6, STAGE_TOP, -1.6);
  chest.rotation.y = 0.5;
  add(scene, chest);

  // ---------------------------------------------------------------- drummer on a tyre stack in front of the tool wall
  const drums = movable('drums', 'Drummer');
  const kit = shadows(fit(gl.drums.scene.clone(), { size: 1.8, axis: 'max' }));
  kit.position.z = 0.55;
  const throne = instancedPile(tyreGeo, rubber, [[[0, 0.11, -0.4], [0, 0.3, 0]], [[0, 0.33, -0.4], [0, 1.1, 0]]], 'throne', 'Tyre seat');
  delete throne.userData.movable; // moves with the drummer
  const drummer = bandMember(gl, 'Man_Sitting');
  drummer.position.set(0, 0.0, -0.4);
  drums.add(kit, throne, drummer);
  drums.position.set(-4.1, STAGE_TOP, -1.2);
  drums.rotation.y = 0.2;
  add(scene, drums);

  // ---------------------------------------------------------------- singer under the hanging vintage mic
  const singer = movable('singer', 'Singer');
  const man = bandMember(gl, 'Man_Idle');
  man.add(overcoat());
  singer.add(man);
  const chrome = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 1, roughness: 0.3 });
  const micY = 1.62;
  const micZ = MIC_PIPE_Z - 1.25;
  const capsule = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.17, 12), chrome);
  capsule.position.set(0, micY + 0.08, micZ);
  const grille = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), chrome);
  grille.position.set(0, micY, micZ);
  const cableLen = TRUSS.y - 0.15 - STAGE_TOP - micY - 0.17;
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, cableLen), new THREE.MeshStandardMaterial({ color: 0x080808 }));
  cable.position.set(0, micY + 0.17 + cableLen / 2, micZ);
  singer.add(capsule, grille, cable);
  shadows(singer);
  singer.position.set(0, STAGE_TOP, 1.25);
  add(scene, singer);

  // ---------------------------------------------------------------- rusty barrels, some burning
  const barrelModel = fit(gl.barrel.scene, { size: 0.92 });
  eachMaterial(barrelModel, (m) =>
    rustify(new THREE.MeshStandardMaterial({ color: m.name === 'Grey' ? 0x2e2620 : 0x4a3a2c, roughness: 0.75, metalness: 0.4 }), { amount: 0.7, scale: 2.8 }),
  );
  const fireTop = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.5, 0.15).multiplyScalar(3) });
  const groups = [
    { id: 'barrels-left', at: [-7.9, STAGE_TOP, 0.6], items: [[0, 0, 0, false], [-0.7, 0, -0.35, true], [-0.15, 0, 0.75, false]] },
    { id: 'barrels-right', at: [8.3, STAGE_TOP, -2.4], items: [[0, 0, 0, true], [-0.75, 0, 0.3, false], [-0.2, 0, 0.85, false]] },
    { id: 'barrels-front-left', at: [-11.1, 0, 4.4], items: [[0, 0, 0, true], [0.8, 0, 0.4, false]] },
    { id: 'barrels-front-right', at: [11.0, 0, 4.2], items: [[0, 0, 0, false], [-0.8, 0, 0.5, true]] },
  ];
  const fires = [];
  for (const grp of groups) {
    const g = movable(grp.id, 'Barrels');
    for (const [x, y, z, burning] of grp.items) {
      const b = shadows(barrelModel.clone());
      b.position.set(x, y, z);
      b.rotation.y = r() * 6.28;
      g.add(b);
      if (burning) {
        const top = new THREE.Mesh(new THREE.CircleGeometry(0.27, 16), fireTop);
        top.rotation.x = -Math.PI / 2;
        top.position.set(x, 0.86, z);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: flare, color: 0xff8a30, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        glow.position.set(x, 1.15, z);
        glow.scale.set(1.6, 1.6, 1);
        g.add(top, glow);
        fires.push({ glow, phase: r() * 10 });
      }
    }
    // one real light per group; the rest is emissive + glow
    const l = new THREE.PointLight(0xff8a30, 8, 6, 1.6);
    l.position.set(0.3, 1.4, 0.3);
    g.add(l);
    fires.push({ light: l, phase: r() * 10 });
    g.position.set(...grp.at);
    add(scene, g);
  }
  animated.push((t, o) => {
    for (const f of fires) {
      const flick = 0.75 + 0.25 * Math.sin(t * 13 + f.phase) * Math.sin(t * 7.3 + f.phase * 2);
      if (f.light) f.light.intensity = 8 * o.fire * flick;
      if (f.glow) f.glow.material.opacity = Math.min(1, 0.85 * o.fire * flick);
    }
  });

  // ---------------------------------------------------------------- tyres: messy mounds, back stacks, strays, flowers on top
  // Mounds follow the reference: most tyres stand on edge or lean at every angle, a few lie flat,
  // and their heights follow a dome so the pile peaks in the middle.
  const mound = (count, radius, height, seed) => {
    const rr = mulberry32(seed);
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = rr() * Math.PI * 2, d = Math.sqrt(rr()) * radius;
      const dome = height * Math.pow(Math.max(0, 1 - (d / radius) ** 2), 0.75);
      const upright = rr() < 0.7;
      const base = upright ? 0.31 : 0.11;
      const y = base + Math.max(0, dome - base) * (0.45 + rr() * 0.55);
      const tilt = upright ? Math.PI / 2 + (rr() - 0.5) * 1.0 : (rr() - 0.5) * 0.5;
      out.push([[Math.cos(a) * d, y, Math.sin(a) * d], [tilt, rr() * Math.PI * 2, (rr() - 0.5) * 0.4]]);
    }
    return out;
  };
  const flowerSpots = [];
  for (const [id, at, count, radius, height, seed] of [
    ['tyres-front-left', [-9.3, 0, 5.7], 46, 1.6, 1.9, 3],
    ['tyres-front-right', [9.3, 0, 5.7], 42, 1.5, 1.7, 4],
  ]) {
    const g = instancedPile(tyreGeo, rubber, mound(count, radius, height, seed), id, 'Tyre pile');
    g.position.set(...at);
    add(scene, g);
    flowerSpots.push([at[0] + 0.1, height + 0.15, at[2]]);
  }
  // stacks along the back, a few with a tyre leaning against them
  const stacks = [];
  for (const [x, n] of [[7.7, 6], [6.9, 4], [2.7, 5], [-2.3, 7], [-6.95, 4], [-7.75, 7]]) {
    for (let i = 0; i < n; i++) stacks.push([[x + (r() - 0.5) * 0.08, 0.11 + i * 0.22, (r() - 0.5) * 0.08], [(r() - 0.5) * 0.08, r() * 6.28, (r() - 0.5) * 0.05]]);
    if (n > 4) stacks.push([[x + 0.45, 0.32, 0.3], [Math.PI / 2 - 0.35, 0.5 + r(), 0]]);
    flowerSpots.push([x, STAGE_TOP + n * 0.22 + 0.02, -3.25]);
  }
  const back = instancedPile(tyreGeo, rubber, stacks, 'tyres-back', 'Tyre stacks');
  back.position.set(0, STAGE_TOP, -3.25);
  add(scene, back);
  const strays = instancedPile(
    tyreGeo,
    rubber,
    [
      [[5.6, 0.11, 4.9], [0, -0.3, 0]],
      [[5.55, 0.33, 4.92], [0.08, -1.2, 0]],
      [[2.3, 0.31, 4.45], [Math.PI / 2 - 0.25, -0.1, 0]],
      [[-3.1, 0.31, 5.3], [Math.PI / 2 + 0.6, -2.0, 0]],
      [[-6.0, 0.31, 4.45], [Math.PI / 2 - 0.3, 0.2, 0]],
      [[-6.85, 0.11, 5.45], [0, -0.7, 0]],
    ],
    'tyres-floor',
    'Tyres',
  );
  add(scene, strays);
  // flowers sprouting from the top of both mounds and every other back stack
  for (const p of flowerSpots.filter((_, i) => i < 2 || i % 2 === 0)) {
    const f = fit(gl.flowers.scene.clone(), { size: 0.55, axis: 'max' });
    f.position.set(...p);
    scene.add(f);
  }

  // tyre hanging from the truss on a chain, with a bare bulb glowing inside
  const hanging = movable('hanging-tyre', 'Hanging tyre');
  const ht = new THREE.Mesh(tyreGeo, tyreMat);
  ht.rotation.x = Math.PI / 2;
  ht.castShadow = true;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.4).multiplyScalar(4) }));
  const bulbLight = new THREE.PointLight(0xffb060, 5, 5, 1.6);
  const bulbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: flare, color: 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  bulbGlow.scale.set(1.3, 1.3, 1);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.6), new THREE.MeshStandardMaterial({ color: 0x2a2622, metalness: 0.7 }));
  rope.position.y = 0.33 + 0.8;
  hanging.add(ht, bulb, bulbLight, bulbGlow, rope);
  hanging.position.set(5.2, TRUSS.y - 2.0, TRUSS.front);
  add(scene, hanging);

  // ---------------------------------------------------------------- workshop clutter so the stage feels lived in
  const crateMat = crateMaterial();
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6, metalness: 0.3 });
  const grilleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e5236, roughness: 0.95 });
  const part = (geo, mat, x, y, z, parent) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const place = (g, x, z, yaw = 0) => {
    g.position.set(x, STAGE_TOP, z);
    g.rotation.y = yaw;
    add(scene, g);
  };
  const pallet = (parent) => {
    for (let i = 0; i < 5; i++) part(new THREE.BoxGeometry(1.2, 0.025, 0.14), woodMat, 0, 0.13, -0.4 + i * 0.2, parent);
    for (const z of [-0.4, 0, 0.4]) part(new THREE.BoxGeometry(1.2, 0.1, 0.1), woodMat, 0, 0.065, z, parent);
  };

  // wedge monitors on the lip, sloped faces toward the singer
  const wedgeShape = new THREE.Shape([new THREE.Vector2(-0.28, 0), new THREE.Vector2(0.28, 0), new THREE.Vector2(0.28, 0.38), new THREE.Vector2(-0.28, 0.12)]);
  const wedgeGeo = new THREE.ExtrudeGeometry(wedgeShape, { depth: 0.62, bevelEnabled: false });
  wedgeGeo.rotateY(-Math.PI / 2);
  wedgeGeo.translate(0.31, 0, 0);
  for (const [x, yaw] of [[-1.35, 0.35], [1.35, -0.35]]) {
    const w = movable(`wedge-${x < 0 ? 'left' : 'right'}`, 'Wedge monitor');
    part(wedgeGeo, metalDark, 0, 0, 0, w);
    place(w, x, 3.35, yaw);
  }

  // guitar amp stacks: cab with a grille, head with a row of knobs and a red pilot light
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.9, roughness: 0.3 });
  const pilotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.15, 0.1).multiplyScalar(3) });
  const amp = (id) => {
    const g = movable(id, 'Amp stack');
    part(new THREE.BoxGeometry(0.78, 0.78, 0.38), metalDark, 0, 0.39, 0, g);
    part(new THREE.PlaneGeometry(0.66, 0.66), grilleMat, 0, 0.39, 0.191, g);
    part(new THREE.BoxGeometry(0.78, 0.26, 0.34), metalDark, 0, 0.91, 0, g);
    for (let i = 0; i < 6; i++) part(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8).rotateX(Math.PI / 2), knobMat, -0.27 + i * 0.11, 0.9, 0.18, g);
    part(new THREE.SphereGeometry(0.015, 6, 4), pilotMat, 0.33, 0.96, 0.17, g);
    return g;
  };
  place(amp('amp-left'), -5.7, 1.9, 0.45);
  place(amp('amp-right'), 2.4, -2.6, -0.3);

  // crates on pallets: a stack front-right with a spare wheel leaning on it, another behind the car
  const crateStack = (id, boxes) => {
    const g = movable(id, 'Crates');
    pallet(g);
    for (const [s, x, y, z, yaw] of boxes) part(new THREE.BoxGeometry(s, s, s), crateMat, x, 0.155 + y + s / 2, z, g).rotation.y = yaw;
    return g;
  };
  const wheelRim = new THREE.MeshStandardMaterial({ color: 0x55534f, roughness: 0.45, metalness: 0.8 });
  const spareWheel = (parent, x, z, lean, yaw) => {
    const w = new THREE.Group();
    w.add(new THREE.Mesh(tyreGeo, tyreMat), new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 16), wheelRim));
    shadows(w);
    w.rotation.set(Math.PI / 2 - lean, yaw, 0, 'YXZ');
    w.position.set(x, 0.33 - Math.sin(lean) * 0.1, z);
    parent.add(w);
  };
  const crates1 = crateStack('crates-front', [[0.62, -0.25, 0, 0, 0.1], [0.55, 0.3, 0, 0.05, -0.15], [0.5, 0, 0.62, 0, 0.4]]);
  spareWheel(crates1, 0.15, 0.62, 0.3, 0.2);
  place(crates1, 4.9, 2.95, -0.2);
  place(crateStack('crates-back', [[0.7, -0.22, 0, 0, 0], [0.62, 0.0, 0.7, 0.05, 0.3], [0.45, 0.35, 0, 0.1, -0.2]]), 5.2, -3.05, 0.1);

  // stripped engine block on a pallet behind the car
  const engine = movable('engine', 'Engine block');
  pallet(engine);
  const iron = rustify(new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.6, metalness: 0.7 }), { amount: 0.55, scale: 5 });
  part(new THREE.BoxGeometry(0.75, 0.42, 0.5), iron, 0, 0.36, 0, engine);
  part(new THREE.BoxGeometry(0.7, 0.14, 0.32), iron, 0, 0.64, 0, engine);
  for (const sz of [-1, 1]) part(new THREE.BoxGeometry(0.72, 0.1, 0.08), iron, 0, 0.6, sz * 0.26, engine).rotation.x = sz * 0.35;
  part(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16).rotateZ(Math.PI / 2), iron, 0.4, 0.36, 0.05, engine);
  part(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), metalDark, -0.2, 0.75, -0.15, engine).rotation.z = 1.2;
  place(engine, 3.9, -2.35, 0.5);

  // jerry cans, paint tins and a small red toolbox at the front corners
  const tin = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.45, metalness: 0.8 });
  const odds = (id, cans, tins) => {
    const g = movable(id, 'Cans');
    for (const [x, z, yaw] of cans) {
      const c = can.clone();
      c.position.set(x, 0, z);
      c.rotation.y = yaw;
      g.add(c);
    }
    for (const [x, z] of tins) part(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 12), tin, x, 0.11, z, g);
    return g;
  };
  const oddsLeft = odds('odds-left', [[0, 0, 0.3], [0.45, 0.15, -0.5]], [[-0.35, 0.4], [-0.15, 0.62], [0.9, 0.5]]);
  const toolbox = new THREE.Group();
  part(new THREE.BoxGeometry(0.55, 0.22, 0.25), red, 0, 0.11, 0, toolbox);
  part(new THREE.BoxGeometry(0.3, 0.03, 0.03), chromeMat, 0, 0.26, 0, toolbox);
  toolbox.position.set(0.9, 0, -0.1);
  toolbox.rotation.y = 0.4;
  oddsLeft.add(toolbox);
  place(oddsLeft, -7.2, 2.6, 0.2);
  const oddsRight = odds('odds-right', [[0, 0, -0.6], [0.5, -0.2, 0.9]], [[-0.35, 0.3]]);
  spareWheel(oddsRight, 0.95, 0.25, 1.5, 0.6); // lying almost flat
  place(oddsRight, 6.6, 3.3, -0.3);

  // cables snaking across the deck to the amps
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 });
  for (const pts of [
    [[-0.1, 1.6], [-1.2, 2.4], [-2.8, 2.1], [-4.4, 2.5], [-5.6, 1.9]],
    [[-4.1, -0.5], [-4.6, 0.6], [-5.2, 1.2], [-5.6, 1.7]],
    [[-1.35, 3.2], [-0.6, 2.7], [0.3, 2.9], [1.35, 3.2]],
    [[6.0, 1.5], [4.6, 2.0], [3.2, 1.9], [2.6, 0.2], [2.4, -2.4]],
    [[0.2, 1.4], [1.0, -0.6], [1.9, -1.9], [2.3, -2.5]],
  ]) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, STAGE_TOP + 0.012, z)));
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 12, 0.012, 5), cableMat);
    cable.receiveShadow = true;
    scene.add(cable);
  }

  // ladder leaning back against the left rear tower
  const ladder = movable('ladder', 'Ladder');
  const alu = new THREE.MeshStandardMaterial({ color: 0xa8aaad, roughness: 0.4, metalness: 0.85 });
  const rungs = new THREE.Group();
  for (const x of [-0.22, 0.22]) part(new THREE.BoxGeometry(0.05, 3.6, 0.03), alu, x, 1.8, 0, rungs);
  for (let i = 0; i < 11; i++) part(new THREE.CylinderGeometry(0.016, 0.016, 0.44).rotateZ(Math.PI / 2), alu, 0, 0.25 + i * 0.3, 0, rungs);
  rungs.rotation.x = -0.27;
  ladder.add(rungs);
  place(ladder, -8.05, -2.6, 0.75);

  // work lights on tripods, raking warm light across the tool wall and the qingqi
  const workLights = [];
  const yellow = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.5, metalness: 0.4 });
  const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.6).multiplyScalar(3) });
  for (const [x, z, target] of [[-3.0, -2.75, [-6.2, 1.8, -3.0]], [6.1, -2.4, [6.6, 1.5, 1.4]]]) {
    const g = movable(`worklight-${x < 0 ? 'left' : 'right'}`, 'Work light');
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      part(new THREE.CylinderGeometry(0.012, 0.012, 1.7), metalDark, Math.cos(a) * 0.22, 0.8, Math.sin(a) * 0.22, g).rotation.set(Math.sin(a) * 0.27, 0, -Math.cos(a) * 0.27);
    }
    const head = new THREE.Group();
    head.position.y = 1.65;
    part(new THREE.BoxGeometry(0.3, 0.22, 0.12), yellow, 0, 0, 0, head);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.16), lensMat);
    lens.position.z = 0.061;
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flare, color: 0xffd7a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glare.position.z = 0.1;
    glare.scale.set(0.9, 0.9, 1);
    head.add(lens, glare);
    g.add(head);
    place(g, x, z);
    const aim = new THREE.Vector3(...target);
    g.updateMatrixWorld(true);
    head.lookAt(aim);
    const spot = new THREE.SpotLight(0xffd7a0, 40, 9, 0.55, 0.6, 1.5);
    spot.position.set(0, 1.65, 0);
    spot.target.position.copy(g.worldToLocal(aim.clone()));
    g.add(spot, spot.target);
    workLights.push({ spot, glare });
  }

  // festoon bulbs draped along the front and back truss
  const festoon = [];
  for (const [z, sag] of [[TRUSS.front + 0.1, 0.9], [TRUSS.back + 0.25, 1.6]]) {
    for (const [x0, x1] of [[-TRUSS.x, 0], [0, TRUSS.x]]) {
      const n = Math.round((x1 - x0) / 0.42);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        festoon.push(new THREE.Vector3(x0 + (x1 - x0) * u, TRUSS.y - 0.3 - sag * 4 * u * (1 - u), z));
      }
    }
  }
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), festoon.length);
  const warmBulb = new THREE.Color(1, 0.7, 0.38);
  festoon.forEach((p, i) => {
    bulbs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
    bulbs.setColorAt(i, warmBulb.clone().multiplyScalar(1.6 + (i % 3) * 0.5));
  });
  scene.add(bulbs);
  animated.push((t, o, levels) => {
    for (const w of workLights) {
      w.spot.intensity = 40 * o.worklights;
      w.glare.material.opacity = Math.min(1, o.worklights);
    }
    bulbs.material.color.setScalar(o.festoon * (0.85 + Math.pow(levels.mid, 2) * 0.6 * o.reactivity));
  });

  // two crew hanging around: one perched on tyres behind the car, one by the tool chest
  const crewOutfit = { Shirt: 0x2b3440, Pants: 0x22262c, Socks: 0x101010 };
  const sitter = movable('crew-sitting', 'Crew');
  const crewSeat = instancedPile(tyreGeo, rubber, [[[0, 0.11, 0], [0, 0.4, 0]], [[0, 0.33, 0], [0, 1.3, 0]]], 'crew-seat', 'Tyre seat');
  delete crewSeat.userData.movable; // moves with the crew member
  sitter.add(crewSeat, posePerson(gl.person, 'Man_Sitting', { outfit: crewOutfit }));
  place(sitter, 2.9, -1.9, -0.6);
  const leaner = movable('crew-standing', 'Crew');
  leaner.add(posePerson(gl.person, 'Man_Idle', { outfit: crewOutfit }), trousers());
  place(leaner, -6.75, -2.25, 0.7);

  return {
    update(t, dt, levels, o) {
      for (const fn of animated) fn(t, o, levels);
      bulbLight.intensity = 5 * o.fire;
    },
    apply() {},
  };
}
