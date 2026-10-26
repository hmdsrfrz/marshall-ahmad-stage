import * as THREE from 'three';
import { loadModels, movableRegistry } from '../../engine/models.js';
import { buildWarehouse } from './warehouse.js';
import { buildProps } from './props.js';
import { buildCrowd } from '../../engine/crowd.js';
import { buildWarehouseRoom } from '../../engine/warehouse.js';

const MODELS = {
  car: 'car.glb',
  person: 'person.glb',
  keyboard: 'keyboard.glb',
  drums: 'drums.glb',
  barrel: 'mademen/barrel.glb',
  jerrycan: 'mademen/jerrycan.glb',
  wrench1: 'mademen/wrench1.glb',
  wrench2: 'mademen/wrench2.glb',
  hammer: 'mademen/hammer.glb',
  saw: 'mademen/saw.glb',
  screwdriver: 'mademen/screwdriver.glb',
  pliers: 'mademen/pliers.glb',
  pipewrench: 'mademen/pipewrench.glb',
  flowers: 'mademen/flowers.glb',
  daisy: 'mademen/daisy.glb',
  ivy: 'mademen/ivy.glb',
  vine: 'mademen/vine.glb',
  motorbike: 'mademen/motorbike.glb',
  speaker: 'mademen/speaker.glb',
};

export const CREDITS = [
  { name: 'Car', author: 'Quaternius', id: 'HQ0hvRM2XR', license: 'CC-BY 3.0' },
  { name: 'Man', author: 'Quaternius', id: 'HMnuH5geEG', license: 'CC0' },
  { name: 'Keyboard', author: 'S. Paul Michael', id: 'fP_S-_T1BOZ', license: 'CC-BY 3.0' },
  { name: 'Drum Set', author: 'Zsky', id: 'qWU9Q4flfQ', license: 'CC-BY 3.0' },
  { name: 'Motorcycle', author: 'Zsky', id: '9SwnIlPjNv', license: 'CC-BY 3.0' },
  { name: 'Oil Drum', author: 'Quaternius', id: 'IuoYedcdXQ', license: 'CC0' },
  { name: 'Gas Can', author: 'Quaternius', id: 'eS1OXGo51c', license: 'CC0' },
  { name: 'Flowers', author: 'Quaternius', id: 'NBUxHir6FJ', license: 'CC0' },
  { name: 'Daisy', author: 'Zoe XR', id: '9dubDMkAcZ5', license: 'CC-BY 3.0' },
  { name: 'Ivy', author: 'Jarlan Perez', id: '3SiwWmWJ2WW', license: 'CC-BY 3.0' },
  { name: 'Ivy vine', author: 'Darren Myners', id: 'fl9ekuUPe2M', license: 'CC-BY 3.0' },
  { name: 'Wrench', author: 'CreativeTrio', id: 'POJHQLnLvB', license: 'CC0' },
  { name: 'Wrench', author: 'Armory_3D', id: 'TvT0yqLRln', license: 'CC0' },
  { name: 'Hammer', author: 'Pichuliru', id: 'OVlrtGkzMd', license: 'CC0' },
  { name: 'Pipe wrench', author: 'Pichuliru', id: 'yB1WmvFQNr', license: 'CC0' },
  { name: 'Hand saw', author: 'CreativeTrio', id: 'rbZHkFchEk', license: 'CC0' },
  { name: 'Screwdriver', author: 'CreativeTrio', id: 'qBFMjkrKzH', license: 'CC0' },
  { name: 'Pliers', author: 'jeremy', id: '14FVXuvklov', license: 'CC-BY 3.0' },
  { name: 'Speaker', author: 'iPoly3D', id: 'zOQOThSpuo', license: 'CC0' },
];

