import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Final display-space pass: split-tone colour grade (tint shadows and highlights separately),
// vignette and animated film grain. Runs after OutputPass, so it works on sRGB values.
export function createGradePass() {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      shadowTint: { value: new THREE.Color(0x0b2a3a) },
      highlightTint: { value: new THREE.Color(0xffb46a) },
      tintAmount: { value: 0 },
      grain: { value: 0 },
      vignette: { value: 0 },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec3 shadowTint, highlightTint;
      uniform float tintAmount, grain, vignette, time;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 tint = mix(shadowTint, highlightTint, smoothstep(0.15, 0.75, lum));
        c.rgb = mix(c.rgb, c.rgb * 0.55 + tint * (0.25 + lum * 0.6), tintAmount);
        float d = distance(vUv, vec2(0.5));
        c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
        c.rgb += (hash(vUv * 1000.0 + fract(time) * 37.0) - 0.5) * grain;
        gl_FragColor = c;
      }`,
  });
  pass.enabled = false;
  return pass;
}
