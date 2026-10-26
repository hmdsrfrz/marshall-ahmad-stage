import * as THREE from 'three';
import { loadModels, fit, shadows, eachMaterial, movable, movableRegistry, posePerson } from '../../engine/models.js';
import { STAGE, STAGE_FRONT, BOX } from './set.js';
import { beamCone, aimAt, glowTexture } from '../../engine/fx.js';

export const CREDITS = [
  { name: 'Car', author: 'Quaternius', id: 'HQ0hvRM2XR', license: 'CC-BY 3.0' },
  { name: 'Shipping Container', author: 'Davidlamic000', id: '83Cai5aKxa', license: 'CC0' },
  { name: 'Drum Set', author: 'Zsky', id: 'qWU9Q4flfQ', license: 'CC-BY 3.0' },
  { name: 'Keyboard', author: 'S. Paul Michael', id: 'fP_S-_T1BOZ', license: 'CC-BY 3.0' },
  { name: 'Mic', author: 'iPoly3D', id: 'yqbacXdPsg', license: 'CC0' },
  { name: 'Floor Monitor', author: 'Peter Simcoe', id: '2827m06VfIA', license: 'CC-BY 3.0' },
  { name: 'Motorised Spotlight', author: 'iPoly3D', id: 'BLq0yBWHce', license: 'CC0' },
  { name: 'Spotlight', author: 'iPoly3D', id: 'YohOCmn0hO', license: 'CC0' },
  { name: 'Debris Pile', author: 'Quaternius', id: 'WrIiMMxyEP', license: 'CC0' },
  { name: 'Rubble Rocks', author: 'Kyle Hickman', id: '8mnEv3ilxEP', license: 'CC-BY 3.0' },
  { name: 'Man', author: 'Quaternius', id: 'HMnuH5geEG', license: 'CC0' },
];

