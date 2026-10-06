import * as THREE from './vendor/three.module.js';
import { createCosmicWorld } from './cosmic-world.js';
import { createKoreanLandscape } from './korean-landscapes.js';
import { createKoreanFarms } from './korean-farms.js';

// One perspective camera, one WebGL scene. A tangent coordinate frame places
// the Korean terrain on the globe and keeps local farm details numerically small.
export async function createJourney(canvas, onChange) {
  const duration = 83;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 769 ? 1.2 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, .05, 900000);
  const cosmos = createCosmicWorld({ worldData: globalThis.__KOS_WORLD_DATA });
  const landscape = createKoreanLandscape();
  const farms = createKoreanFarms();
  await cosmos.ready;
  cosmos.update(26, 1);
  const endpoint = cosmos.getCamera(1);
  const normal = endpoint.position.clone().sub(endpoint.target).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  const landStart = landscape.getCamera(0);
  const seaAnchor = landStart.target.clone(); seaAnchor.y = 0;
  const translation = endpoint.target.clone().sub(seaAnchor.multiplyScalar(.001).applyQuaternion(rotation));
  const localToSpace = new THREE.Matrix4().compose(translation, rotation, new THREE.Vector3(.001, .001, .001));
  const spaceToLocal = localToSpace.clone().invert();
  const spaceRotation = rotation.clone().invert();
  cosmos.group.matrix.copy(spaceToLocal);
  cosmos.group.matrixAutoUpdate = false;
  cosmos.group.traverse(object => {
    if (object.material?.uniforms?.pointSize) object.material.uniforms.pointSize.value *= 1000;
    if (object.isPointLight) { object.distance *= 1000; object.intensity *= 1000 ** object.decay; }
  });
  scene.add(cosmos.group, landscape.group, farms.group);
  const localLight = new THREE.Group();
  localLight.add(new THREE.HemisphereLight('#fff0c9', '#36402b', 1.5));
  const sun = new THREE.DirectionalLight('#ffe0a0', 1.65);
  sun.position.set(-240, 400, 180); localLight.add(sun);
  sun.target.position.set(0, 0, -1400); localLight.add(sun.target);
  scene.add(localLight);
  const burgundy = new THREE.Color('#351020');
  const dawn = new THREE.Color('#b6a389');
  const background = burgundy.clone();
  scene.background = background;
  const fog = new THREE.Fog(dawn, 300, 1500);
  const cosmicUp = new THREE.Vector3(0, 1, 0).applyQuaternion(spaceRotation);
  const localUp = new THREE.Vector3(0, 1, 0);
  const smooth = value => { const p = THREE.MathUtils.clamp(value, 0, 1); return p * p * (3 - 2 * p); };
  let seconds = 0;
  let playing = false;
  let visible = true;
  let previous = 0;
  let raf = 0;
  let lastNotice = -1;
  let landmark = 'Milky Way';
  let phase = 'galaxy';
  let disposed = false;

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(Math.max(1, box.width), Math.max(1, box.height), false);
    camera.aspect = Math.max(1, box.width) / Math.max(1, box.height);
    camera.updateProjectionMatrix();
    render();
  }

  function render() {
    let pose;
    let up = cosmicUp;
    if (seconds <= 26) {
      const progress = seconds / 26;
      cosmos.update(seconds, progress);
      pose = cosmos.getCamera(progress);
      pose.position.applyMatrix4(spaceToLocal);
      pose.target.applyMatrix4(spaceToLocal);
      phase = progress < .43 ? 'galaxy' : progress < .77 ? 'earth' : 'korea';
    } else if (seconds < 29) {
      cosmos.update(26, 1);
      const p = smooth((seconds - 26) / 3);
      pose = { position: endpoint.position.clone().applyMatrix4(spaceToLocal).lerp(landStart.position, p), target: endpoint.target.clone().applyMatrix4(spaceToLocal).lerp(landStart.target, p), landmark: 'Korea → Jeju Island' };
      up = cosmicUp.clone().lerp(localUp, p).normalize();
      phase = 'korea';
    } else if (seconds < 56) {
      const p = (seconds - 29) / 27;
      pose = landscape.getCamera(p);
      landscape.update(seconds, p);
      up = localUp;
      phase = 'landscape';
    } else {
      const p = (seconds - 56) / 27;
      pose = farms.getCamera(p);
      farms.update(seconds, p);
      up = localUp;
      phase = 'farms';
    }
    landscape.update(seconds, THREE.MathUtils.clamp((seconds - 29) / 27, 0, 1));
    farms.update(seconds, THREE.MathUtils.clamp((seconds - 56) / 27, 0, 1));
    // Reveal the tangent terrain only after the camera has entered the
    // atmosphere. Dense dawn mist conceals the rectangular modelling boundary.
    landscape.group.visible = seconds > 27.15;
    farms.group.visible = seconds > 51;
    cosmos.group.visible = seconds < 27.15;
    localLight.visible = seconds > 22;
    const atmosphere = smooth((seconds - 25.5) / 4);
    background.copy(burgundy).lerp(dawn, atmosphere);
    scene.fog = seconds > 25.5 ? fog : null;
    if (seconds < 27.15) {
      const entry = smooth((seconds - 25.5) / 1.65);
      fog.near = 300 * (1 - entry);
      fog.far = THREE.MathUtils.lerp(9000, 230, entry);
    } else {
      const emerging = smooth((seconds - 27.15) / 2.1);
      fog.near = 300 * emerging;
      fog.far = THREE.MathUtils.lerp(230, 1500, emerging);
    }
    camera.position.copy(pose.position);
    camera.up.copy(up);
    camera.lookAt(pose.target);
    camera.near = Math.max(.025, Math.min(300, pose.position.distanceTo(pose.target) * .001));
    camera.far = seconds < 30 ? 900000 : 4000;
    camera.updateProjectionMatrix();
    landmark = pose.landmark;
    renderer.render(scene, camera);
    if (Math.abs(seconds - lastNotice) > .12 || !playing) { lastNotice = seconds; onChange(getState()); }
  }

  function getState() {
    return { ready: true, duration, seconds, progress: seconds / duration, playing, visible, phase, landmark,
      camera: camera.position.toArray(), triangles: renderer.info.render.triangles,
      points: renderer.info.render.points, drawCalls: renderer.info.render.calls, webgl: renderer.capabilities.isWebGL2 };
  }
  function tick(now) {
    raf = 0;
    if (disposed || !playing || !visible) { previous = 0; return; }
    if (previous) seconds = Math.min(duration, seconds + Math.min((now - previous) / 1000, .15));
    previous = now;
    if (seconds >= duration) playing = false;
    render();
    if (playing) raf = requestAnimationFrame(tick);
  }
  function play() {
    if (seconds >= duration) seconds = 0;
    playing = true; previous = 0;
    if (!raf && visible) raf = requestAnimationFrame(tick);
    onChange(getState());
  }
  function pause() {
    playing = false; previous = 0;
    cancelAnimationFrame(raf); raf = 0;
    onChange(getState());
  }
  function seek(value) {
    seconds = THREE.MathUtils.clamp(Number(value) || 0, 0, duration);
    previous = 0; render();
  }
  function setVisible(value) {
    visible = value; previous = 0;
    if (visible && playing && !raf) raf = requestAnimationFrame(tick);
    if (!visible) { cancelAnimationFrame(raf); raf = 0; }
    onChange(getState());
  }
  resize();
  const observer = new ResizeObserver(resize); observer.observe(canvas.parentElement);
  return { play, pause, seek, getState, setVisible,
    dispose() { disposed = true; pause(); observer.disconnect(); cosmos.dispose(); landscape.dispose(); farms.dispose(); renderer.dispose(); } };
}
