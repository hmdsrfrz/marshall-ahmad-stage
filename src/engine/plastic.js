import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { TarpSheet } from './tarp.js';

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

// Clear plastic film material; `overrides` are passed straight to MeshPhysicalMaterial.
export function createTarpMaterial(overrides = {}) {
  return addGrazingOpacity(
    new THREE.MeshPhysicalMaterial({
      color: 0xf4f4f2,
      roughness: 0.24,
      metalness: 0.0,
      ior: 1.5,
      clearcoat: 0.4,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.2,
      bumpMap: crinkleTexture(),
      bumpScale: 0.5,
      flatShading: true,
      envMapIntensity: 3,
      emissive: 0x3a3a3c,
      emissiveIntensity: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
      ...overrides,
    }),
  );
}

// Hangs walls of plastic as overlapping strips, like a real install; where strips overlap the
// film doubles up into cloudier bands. A wall with `layers: 2` gets an inner layer whose seams sit
// half a strip over, so the bands cross. Every strip is settled as cloth in a Web Worker.
// Each wall: { len, height, center, rot, along, inward, layers, ...TarpSheet options }, where
// `along` is the wall's local x axis in parent space and `inward` points into the enclosure.
export function hangPlasticWalls(walls, { material, parent, strip = 4.6, overlap = 0.8, seed = 1 }) {
  const panels = [];
  for (const wall of walls) {
    const { len, height, center, rot, along, inward, layers = 1, ...sheetOptions } = wall;
    for (let layer = 0; layer < layers; layer++) {
      const start = -len / 2 + (layer ? -strip / 2 : 0);
      for (let x0 = start; x0 < len / 2 - 0.3; x0 += strip - overlap) {
        const a = Math.max(x0, -len / 2), b = Math.min(x0 + strip, len / 2);
        if (b - a < 1) continue;
        // alternate strips sit slightly proud of their neighbours so the overlaps don't z-fight
        const depth = layer * 0.2 + (panels.length % 2) * 0.05;
        const mid = (a + b) / 2;
        panels.push({
          w: b - a,
          h: height,
          options: { ...sheetOptions, seed: seed++ },
          pos: center.map((c, k) => c + along[k] * mid + inward[k] * depth),
          rot,
        });
      }
    }
  }

  const t0 = performance.now();
  const worker = new Worker(new URL('./tarpWorker.js', import.meta.url), { type: 'module' });
  const sheets = panels.map((p, id) => {
    const sheet = new TarpSheet(p.w, p.h, p.options);
    worker.postMessage({ id, w: p.w, h: p.h, options: p.options });
    const m = new THREE.Mesh(sheet.geometry, material);
    m.position.set(...p.pos);
    m.rotation.set(...p.rot);
    m.renderOrder = 5;
    m.receiveShadow = true;
    parent.add(m);
    return sheet;
  });
  let pending = sheets.length;
  worker.onmessage = ({ data }) => {
    sheets[data.id].applySettled(data.pos, data.prev);
    if (--pending === 0) {
      console.info(`[plastic] settled ${sheets.length} sheets in ${(performance.now() - t0).toFixed(0)} ms`);
      worker.terminate();
    }
  };
  worker.onerror = (e) => console.error('[plastic] settle worker failed', e.message);

  return {
    sheets,
    sway(t, wind) {
      for (const s of sheets) if (s.settled) s.step(t, wind);
    },
  };
}