export async function buildProps(scene, set) {
  const names = ['car', 'container', 'drums', 'keyboard', 'micstand', 'monitor', 'movinghead', 'parcan', 'debris', 'rocks', 'person'];
  const gl = await loadModels(Object.fromEntries(names.map((n) => [n, `${n}.glb`])));

  const movables = [];
  const add = movableRegistry(movables);
  const amber = new THREE.Color(1, 0.55, 0.12);
  const containers = [];
  const movingHeads = [];
  const parcans = [];

  // --- Containers, opened toward the audience by clipping off their front wall
  const C = { w: 2.5, h: 4.4, d: 2.8 };
  for (const side of [-1, 1]) {
    const g = movable(`container-${side < 0 ? 'left' : 'right'}`, side < 0 ? 'Keys container' : 'Drum container');
    const body = fit(gl.container.scene.clone(), { size: C.h, longAxis: 'z' });
    const s = new THREE.Box3().setFromObject(body, true).getSize(new THREE.Vector3());
    body.scale.set(C.w / s.x, 1, C.d / s.z);
    const plane = new THREE.Plane();
    eachMaterial(body, (m) => {
      m.map = null;
      m.color.set(0x24262a);
      m.roughness = 0.65;
      m.metalness = 0.4;
      m.side = THREE.DoubleSide;
      m.clippingPlanes = [plane];
      m.clipShadows = true;
    });
    shadows(body);
    g.add(body);

    const barMat = new THREE.MeshBasicMaterial({ color: amber.clone().multiplyScalar(4) });
    const bar = new THREE.BoxGeometry(0.06, C.h - 0.6, 0.06);
    const barSpots = [
      [-0.6, -C.d / 2 + 0.15],
      [0.6, -C.d / 2 + 0.15],
      [-C.w / 2 + 0.14, -0.4],
      [-C.w / 2 + 0.14, 0.7],
      [C.w / 2 - 0.14, -0.4],
      [C.w / 2 - 0.14, 0.7],
    ];
    for (const [x, z] of barSpots) {
      const b = new THREE.Mesh(bar, barMat);
      b.position.set(x, C.h / 2, z);
      g.add(b);
    }
    const light = new THREE.PointLight(amber, 25, 7, 1.6);
    light.position.set(0, C.h - 0.7, -0.2);
    g.add(light);
    const spill = new THREE.PointLight(amber, 12, 6, 1.6);
    spill.position.set(0, 1.2, C.d / 2 + 0.3);
    g.add(spill);

    if (side < 0) {
      const player = posePerson(gl.person, 'Man_Idle');
      player.position.set(0, 0.02, -0.6);
      const keys = shadows(fit(gl.keyboard.scene, { size: 1.3, axis: 'max', longAxis: 'x' }));
      keys.position.set(0, 0.02, 0.3);
      g.add(player, keys);
    } else {
      const drummer = posePerson(gl.person, 'Man_Sitting');
      drummer.position.set(0, 0.02, -0.85);
      const kit = shadows(fit(gl.drums.scene, { size: 1.7, axis: 'max' }));
      kit.position.set(0, 0.02, 0.1);
      g.add(drummer, kit);
    }

    g.position.set(side * 4.6, STAGE.h, -1.1);
    g.rotation.y = -side * 0.3; // angled in toward centre stage
    // cut deep enough to drop the door frame and locking bars along with the wall
    containers.push({ g, plane, barMat, light, spill, frontZ: C.d / 2 - 0.4 });
    add(scene, g);
  }

  // --- Car: parked flat on the stage, turned diagonally to the audience
  const car = movable('car', 'Car');
  const carModel = fit(gl.car.scene, { size: 4.3, axis: 'max', longAxis: 'z' });
  eachMaterial(carModel, (m) => {
    if (m.name === 'Main') {
      return new THREE.MeshPhysicalMaterial({ color: 0xe0a01a, roughness: 0.45, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    }
    if (m.name === 'Windows') {
      return new THREE.MeshPhysicalMaterial({ color: 0x0b0d10, roughness: 0.05, metalness: 0.6 });
    }
    return m;
  });
  shadows(carModel);
  car.add(carModel);
  car.position.set(0.3, STAGE.h, -2.1);
  car.rotation.y = 0.6;
  add(scene, car);

  const debris = movable('debris', 'Rubble');
  const pile = shadows(fit(gl.debris.scene, { size: 2.2, axis: 'max' }));
  const rocks = shadows(fit(gl.rocks.scene, { size: 1.8, axis: 'max' }));
  rocks.position.set(0.6, 0, 0.4);
  eachMaterial(rocks, (m) => m.color.multiplyScalar(0.3));
  debris.add(pile, rocks);
  debris.position.set(-2.3, STAGE.h, -3.4);
  add(scene, debris);

  // --- Singer
  const singer = movable('singer', 'Singer');
  const person = posePerson(gl.person, 'Man_Idle');
  const mic = shadows(fit(gl.micstand.scene, { size: 1.62 }));
  eachMaterial(mic, (m) => m.emissive.set(0x000000));
  mic.position.z = 0.38;
  singer.add(person, mic);
  singer.position.set(0, STAGE.h, 1.4);
  add(scene, singer);

  // --- Wedge monitors along the front edge, angled back at the performers
  [-5.2, -1.7, 1.7, 5.2].forEach((x, i) => {
    const m = movable(`monitor-${i}`, 'Monitor');
    const body = fit(gl.monitor.scene.clone(), { size: 0.75, axis: 'max' });
    eachMaterial(body, (mat) => {
      mat.color.multiplyScalar(0.12);
      mat.roughness = 0.6;
    });
    m.add(shadows(body));
    m.position.set(x, STAGE.h, STAGE_FRONT - 0.55);
    m.rotation.y = Math.PI;
    add(scene, m);
  });

  // --- Front uplights: small floods on the lip, firing up and back at the band
  const flare = glowTexture('rgba(255,255,255,1)', 0.18);
  [-6.4, -3.3, 3.3, 6.4].forEach((x, i) => {
    const p = movable(`uplight-${i}`, 'Uplight');
    p.add(shadows(fit(gl.parcan.scene.clone(), { size: 0.4, axis: 'max' })));
    const spot = new THREE.SpotLight(0xffffff, 70, 16, 0.55, 0.6, 1.4);
    spot.position.set(0, 0.3, 0);
    spot.target.position.set(0, 5, -6);
    p.add(spot, spot.target);
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flare, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    glare.position.set(0, 0.3, 0.1);
    glare.scale.set(0.9, 0.9, 1);
    p.add(glare);
    p.position.set(x, STAGE.h, STAGE_FRONT - 0.25);
    parcans.push({ spot, glare });
    add(scene, p);
  });

  // --- Concert rig: two trusses under the tarp roof, four moving heads on each (they tilt with the box)
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6, metalness: 0.5 });
  const rigRows = [-BOX.d / 2 + 1.4, BOX.d / 2 - 1.8];
  for (const z of rigRows) {
    const truss = new THREE.Mesh(new THREE.BoxGeometry(BOX.w - 1.2, 0.3, 0.3), trussMat);
    truss.position.set(0, BOX.h - 0.35, z);
    set.box.add(truss);
  }
  const headModel = fit(gl.movinghead.scene, { size: 0.7, rot: [Math.PI, 0, 0] });
  let n = 0;
  for (const [row, z] of rigRows.entries()) {
    for (const x of [-5.4, -1.8, 1.8, 5.4]) {
      const fx = movable(`spot-${n}`, 'Moving head');
      const pan = new THREE.Group();
      const body = headModel.clone();
      body.position.y = -0.7;
      pan.add(body);
      fx.add(pan);
      fx.position.set(x, BOX.h - 0.5, z);
      add(set.box, fx);

      const light = new THREE.SpotLight(0xffffff, 500, 45, 0.12, 0.4, 1.5);
      const target = new THREE.Object3D();
      const cone = beamCone(12, Math.tan(0.12) * 12, 0xffffff);
      scene.add(light, target, cone);
      movingHeads.push({ fx, pan, light, target, cone, x, row, i: n, aim: new THREE.Vector3(x, STAGE.h, 0) });
      n++;
    }
  }

  // Each pattern returns a world-space aim point for one head; heads glide between them.
  const PATTERNS = {
    fan: (m, t) => _t.set(m.x * 2.4 + Math.sin(t * 0.6) * 3, 0, 14 + Math.sin(t * 0.9 + m.i) * 3),
    cross: (m, t) => _t.set(-m.x * 0.9 + Math.sin(t * 0.8 + m.row * Math.PI) * 1.5, STAGE.h, m.row ? -1 : 2),
    ballyhoo: (m, t) => _t.set(Math.sin(t * 0.9 + m.i * 0.8) * 5, STAGE.h, 0.5 + Math.cos(t * 0.7 + m.i * 1.3) * 3),
    singer: () => _t.set(0, STAGE.h + 0.4, 1.4),
  };
  const AUTO = ['fan', 'ballyhoo', 'cross', 'fan', 'singer', 'ballyhoo'];
  let started = false;

  const _p = new THREE.Vector3();
  const _t = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _q = new THREE.Quaternion();

  function update(t, dt, levels, opts) {
    for (const c of containers) {
      c.g.updateMatrixWorld();
      c.g.getWorldQuaternion(_q);
      _n.set(0, 0, -1).applyQuaternion(_q);
      c.plane.setFromNormalAndCoplanarPoint(_n, c.g.localToWorld(_p.set(0, 0, c.frontZ)));
      const k = opts.containerGlow * (1 + levels.mid * 0.45 * opts.reactivity);
      c.barMat.color.copy(opts.containerColor).multiplyScalar(4 * k);
      c.light.color.copy(opts.containerColor);
      c.spill.color.copy(opts.containerColor);
      c.light.intensity = 25 * k;
      c.spill.intensity = 12 * k;
    }

    for (const p of parcans) {
      p.spot.intensity = 70 * opts.uplights;
      p.glare.material.opacity = Math.min(1, opts.uplights);
    }

    const name = opts.pattern === 'auto' ? AUTO[Math.floor(t / 8) % AUTO.length] : opts.pattern;
    const pattern = PATTERNS[name] ?? PATTERNS.ballyhoo;
    const glide = started ? 1 - Math.exp(-dt * 2.5) : 1;
    started = true;
    const punch = 0.75 + levels.bass * 0.6 * opts.reactivity;
    for (const m of movingHeads) {
      m.fx.updateMatrixWorld();
      m.fx.localToWorld(_p.set(0, -0.45, 0));
      m.aim.lerp(pattern(m, t), glide);
      m.light.position.copy(_p);
      m.target.position.copy(m.aim);
      m.light.intensity = 500 * opts.spots * punch;
      const dist = _p.distanceTo(m.aim);
      aimAt(m.cone, _p, m.aim);
      m.cone.scale.setScalar(dist / 12);
      m.cone.material.uniforms.intensity.value = opts.spots * opts.haze * punch;
      const local = m.fx.worldToLocal(_t.copy(m.aim));
      m.pan.rotation.y = Math.atan2(local.x, local.z);
    }
  }

  return { movables, update };
}
