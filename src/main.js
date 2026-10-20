import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'lil-gui';
import { buildSet } from './set.js';
import { buildProps, CREDITS } from './props.js';
import { createNavigation } from './navigation.js';
import { BeatMachine } from './audio.js';

const SETTINGS_KEY = 'stageviz.settings.v2';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040404);
scene.fog = new THREE.FogExp2(0x080808, 0.012);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.12;
scene.add(new THREE.HemisphereLight(0x5a5a5e, 0x080808, 0.2));

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(0, 3.2, 21);

const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 }),
);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const settings = {
  tilt: 8,
  tarpOpacity: 0.2,
  tarpSway: true,
  led: 1.6,
  reactivity: 1,
  underColor: '#ffffff',
  containerColor: '#ff1e1e',
  containerGlow: 1,
  uplights: 1,
  spots: 1,
  pattern: 'auto',
  haze: 1,
  bloom: 0.8,
  exposure: 0.85,
  playing: true,
  volume: 0.6,
  bpm: 100,
};
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
} catch {}

const set = buildSet(scene, renderer);
const beat = new BeatMachine();
const enterBtn = document.getElementById('enter');
const helpEl = document.getElementById('help');

const props = await buildProps(scene, set);
const nav = createNavigation({ camera, renderer, scene, movables: props.movables, helpEl });

const opts = { containerColor: new THREE.Color() };
function applySettings() {
  set.setTilt(settings.tilt);
  set.setTarpOpacity(settings.tarpOpacity);
  set.underColor.set(settings.underColor);
  opts.containerColor.set(settings.containerColor);
  Object.assign(opts, {
    reactivity: settings.reactivity,
    containerGlow: settings.containerGlow,
    uplights: settings.uplights,
    spots: settings.spots,
    pattern: settings.pattern,
    haze: settings.haze,
    led: settings.led,
    tarpSway: settings.tarpSway,
  });
  scene.fog.density = 0.012 * settings.haze;
  bloom.strength = settings.bloom;
  renderer.toneMappingExposure = settings.exposure;
  beat.bpm = settings.bpm;
  beat.setVolume(settings.volume);
  if (beat.ctx) settings.playing ? beat.start() : beat.stop();
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}
applySettings();

// --- GUI
const gui = new GUI({ title: 'Stage controls' });
const onChange = () => applySettings();
const fView = gui.addFolder('View');
fView.add({ walk: () => nav.enterWalk() }, 'walk').name('Walk mode (Tab)');
fView.add({ reset: () => nav.resetCamera() }, 'reset').name('Reset camera');
const fStage = gui.addFolder('Tarp box');
fStage.add(settings, 'tilt', 0, 20, 0.5).name('Tilt (°)').onChange(onChange);
fStage.add(settings, 'tarpOpacity', 0.02, 0.6, 0.01).name('Tarp opacity').onChange(onChange);
fStage.add(settings, 'led', 0, 4, 0.05).name('LED frame').onChange(onChange);
fStage.add(settings, 'tarpSway').name('Tarp sway').onChange(onChange);
const fLight = gui.addFolder('Lighting');
fLight.add(settings, 'reactivity', 0, 3, 0.05).name('Sound reactivity').onChange(onChange);
fLight.addColor(settings, 'underColor').name('Under-stage color').onChange(onChange);
fLight.addColor(settings, 'containerColor').name('Container color').onChange(onChange);
fLight.add(settings, 'containerGlow', 0, 3, 0.05).name('Container glow').onChange(onChange);
fLight.add(settings, 'uplights', 0, 3, 0.05).name('Front uplights').onChange(onChange);
fLight.add(settings, 'spots', 0, 3, 0.05).name('Moving heads').onChange(onChange);
fLight.add(settings, 'pattern', ['auto', 'fan', 'ballyhoo', 'cross', 'singer']).name('Spot pattern').onChange(onChange);
fLight.add(settings, 'haze', 0, 2.5, 0.05).name('Haze').onChange(onChange);
fLight.add(settings, 'bloom', 0, 2.5, 0.05).name('Bloom').onChange(onChange);
fLight.add(settings, 'exposure', 0.3, 2.5, 0.05).name('Exposure').onChange(onChange);
const fAudio = gui.addFolder('Audio');
const songInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'audio/*', hidden: true });
document.body.appendChild(songInput);
const nowPlaying = { track: 'Built-in beat' };
async function loadSong(file) {
  try {
    await beat.loadSong(file);
    nowPlaying.track = file.name;
    settings.playing = true;
  } catch (err) {
    console.warn('[audio] song rejected', err);
    nowPlaying.track = `Couldn't load: ${err.message}`;
  }
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
}
songInput.addEventListener('change', () => {
  if (songInput.files[0]) loadSong(songInput.files[0]);
  songInput.value = '';
});
fAudio.add({ load: () => songInput.click() }, 'load').name('Load song… (or drop a file)');
fAudio.add(nowPlaying, 'track').name('Now playing').disable();
fAudio.add({ beat: () => {
  beat.useBeat();
  nowPlaying.track = 'Built-in beat';
  settings.playing = true;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
} }, 'beat').name('Use built-in beat');
fAudio.add(settings, 'playing').name('Playing').onChange(onChange);
fAudio.add(settings, 'volume', 0, 1, 0.01).name('Volume').onChange(onChange);
fAudio.add(settings, 'bpm', 70, 150, 1).name('Beat BPM').onChange(onChange);

window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('audio/'));
  if (file) loadSong(file);
});
const fLayout = gui.addFolder('Layout');
fLayout.add({ reset: () => nav.resetLayout() }, 'reset').name('Reset layout');
fLayout.add({ deselect: () => nav.deselect() }, 'deselect').name('Deselect');
gui.add({ credits: () => (document.getElementById('credits').hidden = false) }, 'credits').name('Model credits');
fLight.close();
fAudio.close();

// --- credits
document.getElementById('credits-list').innerHTML = CREDITS.map(
  (c) => `<li><a href="https://poly.pizza/m/${c.id}" target="_blank" rel="noopener">${c.name}</a> by ${c.author} — ${c.license}</li>`,
).join('');
document.querySelector('#credits .close').addEventListener('click', () => (document.getElementById('credits').hidden = true));

// --- intro gate (audio needs a user gesture)
enterBtn.disabled = false;
enterBtn.textContent = 'Enter';
enterBtn.addEventListener('click', () => {
  document.getElementById('intro').classList.add('hidden');
  if (settings.playing) beat.start();
});

// Shareable views: ?cam=x,y,z&look=x,y,z (add &skip to bypass the intro, no audio)
const params = new URLSearchParams(location.search);
const vec = (s) => s?.split(',').map(Number).filter(Number.isFinite);
const cam = vec(params.get('cam'));
const look = vec(params.get('look'));
if (cam?.length === 3) camera.position.set(...cam);
if (look?.length === 3) nav.orbit.target.set(...look);
nav.orbit.update();
if (params.has('skip')) document.getElementById('intro').remove();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  const levels = beat.update();
  nav.update(dt);
  set.update(t, levels, opts);
  props.update(t, dt, levels, opts);
  composer.render();
});

window.__stage = { scene, camera, props, settings, nav, orbit: nav.orbit };