export default {
  id: 'mademen',
  title: 'MADE MEN',
  settingsKey: 'stageviz.mademen.settings.v1',
  layoutKey: 'stageviz.mademen.layout.v2',
  credits: CREDITS,
  camera: { position: [0, 3.4, 25], target: [0, 4, 0] },
  defaults: {
    crowd: true,
    warehouse: true,
    warehouseLights: 1,
    plasticOpacity: 0.3,
    plasticSway: true,
    reactivity: 1,
    footlights: 1,
    topLight: 1,
    pink: 1,
    pinkColor: '#ff6f9a',
    shadowSpot: 1,
    headlights: 1,
    fire: 1,
    worklights: 1,
    festoon: 1,
    haze: 1,
    bloom: 0.65,
    exposure: 0.9,
    tint: 0.42,
    grain: 0.05,
    vignette: 0.45,
  },

  async build({ scene, renderer, camera, bloom, grade, quality }) {
    scene.background = new THREE.Color(0x05080c);
    scene.fog = new THREE.FogExp2(0x0a1820, 0.022);
    scene.add(new THREE.HemisphereLight(0x2e5466, 0x060708, 0.6));
    grade.enabled = true;

    const gl = await loadModels(MODELS);
    const movables = [];
    const add = movableRegistry(movables);
    const house = buildWarehouse(scene, gl, { quality });
    for (const m of house.movables) add(m.parent, m);
    const props = buildProps(scene, gl, { add });
    const room = buildWarehouseRoom(scene, { renderer, camera });
    const crowd = buildCrowd(scene, { count: quality === 'high' ? 250 : 140, keepClear: [[-9.3, 5.7, 2.5], [9.3, 5.7, 2.4]] });
    const opts = {};

    return {
      movables,
      update(t, dt, levels) {
        house.update(t, dt, levels, opts);
        room.update();
        crowd.userData.update(t, levels, opts.reactivity);
        props.update(t, dt, levels, opts);
      },
      apply(s) {
        Object.assign(opts, s);
        crowd.visible = s.crowd;
        room.apply(s);
        house.apply(s);
        scene.fog.density = 0.022 * s.haze;
        bloom.strength = s.bloom;
        renderer.toneMappingExposure = s.exposure;
        grade.uniforms.tintAmount.value = s.tint;
        grade.uniforms.grain.value = quality === 'high' ? s.grain : 0;
        grade.uniforms.vignette.value = s.vignette;
      },
      gui(gui, s, onChange) {
        const fStage = gui.addFolder('MADE MEN stage');
        fStage.add(s, 'crowd').name('Show crowd').onChange(onChange);
        fStage.add(s, 'warehouse').name('Show warehouse').onChange(onChange);
        fStage.add(s, 'warehouseLights', 0, 3, 0.05).name('Warehouse lights').onChange(onChange);
        fStage.add(s, 'plasticOpacity', 0.05, 0.7, 0.01).name('Plastic opacity').onChange(onChange);
        fStage.add(s, 'plasticSway').name('Plastic sway').onChange(onChange);
        const fLight = gui.addFolder('Lighting');
        fLight.add(s, 'reactivity', 0, 3, 0.05).name('Sound reactivity').onChange(onChange);
        fLight.add(s, 'footlights', 0, 3, 0.05).name('Bottom stage glow').onChange(onChange);
        fLight.add(s, 'topLight', 0, 3, 0.05).name('Top warm glow').onChange(onChange);
        fLight.add(s, 'pink', 0, 3, 0.05).name('Back plastic glow').onChange(onChange);
        fLight.addColor(s, 'pinkColor').name('Back glow color').onChange(onChange);
        fLight.add(s, 'shadowSpot', 0, 3, 0.05).name('Shadow spotlight').onChange(onChange);
        fLight.add(s, 'headlights', 0, 3, 0.05).name('Car headlights').onChange(onChange);
        fLight.add(s, 'fire', 0, 3, 0.05).name('Fire barrels').onChange(onChange);
        fLight.add(s, 'worklights', 0, 3, 0.05).name('Work lights').onChange(onChange);
        fLight.add(s, 'festoon', 0, 3, 0.05).name('Festoon bulbs').onChange(onChange);
        fLight.add(s, 'haze', 0, 2.5, 0.05).name('Haze').onChange(onChange);
        fLight.add(s, 'bloom', 0, 2.5, 0.05).name('Bloom').onChange(onChange);
        fLight.add(s, 'exposure', 0.3, 2.5, 0.05).name('Exposure').onChange(onChange);
        fLight.close();
        const fLook = gui.addFolder('Film look');
        fLook.add(s, 'tint', 0, 1, 0.01).name('Teal/amber grade').onChange(onChange);
        fLook.add(s, 'grain', 0, 0.2, 0.005).name('Film grain').onChange(onChange);
        fLook.add(s, 'vignette', 0, 1, 0.01).name('Vignette').onChange(onChange);
        fLook.close();
      },
    };
  },
};
