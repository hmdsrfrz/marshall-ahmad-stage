import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'lil-gui';
import { createNavigation } from './engine/navigation.js';
import { BeatMachine } from './engine/audio.js';
import { loadingManager } from './engine/models.js';
import { createGradePass } from './engine/grade.js';

// Each stage is its own module, loaded on demand so only the open stage's code and models download.
const SCENES = {
  tarp: { label: 'Tarp box', load: () => import('./scenes/tarp/index.js') },
  mademen: { label: 'MADE MEN', load: () => import('./scenes/mademen/index.js') },
};
const COMMON_KEY = 'stageviz.common.v1';

const params = new URLSearchParams(location.search);
const sceneId = SCENES[params.get('scene')] ? params.get('scene') : 'tarp';

const readJSON = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
};
const writeJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const common = { playing: true, volume: 0.6, bpm: 100, quality: 'high', ...readJSON(COMMON_KEY) };
const high = common.quality === 'high';

const enterBtn = document.getElementById('enter');
const helpEl = document.getElementById('help');
loadingManager.onProgress = (_url, loaded, total) => {
  enterBtn.textContent = `Loading ${Math.round((loaded / total) * 100)}%`;
};

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 1.5 : 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = high;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.12;

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 200);

const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: high ? 4 : 0 }),
);
composer.addPass(new RenderPass(scene, camera));
const bloomScale = high ? 1 : 0.5;
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth * bloomScale, window.innerHeight * bloomScale), 0.8, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = createGradePass();
composer.addPass(grade);

// --- load and build the selected stage; a failure is shown on the intro card instead of hanging on "Loading"
let def, stage, settings;
try {
  def = (await SCENES[sceneId].load()).default;
  document.title = `Marshall Ahmad — ${def.title} — Concert Stage Visualization`;
  document.querySelector('.intro-card p').textContent = `${def.title} · Concert Stage Visualization`;
  camera.position.set(...def.camera.position);
  settings = { ...def.defaults, ...readJSON(def.settingsKey) };
  const t0 = performance.now();
  stage = await def.build({ scene, renderer, camera, bloom, grade, quality: common.quality });
  console.info(`[scene] ${sceneId} built in ${(performance.now() - t0).toFixed(0)} ms`);
} catch (err) {
  console.error(`[scene] ${sceneId} failed to load`, err);
  enterBtn.textContent = 'Failed to load stage';
  const msg = document.createElement('p');
  msg.className = 'error';
  msg.textContent = String(err?.message ?? err);
  document.querySelector('.intro-card').appendChild(msg);
  throw err;
}

const nav = createNavigation({ camera, renderer, scene, movables: stage.movables, helpEl, layoutKey: def.layoutKey });
nav.orbit.target.set(...def.camera.target);
nav.orbit.update();

const beat = new BeatMachine();
function applySettings() {
  stage.apply(settings);
  beat.bpm = common.bpm;
  beat.setVolume(common.volume);
  if (beat.ctx) common.playing ? beat.start() : beat.stop();
  writeJSON(def.settingsKey, settings);
  writeJSON(COMMON_KEY, common);
}
applySettings();
const onChange = () => applySettings();

// --- GUI
const gui = new GUI({ title: 'Stage controls' });
const fView = gui.addFolder('View');
const choice = { scene: sceneId };
fView
  .add(choice, 'scene', Object.fromEntries(Object.entries(SCENES).map(([id, s]) => [s.label, id])))
  .name('Stage')
  .onChange((id) => (location.search = `?scene=${id}`));
fView.add({ walk: () => nav.enterWalk() }, 'walk').name('Walk mode (Tab)');
fView.add({ reset: () => nav.resetCamera() }, 'reset').name('Reset camera');
// changing quality rebuilds the renderer and render targets, so it reloads the page
fView
  .add(common, 'quality', { 'High (shadows, reflections)': 'high', 'Low (faster)': 'low' })
  .name('Quality')
  .onChange(() => {
    writeJSON(COMMON_KEY, common);
    location.reload();
  });

stage.gui(gui, settings, onChange);

const fAudio = gui.addFolder('Audio');
const songInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'audio/*', hidden: true });
document.body.appendChild(songInput);
const nowPlaying = { track: 'Built-in beat' };
const refreshGui = () => gui.controllersRecursive().forEach((c) => c.updateDisplay());
async function loadSong(file) {
  try {
    await beat.loadSong(file);
    nowPlaying.track = file.name;
    common.playing = true;
  } catch (err) {
    console.warn('[audio] song rejected', err);
    nowPlaying.track = `Couldn't load: ${err.message}`;
  }
  refreshGui();
}
songInput.addEventListener('change', () => {
  if (songInput.files[0]) loadSong(songInput.files[0]);
  songInput.value = '';
});
fAudio.add({ load: () => songInput.click() }, 'load').name('Load song… (or drop a file)');
fAudio.add(nowPlaying, 'track').name('Now playing').disable();
fAudio
  .add(
    {
      beat: () => {
        beat.useBeat();
        nowPlaying.track = 'Built-in beat';
        common.playing = true;
        refreshGui();
      },
    },
    'beat',
  )
  .name('Use built-in beat');
fAudio.add(common, 'playing').name('Playing').onChange(onChange);
fAudio.add(common, 'volume', 0, 1, 0.01).name('Volume').onChange(onChange);
fAudio.add(common, 'bpm', 70, 150, 1).name('Beat BPM').onChange(onChange);
fAudio.close();

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

// --- stage switch pill: always visible, jumps to the other stage
const other = Object.keys(SCENES).find((id) => id !== sceneId);
const swap = document.getElementById('swap');
swap.textContent = `⇄ ${SCENES[other].label} stage`;
swap.addEventListener('click', () => (location.search = `?scene=${other}`));

// --- credits
document.getElementById('credits-list').innerHTML = def.credits
  .map((c) => `<li><a href="https://poly.pizza/m/${c.id}" target="_blank" rel="noopener">${c.name}</a> by ${c.author} — ${c.license}</li>`)
  .join('');
document.querySelector('#credits .close').addEventListener('click', () => (document.getElementById('credits').hidden = true));

// --- intro gate (audio needs a user gesture)
enterBtn.disabled = false;
enterBtn.textContent = 'Enter';
enterBtn.addEventListener('click', () => {
  document.getElementById('intro').classList.add('hidden');
  if (common.playing) beat.start();
});

// Shareable views: ?scene=id&cam=x,y,z&look=x,y,z (add &skip to bypass the intro, no audio)
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
  stage.update(t, dt, levels);
  grade.uniforms.time.value = t;
  composer.render();
});

window.__stage = { scene, camera, settings, nav, orbit: nav.orbit };
