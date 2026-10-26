import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';


const HELP = {
  orbit:
    '<b>Orbit / Edit</b> · drag to orbit · right-drag to pan · scroll to zoom · <b>WASD</b> move · <b>Q/E</b> down/up<br>' +
    'click a prop to select · <b>G</b> move · <b>R</b> rotate · <b>Esc</b> deselect<br>' +
    '<b>Tab</b> walk mode',
  walk: '<b>Walk</b> · <b>WASD</b> move · mouse look · <b>Shift</b> run · <b>Q/E</b> down/up · <b>Tab</b> or <b>Esc</b> back to orbit',
};

// layoutKey: localStorage key for this scene's prop arrangement.
export function createNavigation({ camera, renderer, scene, movables, helpEl, layoutKey }) {
  const dom = renderer.domElement;
  const orbit = new OrbitControls(camera, dom);
  orbit.target.set(0, 2.4, 0);
  orbit.enableDamping = true;
  orbit.maxPolarAngle = Math.PI * 0.495;
  orbit.maxDistance = 60;
  orbit.update();

  const walk = new PointerLockControls(camera, dom);
  let mode = 'orbit';
  const keys = new Set();

  const gizmo = new TransformControls(camera, dom);
  gizmo.setSize(0.9);
  scene.add(gizmo.getHelper());
  const selBox = new THREE.BoxHelper(undefined, 0xf6c56b);
  selBox.visible = false;
  scene.add(selBox);
  let selected = null;

  const select = (obj) => {
    selected = obj;
    if (obj) {
      gizmo.attach(obj);
      selBox.setFromObject(obj);
      selBox.visible = true;
    } else {
      gizmo.detach();
      selBox.visible = false;
    }
    setHelp();
  };

  gizmo.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value;
    if (!e.value) saveLayout();
  });

  const setHelp = () => {
    const sel = selected && mode === 'orbit' ? `<br>Selected: <b>${selected.userData.movable.label}</b> (${gizmo.mode === 'rotate' ? 'rotate' : 'move'})` : '';
    helpEl.innerHTML = HELP[mode] + sel;
  };

  // --- click-to-select (ignore drags so orbiting doesn't change selection)
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt = null;
  dom.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
  dom.addEventListener('pointerup', (e) => {
    if (mode !== 'orbit' || !downAt || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = null;
    if (moved > 5 || gizmo.dragging || gizmo.axis) return;
    const r = dom.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(movables, true).find((h) => h.object.isMesh);
    let o = hit?.object;
    while (o && !o.userData.movable) o = o.parent;
    select(o ?? null);
  });

  // --- modes
  const enterWalk = () => {
    if (mode === 'walk') return;
    select(null);
    walk.lock();
  };
  const exitWalk = () => walk.unlock();

  walk.addEventListener('lock', () => {
    mode = 'walk';
    orbit.enabled = false;
    setHelp();
  });
  walk.addEventListener('unlock', () => {
    mode = 'orbit';
    orbit.enabled = true;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    orbit.target.copy(camera.position).addScaledVector(fwd, 8);
    orbit.update();
    keys.clear();
    setHelp();
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('.lil-gui, input, textarea, select')) return;
    if (e.code === 'Tab') {
      e.preventDefault();
      mode === 'walk' ? exitWalk() : enterWalk();
      return;
    }
    keys.add(e.code);
    if (mode === 'walk') return;
    if (e.code === 'KeyG') gizmo.setMode('translate');
    if (e.code === 'KeyR') gizmo.setMode('rotate');
    if (e.code === 'Escape') select(null);
    setHelp();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  // --- layout persistence (local transforms, so props parented to the tilted box stay attached)
  function saveLayout() {
    const data = {};
    for (const m of movables) data[m.userData.movable.id] = { p: m.position.toArray(), q: m.quaternion.toArray() };
    try {
      localStorage.setItem(layoutKey, JSON.stringify(data));
    } catch {}
  }
  function loadLayout() {
    let data;
    try {
      data = JSON.parse(localStorage.getItem(layoutKey) || 'null');
    } catch {}
    if (!data) return;
    for (const m of movables) {
      const d = data[m.userData.movable.id];
      if (!d) continue;
      m.position.fromArray(d.p);
      m.quaternion.fromArray(d.q);
    }
  }
  function resetLayout() {
    for (const m of movables) {
      m.position.copy(m.userData.defaults.p);
      m.quaternion.copy(m.userData.defaults.q);
    }
    try {
      localStorage.removeItem(layoutKey);
    } catch {}
    select(null);
  }
  loadLayout();

  const home = { p: camera.position.clone(), t: orbit.target.clone() };
  function resetCamera() {
    if (mode === 'walk') exitWalk();
    camera.position.copy(home.p);
    orbit.target.copy(home.t);
    orbit.update();
  }

  // WASD/QE work in both modes; in orbit mode the camera and its target move together.
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  function update(dt) {
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 9 : 3.5) * dt;
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    right.crossVectors(fwd, camera.up);
    move.set(0, 0, 0);
    if (keys.has('KeyW')) move.add(fwd);
    if (keys.has('KeyS')) move.sub(fwd);
    if (keys.has('KeyD')) move.add(right);
    if (keys.has('KeyA')) move.sub(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
    if (keys.has('KeyE')) move.y += speed;
    if (keys.has('KeyQ')) move.y -= Math.min(speed, Math.max(0, camera.position.y - 0.4));
    camera.position.add(move);
    if (mode === 'orbit') {
      orbit.target.add(move);
      orbit.update();
    }
    if (selected) selBox.setFromObject(selected);
  }

  setHelp();
  return { update, enterWalk, resetLayout, resetCamera, deselect: () => select(null), orbit };
}
