import * as THREE from 'three';
import { mulberry32 } from './noise.js';

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

export function smokeTexture() {
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
