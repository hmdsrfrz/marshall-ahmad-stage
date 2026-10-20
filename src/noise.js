export function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth pseudo-noise from a handful of random sine waves; roughly in [-1, 1].
export function waveNoise(seed) {
  const r = mulberry32(seed);
  const waves = Array.from({ length: 7 }, () => ({ fx: r() * 1.6 + 0.2, fy: r() * 1.6 + 0.2, p: r() * 6.28, a: r() }));
  return (x, y) => waves.reduce((s, w) => s + w.a * Math.sin(x * w.fx + y * w.fy + w.p), 0) / 3;
}

export const smooth = (t) => t * t * (3 - 2 * t);
