import { TarpSheet } from './tarp.js';

// Settles tarp sheets off the main thread so page load doesn't freeze.
self.onmessage = ({ data }) => {
  const { id, w, h, options } = data;
  const sheet = new TarpSheet(w, h, options);
  sheet.settle();
  const pos = sheet.pos.slice();
  const prev = sheet.prev.slice();
  self.postMessage({ id, pos, prev }, [pos.buffer, prev.buffer]);
};
