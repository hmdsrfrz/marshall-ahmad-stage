import * as THREE from 'three';
import { mulberry32, waveNoise } from './noise.js';

// Verlet sheet for one tarp panel, in the panel's local plane (x across, y up, z out of plane).
// Plastic film is stiff: it's cut with only a little slack and clipped at irregular points, so it
// settles mostly taut with shallow buckles between clips. The look of plastic comes from the
// render-only detail on top: short, sharp crease lines and jittered vertices for flat facets.
export class TarpSheet {
  constructor(w, h, { seed = 1, spacing = 0.25, slack = 0.012, gravity = [0, -0.35, 0], clip = [0.8, 1.5], creases = 26 } = {}) {
    const cols = Math.round(w / spacing) + 1;
    const rows = Math.round(h / spacing) + 1;
    const sx = w / (cols - 1);
    const sy = h / (rows - 1);
    const r = mulberry32(seed);
    const slackField = waveNoise(seed + 3);
    this.cols = cols;
    this.rows = rows;
    this.count = cols * rows;
    this.gravity = new THREE.Vector3(...gravity).multiplyScalar(9.8);

    this.geometry = new THREE.PlaneGeometry(w, h, cols - 1, rows - 1);
    this.pos = this.geometry.attributes.position.array;
    this.prev = new Float32Array(this.pos.length);
    this.pinned = new Uint8Array(this.count);
    for (let i = 0; i < this.count; i++) this.pos[i * 3 + 2] = (r() - 0.5) * 0.04;
    this.prev.set(this.pos);

    // Clip points along each edge at irregular spacing; corners always clipped.
    const clipEdge = (n, index) => {
      let k = 0;
      while (k < n) {
        this.pinned[index(k)] = 1;
        k += Math.max(2, Math.round((clip[0] + r() * (clip[1] - clip[0])) / spacing));
      }
      this.pinned[index(n - 1)] = 1;
    };
    clipEdge(cols, (k) => k);
    clipEdge(cols, (k) => (rows - 1) * cols + k);
    clipEdge(rows, (k) => k * cols);
    clipEdge(rows, (k) => k * cols + cols - 1);

    // Structural links carry a varying amount of slack so buckles cluster unevenly;
    // skip-one links are fairly stiff because film resists bending far more than cloth.
    const a = [], b = [], rest = [], stiff = [];
    const link = (i, j, len, k) => {
      a.push(i);
      b.push(j);
      rest.push(len);
      stiff.push(k);
    };
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        const i = iy * cols + ix;
        const s = slack * Math.max(0, 1 + slackField(ix * sx * 0.6, iy * sy * 0.6) * 1.8);
        if (ix + 1 < cols) link(i, i + 1, sx * (1 + s), 1);
        if (iy + 1 < rows) link(i, i + cols, sy * (1 + s * 0.6), 1);
        if (ix + 2 < cols) link(i, i + 2, 2 * sx * (1 + s), 0.5);
        if (iy + 2 < rows) link(i, i + 2 * cols, 2 * sy * (1 + s * 0.6), 0.5);
      }
    }
    this.ca = Int32Array.from(a);
    this.cb = Int32Array.from(b);
    this.rest = Float32Array.from(rest);
    this.stiff = Float32Array.from(stiff);

    // Render-only detail (xyz per vertex): crease lines are finite straight segments with a
    // V-shaped cross-section (ridge or valley), plus small in-plane jitter so flat shading
    // shows irregular facets instead of the grid.
    this.detail = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      if (this.pinned[i]) continue;
      this.detail[i * 3] = (r() - 0.5) * sx * 0.45;
      this.detail[i * 3 + 1] = (r() - 0.5) * sy * 0.45;
      this.detail[i * 3 + 2] = (r() - 0.5) * 0.012;
    }
    for (let c = 0; c < creases; c++) {
      const cx = r() * w, cy = r() * h, ang = r() * Math.PI, half = 0.3 + r() * 1.4;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const width = 0.12 + r() * 0.25, amp = (0.012 + r() * 0.03) * (r() < 0.5 ? -1 : 1);
      for (let iy = 0; iy < rows; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          const i = iy * cols + ix;
          if (this.pinned[i]) continue;
          const px = ix * sx - cx, py = iy * sy - cy;
          const along = px * dx + py * dy;
          if (Math.abs(along) > half) continue;
          const across = Math.abs(-px * dy + py * dx);
          if (across > width) continue;
          const taper = 1 - (along / half) ** 2;
          this.detail[i * 3 + 2] += amp * (1 - across / width) * taper;
        }
      }
    }
  }

  #applyDetail(sign) {
    const { pos, detail } = this;
    for (let i = 0; i < pos.length; i++) pos[i] += detail[i] * sign;
  }

  #integrate(dt, wind, t) {
    const { pos, prev, pinned, gravity } = this;
    const gx = gravity.x * dt * dt, gy = gravity.y * dt * dt, gz = gravity.z * dt * dt;
    for (let i = 0; i < this.count; i++) {
      if (pinned[i]) continue;
      const o = i * 3;
      const gust = wind ? wind * Math.sin(t * 0.9 + pos[o] * 0.35 + pos[o + 1] * 0.2) * dt * dt : 0;
      const vx = (pos[o] - prev[o]) * 0.97, vy = (pos[o + 1] - prev[o + 1]) * 0.97, vz = (pos[o + 2] - prev[o + 2]) * 0.97;
      prev[o] = pos[o];
      prev[o + 1] = pos[o + 1];
      prev[o + 2] = pos[o + 2];
      pos[o] += vx + gx;
      pos[o + 1] += vy + gy;
      pos[o + 2] += vz + gz + gust;
    }
  }

  #relax(iterations) {
    const { pos, pinned, ca, cb, rest, stiff } = this;
    for (let it = 0; it < iterations; it++) {
      for (let c = 0; c < ca.length; c++) {
        const i = ca[c] * 3, j = cb[c] * 3;
        const dx = pos[j] - pos[i], dy = pos[j + 1] - pos[i + 1], dz = pos[j + 2] - pos[i + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const pa = pinned[ca[c]], pb = pinned[cb[c]];
        if (pa && pb) continue;
        const k = ((d - rest[c]) / d) * stiff[c] * (pa || pb ? 1 : 0.5);
        if (!pa) {
          pos[i] += dx * k;
          pos[i + 1] += dy * k;
          pos[i + 2] += dz * k;
        }
        if (!pb) {
          pos[j] -= dx * k;
          pos[j + 1] -= dy * k;
          pos[j + 2] -= dz * k;
        }
      }
    }
  }

  #finish() {
    this.#applyDetail(1);
    this.detailApplied = true;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  // Adopt a shape settled elsewhere (the worker); pos already includes the detail.
  applySettled(pos, prev) {
    this.pos.set(pos);
    this.prev.set(prev);
    this.detailApplied = true;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.settled = true;
  }

  settle(steps = 160) {
    for (let s = 0; s < steps; s++) {
      this.#integrate(1 / 60, 0, 0);
      this.#relax(8);
    }
    this.#finish();
  }

  step(t, wind) {
    if (this.detailApplied) this.#applyDetail(-1);
    this.#integrate(1 / 60, wind, t);
    this.#relax(1);
    this.#finish();
  }
}
