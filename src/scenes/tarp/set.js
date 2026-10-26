import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mulberry32 } from '../../engine/noise.js';
import { glowTexture, smokeTexture, beamCone, aimAt } from '../../engine/fx.js';
import { createTarpMaterial, hangPlasticWalls } from '../../engine/plastic.js';

export const BOX = { w: 16, h: 7.5, d: 10 };
export const STAGE = { w: 14, h: 0.9, d: 8.5, z: -0.25 };
export const STAGE_FRONT = STAGE.z + STAGE.d / 2;

// Tall sheet gathered and tied at mid-height, like the bunched corners in the reference.
function gatheredCurtain(w, h, seed) {
  const g = new THREE.PlaneGeometry(w, h, 36, 70);
  const r = mulberry32(seed);
  const phase = r() * 6;
  const pos = g.attributes.position;
  const tie = -h * 0.12;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const pinch = 1 - 0.78 * Math.exp(-(((y - tie) / (h * 0.22)) ** 2));
    const twist = (y - tie) * 0.35;
    const folds = Math.sin(x * 9 + twist + phase) * 0.12 + Math.sin(x * 23 + y * 0.8) * 0.03;
    pos.setX(i, x * pinch);
    pos.setZ(i, folds * (1.2 - pinch * 0.5) + (r() - 0.5) * 0.03);
  }
  g.computeVertexNormals();
  return g;
}


