import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// One manager for every model fetch, so the intro screen can show a single progress figure.
export const loadingManager = new THREE.LoadingManager();
const loader = new GLTFLoader(loadingManager);
loader.setMeshoptDecoder(MeshoptDecoder);

// Loads `{ key: 'path/relative/to/public.glb' }` and resolves to `{ key: gltf }`.
export async function loadModels(paths) {
  const entries = await Promise.all(
    Object.entries(paths).map(async ([key, path]) => {
      const t0 = performance.now();
      const gltf = await loader.loadAsync(`./models/${path}`);
      console.info(`[models] ${path} ${(performance.now() - t0).toFixed(0)} ms`);
      return [key, gltf];
    }),
  );
  return Object.fromEntries(entries);
}

const _box = new THREE.Box3();
const _v = new THREE.Vector3();

// Wraps a model so that it is scaled to `size` along `axis`, centred on x/z and resting on y=0.
export function fit(object, { size, axis = 'y', rot, longAxis }) {
  const wrap = new THREE.Group();
  wrap.add(object);
  if (rot) object.rotation.set(...rot);
  wrap.updateMatrixWorld(true);
  let s = _box.setFromObject(object, true).getSize(new THREE.Vector3());
  if (longAxis === 'z' && s.x > s.z) object.rotation.y += Math.PI / 2;
  if (longAxis === 'x' && s.z > s.x) object.rotation.y += Math.PI / 2;
  wrap.updateMatrixWorld(true);
  s = _box.setFromObject(object, true).getSize(new THREE.Vector3());
  const ref = axis === 'max' ? Math.max(s.x, s.y, s.z) : s[axis];
  object.scale.multiplyScalar(size / ref);
  wrap.updateMatrixWorld(true);
  _box.setFromObject(object, true);
  const c = _box.getCenter(_v);
  object.position.x -= c.x;
  object.position.z -= c.z;
  object.position.y -= _box.min.y;
  return wrap;
}

export function shadows(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

// Clones each material before handing it to `fn`; if `fn` returns a material it replaces the clone.
export function eachMaterial(obj, fn) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => {
      const c = m.clone();
      const r = fn(c);
      return r?.isMaterial ? r : c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
}

export function movable(id, label, obj) {
  const g = obj ?? new THREE.Group();
  g.userData.movable = { id, label };
  return g;
}

// Returns `add(parent, obj)` which parents a movable, records its default transform and tracks it.
export function movableRegistry(movables) {
  return (parent, obj) => {
    parent.add(obj);
    movables.push(obj);
    obj.userData.defaults = { p: obj.position.clone(), q: obj.quaternion.clone(), s: obj.scale.clone() };
    return obj;
  };
}

// Static posed copy of the rigged Quaternius man, scaled to `height` while standing.
export function posePerson(gltf, clipName, { height = 1.78, outfit = { Shirt: 0x1d1d1f, Pants: 0x161616, Socks: 0x222222 } } = {}) {
  const model = SkeletonUtils.clone(gltf.scene);
  const mixer = new THREE.AnimationMixer(model);
  const at = (name, end) => {
    mixer.stopAllAction();
    const clip = gltf.animations.find((a) => a.name.endsWith(name));
    const action = mixer.clipAction(clip);
    action.play();
    action.time = end ? clip.duration * 0.98 : 0;
    mixer.update(0);
  };
  at('Man_Idle');
  const wrapped = fit(model, { size: height });
  if (clipName !== 'Man_Idle') {
    at(clipName, true);
    wrapped.updateMatrixWorld(true);
    _box.setFromObject(model, true);
    model.position.y -= _box.min.y;
  }
  eachMaterial(model, (m) => {
    if (outfit[m.name]) m.color.set(outfit[m.name]);
    m.roughness = 0.8;
  });
  return shadows(wrapped);
}
