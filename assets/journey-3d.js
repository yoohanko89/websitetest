import * as THREE from './vendor/three.module.js';
import { createCosmicWorld } from './cosmic-world.js?v=20261007-unfurl';
import { createKoreanLandscape, getKoreanLandscapeCamera } from './korean-landscapes.js?v=20261007-unfurl';
import { createKoreanFarms } from './korean-farms.js?v=20261007-unfurl';

// One perspective camera, one WebGL scene. A tangent coordinate frame places
// the Korean terrain on the globe and keeps local farm details numerically small.
export async function createJourney(canvas, onChange, { onUnavailable = () => {} } = {}) {
  const duration = 83;
  const compact = innerWidth < 769 || matchMedia('(pointer: coarse)').matches || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4);
  // Bound the drawing surface and avoid multisample buffers on portable GPUs.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, .05, 900000);
  const cosmos = createCosmicWorld({ worldData: globalThis.__KOS_WORLD_DATA, compact, textureWidth: Math.min(compact ? 1024 : 2048, renderer.capabilities.maxTextureSize) });
  let landscape = null;
  let farms = null;
  cosmos.update(26, 1);
  const endpoint = cosmos.getCamera(1);
  const normal = endpoint.position.clone().sub(endpoint.target).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  const landStart = getKoreanLandscapeCamera(0);
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
  scene.add(cosmos.group);
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
  let travel = null;
  let exploring = false;
  let ambientSeconds = 0;
  let discovery = null;
  let width = 1, height = 1;
  let graphicsLost = false;
  let observer;
  let brandOrigin;
  let headerHeight = 82;
  const brandSource = document.querySelector('.hero-wordmark .brand-apostrophe');
  const brandOverlay = document.querySelector('#origin-mark');
  const brandGalaxy = cosmos.getBrandGalaxy();
  const canonicalGalaxy = new THREE.Vector3(0, 0, -240);

  function resetBrandOverlay() {
    if (brandOverlay) brandOverlay.hidden = true;
    if (brandSource) brandSource.style.visibility = '';
  }

  function frameBrandOrigin() {
    if (!brandOrigin || !brandOverlay || !brandSource) return;
    const growth = Math.pow(4.2, smooth((seconds - .8) / 1.8));
    const curl = -.314 * smooth((seconds - .8) / 1.8);
    brandSource.style.visibility = seconds >= .8 ? 'hidden' : '';
    brandOverlay.hidden = seconds < .8 || seconds >= 2.8;
    // Render the SVG at its enlarged size so the original mark stays crisp.
    const markWidth = brandOrigin.width * growth;
    const markHeight = brandOrigin.height * growth;
    brandOverlay.style.left = `${brandOrigin.x - markWidth / 2}px`;
    brandOverlay.style.top = `${brandOrigin.y - markHeight / 2}px`;
    brandOverlay.style.width = `${markWidth}px`;
    brandOverlay.style.height = `${markHeight}px`;
    brandOverlay.style.transform = `rotate(${curl}rad)`;
    brandOverlay.style.opacity = String(1 - smooth((seconds - 1.8)));
    const { system, profile } = brandGalaxy;
    profile.origin = { ...brandOrigin, growth, curl };
    const canonicalRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.16, 0, seconds * .0024));
    if (seconds >= 10.5) {
      system.position.copy(canonicalGalaxy); system.scale.setScalar(1); system.quaternion.copy(canonicalRotation); return;
    }
    camera.updateMatrixWorld(true);
    const worldCenter = canonicalGalaxy.clone().applyMatrix4(spaceToLocal);
    const depth = -worldCenter.clone().applyMatrix4(camera.matrixWorldInverse).z;
    const ndcDepth = worldCenter.clone().project(camera).z;
    const anchor = new THREE.Vector3(brandOrigin.x / width * 2 - 1, 1 - brandOrigin.y / height * 2, ndcDepth)
      .unproject(camera).applyMatrix4(localToSpace);
    const pixelsPerWorldUnit = height * .5 * camera.projectionMatrix.elements[5] / depth;
    const initialScale = brandOrigin.height / (profile.originViewBoxHeight * 1000 * pixelsPerWorldUnit);
    const controlSpace = innerWidth < 769 ? 106 : 120;
    const diameter = Math.min(width * .86, (height - headerHeight - controlSpace) * .68,
      2 * (width - brandOrigin.x - 24), 2 * (brandOrigin.x - 24),
      2 * (brandOrigin.y - headerHeight - 24), 2 * (height - controlSpace - brandOrigin.y - 24));
    const fittedScale = Math.max(1, diameter) / (profile.finalDiameter * 1000 * pixelsPerWorldUnit);
    const opening = smooth((seconds - 2.2) / 3.6);
    const leavingOrigin = smooth((seconds - 7) / 3.5);
    system.position.copy(anchor).lerp(canonicalGalaxy, leavingOrigin);
    const growingScale = THREE.MathUtils.lerp(initialScale * growth, fittedScale, opening);
    system.scale.setScalar(THREE.MathUtils.lerp(growingScale, 1, leavingOrigin));
    const facingViewer = rotation.clone().multiply(camera.quaternion)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -curl));
    system.quaternion.copy(facingViewer).slerp(canonicalRotation, smooth((seconds - 5.8) / 1.6));
    profile.fittedDiameter = diameter;
    const projected = system.position.clone().applyMatrix4(spaceToLocal).project(camera);
    profile.projectedOrigin = { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
  }

  function unavailable() {
    if (disposed || graphicsLost) return;
    graphicsLost = true; playing = false; exploring = false;
    cancelTravel(); cancelAnimationFrame(raf); raf = 0; previous = 0;
    resetBrandOverlay();
    observer?.disconnect(); onUnavailable();
  }
  function contextLost(event) { event.preventDefault(); unavailable(); }
  canvas.addEventListener('webglcontextlost', contextLost);

  function prepareScenery() {
    if (seconds > 25 && !landscape) {
      landscape = createKoreanLandscape({ compact }); scene.add(landscape.group);
    }
    if (seconds > 51 && !farms) {
      farms = createKoreanFarms({ compact }); scene.add(farms.group); farms.setDiscovery(discovery);
    }
  }

  function resize() {
    if (disposed || graphicsLost) return;
    const box = canvas.parentElement.getBoundingClientRect();
    width = Math.max(1, box.width); height = Math.max(1, box.height);
    if (brandSource) {
      const glyph = brandSource.getBoundingClientRect();
      brandOrigin = { x: glyph.left + glyph.width / 2 - box.left, y: glyph.top + glyph.height / 2 - box.top, width: glyph.width, height: glyph.height };
    }
    headerHeight = document.querySelector('#site-header')?.offsetHeight || 82;
    const ratio = Math.min(devicePixelRatio || 1, compact ? 1 : 1.25, Math.sqrt((compact ? 650000 : 1600000) / (width * height)), renderer.capabilities.maxTextureSize / Math.max(width, height));
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = Math.max(1, box.width) / Math.max(1, box.height);
    camera.updateProjectionMatrix();
    render(true);
  }

  function render(forceNotice = false) {
    if (disposed || graphicsLost) return;
    try {
    prepareScenery();
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
      up = localUp;
      phase = 'landscape';
    } else {
      const p = (seconds - 56) / 27;
      pose = farms.getCamera(p);
      up = localUp;
      phase = 'farms';
    }
    if (seconds > 27.15) landscape?.update(seconds + ambientSeconds, THREE.MathUtils.clamp((seconds - 29) / 27, 0, 1));
    if (seconds > 51) farms?.update(seconds + ambientSeconds, THREE.MathUtils.clamp((seconds - 56) / 27, 0, 1));
    // Reveal the tangent terrain only after the camera has entered the
    // atmosphere. Dense dawn mist conceals the rectangular modelling boundary.
    if (landscape) landscape.group.visible = seconds > 27.15;
    if (farms) farms.group.visible = seconds > 51;
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
    // Leave room beneath the ingredient for the visitor's discovery card.
    if (innerWidth < 769 && seconds > 56) {
      const rootFraming = smooth((seconds - 77) / 4);
      camera.fov = THREE.MathUtils.lerp(60, 78, rootFraming);
      camera.setViewOffset(width, height, 0, height * THREE.MathUtils.lerp(.085, .25, rootFraming), width, height);
    } else { camera.fov = 50; camera.clearViewOffset(); }
    camera.updateProjectionMatrix();
    frameBrandOrigin();
    landmark = pose.landmark;
    renderer.render(scene, camera);
    if (forceNotice || Math.abs(seconds - lastNotice) > .12) { lastNotice = seconds; onChange(getState()); }
    } catch (error) { console.warn('The journey paused after a graphics error.', error); unavailable(); }
  }

  function getState() {
    return { ready: !graphicsLost && !disposed, duration, seconds, progress: seconds / duration, playing, visible, phase, landmark,
      compact, graphicsLost, disposed, scenery: { landscape: Boolean(landscape), farms: Boolean(farms) },
      brandGalaxy: { ...cosmos.group.userData.brandGalaxy },
      pixelRatio: renderer.getPixelRatio(), drawingBuffer: [canvas.width, canvas.height],
      travelling: Boolean(travel), exploring, discovery,
      camera: camera.position.toArray(), triangles: renderer.info.render.triangles,
      points: renderer.info.render.points, drawCalls: renderer.info.render.calls, webgl: renderer.capabilities.isWebGL2 };
  }
  function tick(now) {
    raf = 0;
    if (disposed || graphicsLost || (!playing && !travel && !exploring) || !visible) { previous = 0; return; }
    const frameInterval = 1000 / (exploring && !playing && !travel ? 15 : compact ? 30 : 45);
    if (previous && now - previous < frameInterval) { raf = requestAnimationFrame(tick); return; }
    const delta = previous ? Math.min((now - previous) / 1000, .15) : 0;
    let arrived = null;
    if (travel) {
      travel.elapsed = Math.min(travel.duration, travel.elapsed + delta);
      const progress = smooth(travel.elapsed / travel.duration);
      seconds = THREE.MathUtils.lerp(travel.from, travel.to, progress);
      if (travel.elapsed >= travel.duration) { seconds = travel.to; arrived = travel; travel = null; }
    } else if (playing) seconds = Math.min(duration, seconds + delta);
    if (exploring) ambientSeconds += delta;
    previous = now;
    if (seconds >= duration) playing = false;
    render(Boolean(arrived));
    if (arrived) arrived.resolve(true);
    if ((playing || travel || exploring) && !raf) raf = requestAnimationFrame(tick);
  }
  function cancelTravel() { if (travel) { const cancelled = travel; travel = null; cancelled.resolve(false); } }
  function play() {
    if (disposed || graphicsLost) return;
    cancelTravel();
    if (seconds >= duration) seconds = 0;
    playing = true; previous = 0;
    if (!raf && visible) raf = requestAnimationFrame(tick);
    onChange(getState());
  }
  function pause() {
    if (disposed || graphicsLost) return;
    cancelTravel();
    playing = false; previous = 0;
    if (!exploring) { cancelAnimationFrame(raf); raf = 0; }
    onChange(getState());
  }
  function seek(value) {
    if (disposed || graphicsLost) return;
    cancelTravel();
    seconds = THREE.MathUtils.clamp(Number(value) || 0, 0, duration);
    previous = 0; render(true);
  }
  function flyTo(value, flightDuration = 6) {
    if (disposed || graphicsLost) return Promise.resolve(false);
    cancelTravel(); playing = false; previous = 0;
    const target = THREE.MathUtils.clamp(Number(value) || 0, 0, duration);
    if (flightDuration <= 0 || Math.abs(target - seconds) < .01) { seek(target); return Promise.resolve(true); }
    return new Promise(resolve => {
      travel = { from: seconds, to: target, duration: flightDuration, elapsed: 0, resolve };
      if (!raf && visible) raf = requestAnimationFrame(tick);
      onChange(getState());
    });
  }
  function setExploration(active) {
    if (disposed || graphicsLost) return;
    exploring = Boolean(active); previous = 0;
    if (exploring && visible && !raf) raf = requestAnimationFrame(tick);
    if (!exploring && !playing && !travel) { cancelAnimationFrame(raf); raf = 0; }
  }
  function setDiscovery(id) { discovery = id || null; farms?.setDiscovery(discovery); render(true); }
  function setVisible(value) {
    if (disposed || graphicsLost) return;
    visible = value; previous = 0;
    if (visible && (playing || travel || exploring) && !raf) raf = requestAnimationFrame(tick);
    if (!visible) { cancelAnimationFrame(raf); raf = 0; }
    onChange(getState());
  }
  await cosmos.ready;
  resize();
  if (!graphicsLost) { observer = new ResizeObserver(resize); observer.observe(canvas.parentElement); }
  return { play, pause, seek, flyTo, setExploration, setDiscovery, getState, setVisible,
    dispose() {
      if (disposed) return;
      disposed = true; playing = false; exploring = false; cancelTravel();
      cancelAnimationFrame(raf); raf = 0; previous = 0;
      observer?.disconnect(); canvas.removeEventListener('webglcontextlost', contextLost);
      resetBrandOverlay();
      cosmos.dispose(); landscape?.dispose(); farms?.dispose(); renderer.dispose(); scene.clear();
    } };
}
