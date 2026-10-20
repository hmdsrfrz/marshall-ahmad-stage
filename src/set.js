import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mulberry32 } from './noise.js';
import { TarpSheet } from './tarp.js';

export const BOX = { w: 16, h: 7.5, d: 10 };
export const STAGE = { w: 14, h: 0.9, d: 8.5, z: -0.25 };
export const STAGE_FRONT = STAGE.z + STAGE.d / 2;

// Real film goes milky and reflective at grazing angles and nearly clear head-on.
function addGrazingOpacity(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float tarpFres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.5);
      diffuseColor.a = mix(diffuseColor.a * 0.6, min(1.0, diffuseColor.a * 3.5 + 0.2), tarpFres);
      #include <opaque_fragment>`,
    );
  };
  mat.customProgramCacheKey = () => 'tarp-grazing';
  return mat;
}

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

function crinkleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#808080';
  x.fillRect(0, 0, 512, 512);
  const r = mulberry32(42);
  for (let i = 0; i < 260; i++) {
    const v = Math.floor(80 + r() * 100);
    x.strokeStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.4})`;
    x.lineWidth = 0.5 + r() * 2.5;
    x.beginPath();
    let px = r() * 512, py = r() * 512;
    x.moveTo(px, py);
    for (let k = 0; k < 4; k++) {
      px += (r() - 0.5) * 140;
      py += (r() - 0.5) * 140;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

export function glowTexture(inner = 'rgba(255,255,255,1)', soft = 0.5) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(soft, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const r = mulberry32(9);
  for (let i = 0; i < 40; i++) {
    const cx = 128 + (r() - 0.5) * 120, cy = 128 + (r() - 0.5) * 120, rad = 30 + r() * 70;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(c);
}

// Additive cone used to fake a light shaft through haze. Apex at origin, opening along -Y.
export function beamCone(length, radius, color) {
  const geo = new THREE.CylinderGeometry(0.06, radius, length, 40, 1, true);
  geo.translate(0, -length / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, intensity: { value: 1 }, len: { value: length } },
    vertexShader: /* glsl */ `
      varying float vY; varying vec3 vN; varying vec3 vV;
      void main() {
        vY = position.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform float intensity; uniform float len;
      varying float vY; varying vec3 vN; varying vec3 vV;
      void main() {
        float t = clamp(-vY / len, 0.0, 1.0);
        float along = pow(1.0 - t, 1.6);
        float rim = pow(abs(dot(vN, vV)), 1.5);
        gl_FragColor = vec4(color * intensity * along * rim * 0.22, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 10;
  return m;
}

export function aimAt(obj, from, to) {
  obj.position.copy(from);
  const dir = to.clone().sub(from).normalize();
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
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

  const crinkle = crinkleTexture();
  const tarpMat = new THREE.MeshPhysicalMaterial({
    color: 0xf4f4f2,
    roughness: 0.24,
    metalness: 0.0,
    ior: 1.5,
    clearcoat: 0.4,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0.2,
    bumpMap: crinkle,
    bumpScale: 0.5,
    flatShading: true,
    envMapIntensity: 3,
    emissive: 0x3a3a3c,
    emissiveIntensity: 0.04,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  addGrazingOpacity(tarpMat);

  const { w, h, d } = BOX;
  // Walls are hung from overlapping strips of film, like a real install; where strips overlap the
  // plastic doubles up into cloudier bands. Back and side walls get a second, inner layer whose seams
  // sit half a strip over, so the bands cross. Every strip is cloth settled at load.
  // `along` is the wall's local x axis in box space, `inward` points into the box.
  const walls = [
    { len: w, height: h, center: [0, h / 2, -d / 2], rot: [0, 0, 0], along: [1, 0, 0], inward: [0, 0, 1], layers: 2 },
    { len: d, height: h, center: [-w / 2, h / 2, 0], rot: [0, Math.PI / 2, 0], along: [0, 0, -1], inward: [1, 0, 0], layers: 2 },
    { len: d, height: h, center: [w / 2, h / 2, 0], rot: [0, -Math.PI / 2, 0], along: [0, 0, 1], inward: [-1, 0, 0], layers: 2 },
    // roof pulled tight (almost no slack, no sag); its local +z points down after the rotation
    { len: w, height: d, center: [0, h, 0], rot: [Math.PI / 2, 0, 0], along: [1, 0, 0], inward: [0, -1, 0], layers: 1, gravity: [0, 0, 0], slack: 0.002 },
  ];
  const STRIP = 4.6, OVERLAP = 0.8;
  const panels = [];
  let seed = 1;
  for (const wall of walls) {
    for (let layer = 0; layer < wall.layers; layer++) {
      // inner layer starts half a strip in, so its seams fall between the outer layer's seams
      const start = -wall.len / 2 + (layer ? -STRIP / 2 : 0);
      for (let x0 = start; x0 < wall.len / 2 - 0.3; x0 += STRIP - OVERLAP) {
        const a = Math.max(x0, -wall.len / 2), b = Math.min(x0 + STRIP, wall.len / 2);
        if (b - a < 1) continue;
        // alternate strips sit slightly proud of their neighbours so the overlaps don't z-fight
        const depth = layer * 0.2 + (panels.length % 2) * 0.05;
        const mid = (a + b) / 2;
        panels.push({
          w: b - a,
          h: wall.height,
          seed: seed++,
          pos: wall.center.map((c, k) => c + wall.along[k] * mid + wall.inward[k] * depth),
          rot: wall.rot,
          gravity: wall.gravity,
          slack: wall.slack,
        });
      }
    }
  }
  const t0 = performance.now();
  const worker = new Worker(new URL('./tarpWorker.js', import.meta.url), { type: 'module' });
  const sheets = panels.map((p, id) => {
    const options = { seed: p.seed, gravity: p.gravity, slack: p.slack };
    const sheet = new TarpSheet(p.w, p.h, options);
    worker.postMessage({ id, w: p.w, h: p.h, options });
    const m = new THREE.Mesh(sheet.geometry, tarpMat);
    m.position.set(...p.pos);
    m.rotation.set(...p.rot);
    m.renderOrder = 5;
    box.add(m);
    return sheet;
  });
  let pending = sheets.length;
  worker.onmessage = ({ data }) => {
    sheets[data.id].applySettled(data.pos, data.prev);
    if (--pending === 0) {
      console.info(`[tarp] settled ${sheets.length} sheets in ${(performance.now() - t0).toFixed(0)} ms`);
      worker.terminate();
    }
  };
  worker.onerror = (e) => console.error('[tarp] settle worker failed', e.message);
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
    if (opts.tarpSway) for (const s of sheets) if (s.settled) s.step(t, 0.3);
    hazeGroup.visible = opts.haze > 0;
    for (const s of puffs) s.material.opacity = Math.min(0.5, opts.haze * (0.03 + (s.userData.phase % 1) * 0.04));
  };

  return api;
}
