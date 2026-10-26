import * as THREE from 'three';
import { mulberry32 } from '../../engine/noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function repeatTexture(c, rx, ry, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Patches of rust and flaking paint from 3D value noise in world space, so any low-poly model
// (no UVs needed) weathers consistently. `amount` 0..1 is how much of the surface is rusted.
export function rustify(material, { amount = 0.5, scale = 2.2, rust = 0x5a2a12, dark = 0x1e120a } = {}) {
  material.userData.rust = { amount, scale };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rustAmount = { value: amount };
    shader.uniforms.rustScale = { value: scale };
    shader.uniforms.rustColor = { value: new THREE.Color(rust) };
    shader.uniforms.rustDark = { value: new THREE.Color(dark) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRustPos;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vRustPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vRustPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRustPos;
        uniform float rustAmount, rustScale;
        uniform vec3 rustColor, rustDark;
        float rHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float rNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(rHash(i), rHash(i + vec3(1,0,0)), f.x), mix(rHash(i + vec3(0,1,0)), rHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(rHash(i + vec3(0,0,1)), rHash(i + vec3(1,0,1)), f.x), mix(rHash(i + vec3(0,1,1)), rHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float rFbm(vec3 p) { return rNoise(p) * 0.55 + rNoise(p * 2.7) * 0.3 + rNoise(p * 7.1) * 0.15; }
        float rustMask;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float rn = rFbm(vRustPos * rustScale);
        rustMask = smoothstep(1.0 - rustAmount - 0.08, 1.0 - rustAmount + 0.08, rn);
        vec3 rustTone = mix(rustDark, rustColor, rNoise(vRustPos * rustScale * 5.0));
        diffuseColor.rgb = mix(diffuseColor.rgb * (0.85 + 0.3 * rNoise(vRustPos * 9.0)), rustTone, rustMask);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.95, rustMask);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.1, rustMask);`,
      );
  };
  material.customProgramCacheKey = () => `rust-${amount}-${scale}`;
  return material;
}

// Weathered three-plank board with faded, flaking cream letters.
export function signTexture(text = 'MADE MEN') {
  const [c, x] = canvas(1024, 280);
  const r = mulberry32(7);
  const planks = 3, ph = c.height / planks;
  for (let p = 0; p < planks; p++) {
    const base = 70 + r() * 25;
    x.fillStyle = `rgb(${base}, ${base * 0.86}, ${base * 0.7})`;
    x.fillRect(0, p * ph, c.width, ph);
    for (let g = 0; g < 70; g++) {
      const y = p * ph + r() * ph, v = r() < 0.5 ? 40 : 120;
      x.strokeStyle = `rgba(${v}, ${v * 0.85}, ${v * 0.7}, ${0.08 + r() * 0.18})`;
      x.lineWidth = 0.5 + r() * 2;
      x.beginPath();
      x.moveTo(0, y);
      for (let k = 0; k <= 8; k++) x.lineTo((k / 8) * c.width, y + (r() - 0.5) * 6);
      x.stroke();
    }
    x.fillStyle = 'rgba(15, 10, 6, 0.9)';
    x.fillRect(0, p * ph + ph - 4, c.width, 4);
    for (const nx of [24, c.width - 24]) {
      x.fillStyle = 'rgba(30, 24, 20, 0.9)';
      x.beginPath();
      x.arc(nx, p * ph + ph / 2, 5, 0, Math.PI * 2);
      x.fill();
    }
  }
  x.font = 'bold 190px Impact, "Arial Black", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = 'rgba(232, 220, 192, 0.92)';
  x.fillText(text, c.width / 2, c.height / 2 + 8);
  // flaked paint: wood-coloured specks scattered over the lettering
  for (let i = 0; i < 900; i++) {
    const v = 60 + r() * 30;
    x.fillStyle = `rgba(${v}, ${v * 0.86}, ${v * 0.7}, ${0.35 + r() * 0.5})`;
    x.beginPath();
    x.ellipse(r() * c.width, r() * c.height, 1 + r() * 7, 1 + r() * 3, r() * 3, 0, Math.PI * 2);
    x.fill();
  }
  // dark weathering toward the edges
  const g = x.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.4, c.width / 2, c.height / 2, c.width * 0.6);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(10,6,3,0.55)');
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function concreteMaterial() {
  const [c, x] = canvas(512, 512);
  x.fillStyle = '#4a4d50';
  x.fillRect(0, 0, 512, 512);
  const r = mulberry32(11);
  for (let i = 0; i < 260; i++) {
    const cx = r() * 512, cy = r() * 512, rad = 10 + r() * 70, v = 50 + r() * 40;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(${v},${v + 2},${v + 5},0.35)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 512);
  }
  x.strokeStyle = 'rgba(20,20,22,0.5)';
  x.lineWidth = 2;
  x.strokeRect(0, 0, 512, 512);
  const map = repeatTexture(c, 14, 14);
  return new THREE.MeshStandardMaterial({ map, color: 0x7a8088, roughness: 0.7, metalness: 0.05, roughnessMap: repeatTexture(c, 14, 14, false) });
}

export function corrugatedMaterial(color = 0x1c2630) {
  const [c, x] = canvas(256, 16);
  const g = x.createLinearGradient(0, 0, 256, 0);
  for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, i % 2 ? '#202020' : '#e0e0e0');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 16);
  const bump = repeatTexture(c, 12, 1, false);
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.6, bumpMap: bump, bumpScale: 3 });
}

export function pegboardMaterial() {
  const [c, x] = canvas(512, 512);
  x.fillStyle = '#6b4a2c';
  x.fillRect(0, 0, 512, 512);
  x.fillStyle = '#1a120b';
  for (let i = 16; i < 512; i += 32) for (let j = 16; j < 512; j += 32) {
    x.beginPath();
    x.arc(i, j, 4.5, 0, Math.PI * 2);
    x.fill();
  }
  return new THREE.MeshStandardMaterial({ map: repeatTexture(c, 3, 2), roughness: 0.85 });
}

// Car tyre lying flat (axis = Y): a lathed cross-section with bulging sidewalls and a flat tread,
// whose outer face alternates in and out every segment to read as tread blocks.
export function tyreGeometry({ outer = 0.33, inner = 0.2, width = 0.22, segments = 28 } = {}) {
  const h = width / 2;
  const profile = [
    [inner, -h * 0.75],
    [inner + 0.02, -h],
    [outer - 0.04, -h * 0.95],
    [outer - 0.005, -h * 0.6],
    [outer, -h * 0.3],
    [outer, h * 0.3],
    [outer - 0.005, h * 0.6],
    [outer - 0.04, h * 0.95],
    [inner + 0.02, h],
    [inner, h * 0.75],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(profile, segments);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = Math.hypot(v.x, v.z);
    if (r > outer - 0.006) {
      const seg = Math.round((Math.atan2(v.z, v.x) / (Math.PI * 2)) * segments);
      const k = seg % 2 ? 0.988 : 1;
      pos.setXYZ(i, v.x * k, v.y, v.z * k);
    }
  }
  g.computeVertexNormals();
  return g;
}

// Dusty rubber; per-instance colours (dark grey to brown-grey) come from InstancedMesh.setColorAt.
export const rubberMaterial = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
export const rubberTints = [0x1a1a1a, 0x222120, 0x2b2824, 0x181818, 0x332d26, 0x26231f].map((c) => new THREE.Color(c));

// Faded "QINGQI" name board: worn white letters with red outline on orange.
export function qingqiTexture() {
  const [c, x] = canvas(512, 128);
  x.fillStyle = '#c4621f';
  x.fillRect(0, 0, 512, 128);
  x.font = 'bold 92px Impact, "Arial Black", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 10;
  x.strokeStyle = '#8a1e14';
  x.strokeText('QINGQI', 256, 68);
  x.fillStyle = '#f1e6d4';
  x.fillText('QINGQI', 256, 68);
  const r = mulberry32(19);
  for (let i = 0; i < 500; i++) {
    x.fillStyle = `rgba(${150 + r() * 60}, ${80 + r() * 30}, ${30 + r() * 20}, ${0.3 + r() * 0.5})`;
    x.fillRect(r() * 512, r() * 128, 1 + r() * 4, 1 + r() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Decorated roof fascia like truck art: repeating coloured diamonds and a band of painted script.
export function fasciaTexture() {
  const [c, x] = canvas(1024, 96);
  x.fillStyle = '#e9e1cf';
  x.fillRect(0, 0, 1024, 96);
  const colors = ['#b5261c', '#1e5aa8', '#e2a21b', '#2b8a3e', '#7a2e8a'];
  for (let i = 0; i < 64; i++) {
    x.fillStyle = colors[i % colors.length];
    x.beginPath();
    const cx = i * 16 + 8;
    x.moveTo(cx, 4);
    x.lineTo(cx + 7, 12);
    x.lineTo(cx, 20);
    x.lineTo(cx - 7, 12);
    x.fill();
    x.fillRect(i * 16, 84, 10, 8);
  }
  x.fillStyle = '#1e3f8a';
  x.font = 'italic bold 40px Georgia, serif';
  x.textBaseline = 'middle';
  for (const fx of [40, 552]) x.fillText('~ Made Men ~ Qingqi ~', fx, 52);
  const r = mulberry32(23);
  for (let i = 0; i < 700; i++) {
    x.fillStyle = `rgba(${120 + r() * 60}, ${90 + r() * 40}, ${60 + r() * 30}, ${0.25 + r() * 0.45})`;
    x.fillRect(r() * 1024, r() * 96, 1 + r() * 5, 1 + r() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