export function buildSet(scene, renderer) {
  const api = {};

  // --- Hall floor: real reflection under a semi-transparent wet-concrete layer
  const reflector = new Reflector(new THREE.PlaneGeometry(120, 120), {
    textureWidth: Math.floor(window.innerWidth * 0.6),
    textureHeight: Math.floor(window.innerHeight * 0.6),
    color: 0x8a8580,
  });
  reflector.rotation.x = -Math.PI / 2;
  scene.add(reflector);

  const floorAlpha = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = 'rgb(225,225,225)';
    x.fillRect(0, 0, 512, 512);
    const r = mulberry32(3);
    for (let i = 0; i < 90; i++) {
      const cx = r() * 512, cy = r() * 512, rad = 20 + r() * 90;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const v = Math.floor(150 + r() * 60);
      g.addColorStop(0, `rgba(${v},${v},${v},0.8)`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      x.fillStyle = g;
      x.fillRect(0, 0, 512, 512);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 10);
    return t;
  })();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x15110d, roughness: 0.55, metalness: 0.1, transparent: true, alphaMap: floorAlpha }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.005;
  floor.receiveShadow = true;
  scene.add(floor);

  // --- Stage riser
  const stage = new THREE.Group();
  stage.position.z = STAGE.z;
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(STAGE.w, 0.12, STAGE.d),
    new THREE.MeshStandardMaterial({ color: 0x0d0c0b, roughness: 0.28, metalness: 0.2 }),
  );
  top.position.y = STAGE.h - 0.06;
  top.receiveShadow = true;
  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(STAGE.w - 0.4, STAGE.h - 0.12, STAGE.d - 0.4),
    new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 }),
  );
  skirt.position.y = (STAGE.h - 0.12) / 2;
  stage.add(top, skirt);

  // Reactive LED strip tucked under the lip of the riser
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const stripGeoF = new THREE.BoxGeometry(STAGE.w - 0.3, 0.04, 0.04);
  const stripGeoS = new THREE.BoxGeometry(0.04, 0.04, STAGE.d - 0.3);
  const stripF = new THREE.Mesh(stripGeoF, stripMat);
  stripF.position.set(0, STAGE.h - 0.16, STAGE.d / 2 - 0.17);
  const stripL = new THREE.Mesh(stripGeoS, stripMat);
  stripL.position.set(-STAGE.w / 2 + 0.17, STAGE.h - 0.16, 0);
  const stripR = stripL.clone();
  stripR.position.x *= -1;
  stage.add(stripF, stripL, stripR);

  // Wash of light down the skirt from the strip: bright under the lip, fading toward the floor
  const washTex = (() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0.08)');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(c);
  })();
  const washMat = new THREE.MeshBasicMaterial({ map: washTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const washH = STAGE.h - 0.14;
  const washF = new THREE.Mesh(new THREE.PlaneGeometry(STAGE.w - 0.4, washH), washMat);
  washF.position.set(0, washH / 2, STAGE.d / 2 - 0.19);
  const washL = new THREE.Mesh(new THREE.PlaneGeometry(STAGE.d - 0.4, washH), washMat);
  washL.rotation.y = -Math.PI / 2;
  washL.position.set(-STAGE.w / 2 + 0.19, washH / 2, 0);
  const washR = washL.clone();
  washR.rotation.y = Math.PI / 2;
  washR.position.x *= -1;
  stage.add(washF, washL, washR);
  scene.add(stage);

  const underLights = [-5, 0, 5].map((x) => {
    const l = new THREE.PointLight(0xffffff, 0, 9, 1.6);
    l.position.set(x, 0.35, STAGE_FRONT + 0.4);
    scene.add(l);
    return l;
  });

  // Soft pool of light on the hall floor around the riser base
  const poolTex = (() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const x = c.getContext('2d');
    x.filter = 'blur(28px)';
    x.fillStyle = 'white';
    x.fillRect(80, 70, 352, 116);
    return new THREE.CanvasTexture(c);
  })();
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(STAGE.w * 1.45, STAGE.d * 1.6),
    new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.3 }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.012, STAGE.z);
  scene.add(pool);

  // --- Tarp box: rotated as a rigid body about its front-bottom edge so the back lifts off the floor
  const pivot = new THREE.Group();
  pivot.position.set(0, 0, BOX.d / 2);
  const box = new THREE.Group();
  box.position.z = -BOX.d / 2;
  pivot.add(box);
  scene.add(pivot);

  const tarpMat = createTarpMaterial();
  const { w, h, d } = BOX;
  // back and side walls in two crossing layers; roof pulled tight (almost no slack, no sag),
  // its local +z points down after the rotation
  const plastic = hangPlasticWalls(
    [
      { len: w, height: h, center: [0, h / 2, -d / 2], rot: [0, 0, 0], along: [1, 0, 0], inward: [0, 0, 1], layers: 2 },
      { len: d, height: h, center: [-w / 2, h / 2, 0], rot: [0, Math.PI / 2, 0], along: [0, 0, -1], inward: [1, 0, 0], layers: 2 },
      { len: d, height: h, center: [w / 2, h / 2, 0], rot: [0, -Math.PI / 2, 0], along: [0, 0, 1], inward: [-1, 0, 0], layers: 2 },
      { len: w, height: d, center: [0, h, 0], rot: [Math.PI / 2, 0, 0], along: [1, 0, 0], inward: [0, -1, 0], gravity: [0, 0, 0], slack: 0.002 },
    ],
    { material: tarpMat, parent: box },
  );
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(gatheredCurtain(2.4, h, sx > 0 ? 11 : 12), tarpMat);
    c.position.set(sx * (w / 2 - 1.0), h / 2, d / 2 - 0.5);
    c.rotation.y = sx * 0.35;
    c.renderOrder = 6;
    box.add(c);
  }

  // LED tubes on every edge of the box
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.93) });
  const tube = (len) => new THREE.CylinderGeometry(0.035, 0.035, len, 8);
  const edges = [];
  for (const y of [0, h]) {
    for (const z of [-d / 2, d / 2]) edges.push({ len: w, pos: [0, y, z], rot: [0, 0, Math.PI / 2] });
    for (const x of [-w / 2, w / 2]) edges.push({ len: d, pos: [x, y, 0], rot: [Math.PI / 2, 0, 0] });
  }
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) edges.push({ len: h, pos: [x, h / 2, z], rot: [0, 0, 0] });
  for (const e of edges) {
    const m = new THREE.Mesh(tube(e.len + 0.07), ledMat);
    m.position.set(...e.pos);
    m.rotation.set(...e.rot);
    box.add(m);
  }

  // A few dim fills so the frame actually lights the space, not just glows
  for (const x of [-w / 3, 0, w / 3]) {
    const l = new THREE.PointLight(0xffffff, 2.5, 14, 1.8);
    l.position.set(x, h - 0.4, 0);
    box.add(l);
  }

  // --- Haze: warm glow behind the car and drifting smoke sprites
  const smoke = smokeTexture();
  const glow = glowTexture('rgba(255,255,255,1)', 0.35);
  const hazeGroup = new THREE.Group();
  scene.add(hazeGroup);
  const backGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glow, color: 0xfff2e6, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  backGlow.position.set(0, 3.6, -4.5);
  backGlow.scale.set(13, 9, 1);
  hazeGroup.add(backGlow);

  const r = mulberry32(17);
  const puffs = [];
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: smoke, color: 0xe6e3e0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    s.position.set((r() - 0.5) * 13, 1.4 + r() * 5, -3.8 + r() * 5.5);
    const sc = 4 + r() * 5;
    s.scale.set(sc, sc, 1);
    s.userData = { base: s.position.clone(), speed: 0.05 + r() * 0.1, phase: r() * 10, rot: (r() - 0.5) * 0.05 };
    puffs.push(s);
    hazeGroup.add(s);
  }

  // Backlight: hot source behind the car blasting toward the audience through the haze
  const back = new THREE.SpotLight(0xfff4ea, 500, 30, 0.7, 0.7, 2);
  back.position.set(1.5, 7.2, -4.7);
  back.target.position.set(0, 0.5, 6);
  back.castShadow = true;
  back.shadow.mapSize.set(1024, 1024);
  back.shadow.bias = -0.0008;
  scene.add(back, back.target);
  const backBeam = beamCone(12, 5.5, 0xfff4ea);
  aimAt(backBeam, back.position, back.target.position);
  backBeam.material.uniforms.intensity.value = 0.04;
  scene.add(backBeam);

  // --- API
  api.box = box;
  api.setTilt = (deg) => (pivot.rotation.x = THREE.MathUtils.degToRad(deg));
  api.setTarpOpacity = (o) => (tarpMat.opacity = o);
  api.setLedBrightness = (b) => ledMat.color.setRGB(1 * b, 0.97 * b, 0.93 * b);
  api.underColor = new THREE.Color(0xffffff);
  api.reflector = reflector;

  api.update = (t, levels, opts) => {
    const pulse = Math.pow(levels.bass, 1.6) * opts.reactivity;
    const k = 0.25 + pulse * 3.2;
    stripMat.color.copy(api.underColor).multiplyScalar(0.6 + k * 2.2);
    for (const l of underLights) {
      l.color.copy(api.underColor);
      l.intensity = 8 + pulse * 90;
    }
    pool.material.color.copy(api.underColor);
    washMat.color.copy(api.underColor).multiplyScalar(0.18 + pulse * 1.4);
    pool.material.opacity = 0.2 + pulse * 0.8;

    const breathe = 1 + levels.mid * 0.35 * opts.reactivity;
    api.setLedBrightness(opts.led * breathe);
    backGlow.material.opacity = (0.07 + levels.mid * 0.08 * opts.reactivity) * Math.min(opts.haze, 1.5);

    for (const s of puffs) {
      const u = s.userData;
      s.position.x = u.base.x + Math.sin(t * u.speed + u.phase) * 0.8;
      s.position.y = u.base.y + Math.sin(t * u.speed * 0.7 + u.phase * 2) * 0.4;
      s.material.rotation += u.rot * 0.016;
    }
    if (opts.tarpSway) plastic.sway(t, 0.3);
    hazeGroup.visible = opts.haze > 0;
    for (const s of puffs) s.material.opacity = Math.min(0.5, opts.haze * (0.03 + (s.userData.phase % 1) * 0.04));
  };

  return api;
}
