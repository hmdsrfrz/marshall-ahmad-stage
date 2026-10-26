import * as THREE from 'three';
import { buildSet } from './set.js';
import { buildProps, CREDITS } from './props.js';
import { buildCrowd } from '../../engine/crowd.js';
import { buildWarehouseRoom } from '../../engine/warehouse.js';

export default {
  id: 'tarp',
  title: 'Tarp Box',
  settingsKey: 'stageviz.settings.v2',
  layoutKey: 'stageviz.layout.v3',
  credits: CREDITS,
  camera: { position: [0, 3.2, 21], target: [0, 2.4, 0] },
  defaults: {
    tilt: 8,
    tarpOpacity: 0.2,
    tarpSway: true,
    crowd: true,
    warehouse: false,
    warehouseLights: 1,
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
  },

  async build({ scene, renderer, bloom, quality }) {
    scene.background = new THREE.Color(0x040404);
    scene.fog = new THREE.FogExp2(0x080808, 0.012);
    scene.add(new THREE.HemisphereLight(0x5a5a5e, 0x080808, 0.2));

    const set = buildSet(scene, renderer);
    const props = await buildProps(scene, set);
    const room = buildWarehouseRoom(scene);
    const crowd = buildCrowd(scene, { count: quality === 'high' ? 220 : 120, area: { x: [-11, 11], z: [6.8, 19] }, rim: 0xd8dcff, seed: 8 });
    const opts = { containerColor: new THREE.Color() };

    return {
      movables: props.movables,
      update(t, dt, levels) {
        set.update(t, levels, opts);
        props.update(t, dt, levels, opts);
        room.update();
        crowd.userData.update(t, levels, opts.reactivity);
      },
      apply(s) {
        crowd.visible = s.crowd;
        room.apply(s);
        set.setTilt(s.tilt);
        set.setTarpOpacity(s.tarpOpacity);
        set.underColor.set(s.underColor);
        opts.containerColor.set(s.containerColor);
        Object.assign(opts, {
          reactivity: s.reactivity,
          containerGlow: s.containerGlow,
          uplights: s.uplights,
          spots: s.spots,
          pattern: s.pattern,
          haze: s.haze,
          led: s.led,
          tarpSway: s.tarpSway,
        });
        scene.fog.density = 0.012 * s.haze;
        bloom.strength = s.bloom;
        renderer.toneMappingExposure = s.exposure;
      },
      gui(gui, s, onChange) {
        const fStage = gui.addFolder('Tarp box');
        fStage.add(s, 'tilt', 0, 20, 0.5).name('Tilt (°)').onChange(onChange);
        fStage.add(s, 'tarpOpacity', 0.02, 0.6, 0.01).name('Tarp opacity').onChange(onChange);
        fStage.add(s, 'led', 0, 4, 0.05).name('LED frame').onChange(onChange);
        fStage.add(s, 'tarpSway').name('Tarp sway').onChange(onChange);
        fStage.add(s, 'crowd').name('Show crowd').onChange(onChange);
        fStage.add(s, 'warehouse').name('Show warehouse').onChange(onChange);
        fStage.add(s, 'warehouseLights', 0, 3, 0.05).name('Warehouse lights').onChange(onChange);
        const fLight = gui.addFolder('Lighting');
        fLight.add(s, 'reactivity', 0, 3, 0.05).name('Sound reactivity').onChange(onChange);
        fLight.addColor(s, 'underColor').name('Under-stage color').onChange(onChange);
        fLight.addColor(s, 'containerColor').name('Container color').onChange(onChange);
        fLight.add(s, 'containerGlow', 0, 3, 0.05).name('Container glow').onChange(onChange);
        fLight.add(s, 'uplights', 0, 3, 0.05).name('Front uplights').onChange(onChange);
        fLight.add(s, 'spots', 0, 3, 0.05).name('Moving heads').onChange(onChange);
        fLight.add(s, 'pattern', ['auto', 'fan', 'ballyhoo', 'cross', 'singer']).name('Spot pattern').onChange(onChange);
        fLight.add(s, 'haze', 0, 2.5, 0.05).name('Haze').onChange(onChange);
        fLight.add(s, 'bloom', 0, 2.5, 0.05).name('Bloom').onChange(onChange);
        fLight.add(s, 'exposure', 0.3, 2.5, 0.05).name('Exposure').onChange(onChange);
        fLight.close();
      },
    };
  },
};
