import * as THREE from './vendor/three.module.js';

// A volumetric galaxy, an illuminated spherical Earth, and a continuous camera
// flight. All of the scenery is rendered in the site's single WebGL scene.
const EARTH_RADIUS = 11.5;
const KOREA_LAT = 37.5;
const KOREA_LON = 127;
const GOLD = 0xe0b74d;

function seededRandom(seed = 1729) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

const clamp = THREE.MathUtils.clamp;
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

function geographicVector(latitude, longitude, radius = 1) {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lon = THREE.MathUtils.degToRad(longitude);
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon) * radius,
    Math.sin(lat) * radius,
    -Math.cos(lat) * Math.sin(lon) * radius,
  );
}

function makeStarMaterial(size, opacity = 1, assembling = false) {
  return new THREE.ShaderMaterial({
    uniforms: { pointSize: { value: size }, opacity: { value: opacity }, formation: { value: 1 } },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float starSize;
      varying vec3 vColor;
      uniform float pointSize;
      ${assembling ? 'attribute vec3 originPosition; uniform float formation;' : ''}
      void main() {
        vColor = color;
        ${assembling ? `
          // Adjacent curved bands in the one apostrophe become adjacent arms.
          // Polar interpolation unfurls those bands instead of sending random
          // particles across the centre along unrelated straight lines.
          float assembled = formation;
          float originAngle = atan(originPosition.y, originPosition.x);
          if (originAngle < 0.0) originAngle += 6.28318530718;
          float radius = mix(length(originPosition.xy), length(position.xy), assembled);
          // originPosition.z stores the continuous final angle, not a depth.
          float angle = mix(originAngle, originPosition.z, assembled);
          angle += sin(assembled * 3.14159265359) * 0.18 * (1.0 - radius / 140.0);
          vec3 starPosition = vec3(cos(angle) * radius, sin(angle) * radius,
            position.z * smoothstep(0.2, 1.0, assembled));
          vColor = mix(vec3(0.775822, 0.564712, 0.104616), color,
            smoothstep(0.22, 0.9, assembled));
        ` : 'vec3 starPosition = position;'}
        vec4 eye = modelViewMatrix * vec4(starPosition, 1.0);
        gl_Position = projectionMatrix * eye;
        gl_PointSize = clamp(pointSize * starSize * 240.0 / max(1.0, -eye.z), 1.1, 22.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      uniform float opacity;
      void main() {
        vec2 p = gl_PointCoord - vec2(0.5);
        float distance = length(p) * 2.0;
        if (distance > 1.0) discard;
        float halo = exp(-distance * distance * 8.0);
        float core = exp(-distance * distance * 80.0);
        gl_FragColor = vec4(vColor * (0.8 + core), halo * opacity);
      }
    `,
  });
}

// Match the single SVG used between KO and S. The 24 × 36 viewbox is
// centred on the group's origin, keeping the screen-space logo anchor exact.
const BRAND_ORIGIN_HEIGHT = 230;
function apostropheOriginSampler(random) {
  const shape = new THREE.Shape();
  const x = (value) => (value - 12) / 36 * BRAND_ORIGIN_HEIGHT;
  const y = (value) => (18 - value) / 36 * BRAND_ORIGIN_HEIGHT;
  const curve = (a, b, c, d, e, f) => shape.bezierCurveTo(x(a), y(b), x(c), y(d), x(e), y(f));
  shape.moveTo(x(14.5), y(2));
  curve(20.5, 1.2, 23.6, 5.6, 22.2, 11.2);
  curve(20.7, 17.1, 14.4, 20.6, 10.6, 25.4);
  curve(7.8, 28.9, 6, 31.9, 3, 34);
  curve(4.1, 29.3, 5.5, 24.4, 8.1, 20.6);
  curve(10.9, 16.5, 14.6, 16.3, 14.8, 12.7);
  curve(15, 10.6, 12.8, 10.3, 10.9, 10.4);
  curve(8.3, 10.5, 6.8, 8.1, 7.8, 5.7);
  curve(8.9, 3.1, 11.4, 2.2, 14.5, 2);
  shape.closePath();
  const vertices = shape.getPoints(16);
  const faces = THREE.ShapeUtils.triangulateShape(vertices, []);
  let totalArea = 0;
  const triangles = faces.map((face) => {
    const [a, b, c] = face.map((index) => vertices[index]);
    totalArea += Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * 0.5;
    return { a, b, c, cumulativeArea: totalArea };
  });
  return () => {
    // Area-weighted barycentric sampling fills the one continuous silhouette.
    const target = random() * totalArea;
    let low = 0;
    let high = triangles.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (triangles[middle].cumulativeArea < target) low = middle + 1;
      else high = middle;
    }
    const { a, b, c } = triangles[low];
    const root = Math.sqrt(random());
    const fraction = random();
    return [
      a.x * (1 - root) + b.x * root * (1 - fraction) + c.x * root * fraction,
      a.y * (1 - root) + b.y * root * (1 - fraction) + c.y * root * fraction,
      0,
    ];
  };
}

function makeGalaxy(count) {
  const random = seededRandom(64112);
  const positions = new Float32Array(count * 3);
  const originPositions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const innerColor = new THREE.Color('#fff0c3');
  const middleColor = new THREE.Color('#d0a845');
  const outerColor = new THREE.Color('#a35262');
  const olive = new THREE.Color('#8f9d69');
  const color = new THREE.Color();
  const finalBands = Array.from({ length: 5 }, () => []);
  let maxFinalRadius = 0;
  for (let index = 0; index < count; index += 1) {
    const radius = Math.pow(random(), 0.72) * 115;
    const branch = index % 5;
    const twist = radius * 0.052 + (branch / 5) * Math.PI * 2;
    // Fine dust stays close to five clear ribbons rather than a loose cloud.
    const scatter = Math.pow(random(), 3) * (3.4 + radius * 0.052);
    const angle = twist + (random() - 0.5) * 0.20;
    const gaussian = (random() + random() + random() - 1.5);
    const px = Math.cos(angle) * radius + gaussian * scatter;
    const py = Math.sin(angle) * radius + (random() - 0.5) * scatter;
    positions[index * 3] = px;
    positions[index * 3 + 1] = py;
    positions[index * 3 + 2] = gaussian * (1.1 + radius * 0.035);
    let finalAngle = Math.atan2(py, px);
    // Preserve the branch's actual winding, including complete turns.
    finalAngle += Math.round((angle - finalAngle) / (Math.PI * 2)) * Math.PI * 2;
    const finalRadius = Math.hypot(px, py);
    maxFinalRadius = Math.max(maxFinalRadius, finalRadius);
    finalBands[branch].push({ index, radius: finalRadius, angle: finalAngle });
    color.copy(innerColor).lerp(middleColor, clamp(radius / 36, 0, 1));
    color.lerp(outerColor, clamp((radius - 32) / 83, 0, 0.8));
    if (random() > 0.95) color.lerp(olive, 0.18);
    const armEmphasis = branch === 0 || branch === 2 ? 1.14 : 0.84;
    const radialLight = 0.86 + 0.14 * Math.sin(radius * 0.10 + branch * 0.8);
    color.multiplyScalar((0.65 + random() * 0.55) * armEmphasis * radialLight);
    color.toArray(colors, index * 3);
    sizes[index] = 0.26 + random() * 0.86 + (random() > 0.995 ? 2.3 : 0);
  }
  const originPoint = apostropheOriginSampler(seededRandom(43607));
  const origins = [];
  for (let index = 0; index < count; index += 1) {
    const [x, y] = originPoint();
    let angle = Math.atan2(y, x);
    if (angle < 0) angle += Math.PI * 2;
    origins.push({ x, y, angle, radius: Math.hypot(x, y) });
  }
  // Partition one continuous silhouette into ordered curved bands. Sorting
  // radially within each band preserves the neighbourhood as it opens out.
  origins.sort((a, b) => a.angle - b.angle);
  let offset = 0;
  for (const band of finalBands) {
    band.sort((a, b) => a.radius - b.radius);
    const sourceBand = origins.slice(offset, offset + band.length).sort((a, b) => a.radius - b.radius);
    band.forEach((target, index) => {
      const source = sourceBand[index];
      originPositions.set([source.x, source.y, target.angle], target.index * 3);
    });
    offset += band.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('originPosition', new THREE.BufferAttribute(originPositions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1));
  const galaxy = new THREE.Points(geometry, makeStarMaterial(3.8, 0, true));
  galaxy.name = "KO'S single apostrophe unfurling into the Milky Way";
  galaxy.position.set(0, 0, -240);
  galaxy.rotation.x = 0.16;
  // One immutable bound covers both the brand silhouette and the final arms.
  galaxy.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 140);
  galaxy.userData.finalDiameter = maxFinalRadius * 2;
  return galaxy;
}

function makeGalaxyGlow() {
  // Two triangles and an analytic shader provide a soft luminous heart and
  // spiral dust. There is no image, canvas, or texture allocation to retain.
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(270, 270), new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float opacity;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float edge = 1.0 - smoothstep(0.87, 1.0, r);
        float angle = atan(p.y, p.x);
        float phase = angle * 5.0 - r * 35.1;
        float arms = pow(max(0.0, cos(phase + sin(r * 21.0 + angle * 2.0) * 0.13)), 12.0);
        // Uneven soft gas supports the stars without making a filled disc.
        float clumps = 0.67 + 0.20 * sin(r * 45.0 + sin(angle * 3.0) * 2.0)
          + 0.13 * sin(r * 91.0 - angle * 7.0);
        float core = exp(-r * r * 65.0);
        float dust = arms * clumps * exp(-r * r * 3.4) * smoothstep(0.06, 0.24, r);
        float halo = exp(-r * r * 7.0);
        float nucleus = pow(core, 3.0);
        vec3 gold = mix(vec3(0.78, 0.51, 0.15), vec3(0.34, 0.10, 0.14), r);
        gold = mix(gold, vec3(1.0, 0.95, 0.80), smoothstep(0.1, 0.85, core));
        gl_FragColor = vec4(gold,
          (core * 0.28 + nucleus * 0.42 + dust * 0.125 + halo * 0.024) * edge * opacity);
      }
    `,
  }));
  glow.name = 'Subtle luminous spiral dust';
  glow.position.z = -3;
  return glow;
}

function makeDistantStars(count) {
  const random = seededRandom(73115);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const color = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    const azimuth = random() * Math.PI * 2;
    const y = random() * 2 - 1;
    const radius = 480 + random() * 100;
    const radial = Math.sqrt(1 - y * y);
    positions[index * 3] = Math.cos(azimuth) * radial * radius;
    positions[index * 3 + 1] = y * radius;
    positions[index * 3 + 2] = Math.sin(azimuth) * radial * radius - 110;
    color.set(random() > 0.75 ? '#d5c5a2' : '#a27682').multiplyScalar(0.5 + random() * 0.6);
    color.toArray(colors, index * 3);
    sizes[index] = 0.6 + random() * 0.9;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1));
  return new THREE.Points(geometry, makeStarMaterial(2.3, 0.7));
}

function decodeTopology(topology) {
  const { scale, translate } = topology.transform;
  const arcs = topology.arcs.map((arc) => {
    let longitude = 0;
    let latitude = 0;
    return arc.map((point) => {
      longitude += point[0];
      latitude += point[1];
      return [longitude * scale[0] + translate[0], latitude * scale[1] + translate[1]];
    });
  });
  function stitch(indices) {
    const ring = [];
    for (const index of indices) {
      const points = index < 0 ? [...arcs[~index]].reverse() : arcs[index];
      ring.push(...(ring.length ? points.slice(1) : points));
    }
    return ring;
  }
  function polygons(geometry) {
    if (geometry.type === 'GeometryCollection') return geometry.geometries.flatMap(polygons);
    if (geometry.type === 'Polygon') return [geometry.arcs.map(stitch)];
    if (geometry.type === 'MultiPolygon') return geometry.arcs.map((polygon) => polygon.map(stitch));
    return [];
  }
  return {
    land: polygons(topology.objects.land),
    korea: topology.objects.countries.geometries
      .filter((country) => String(country.id) === '410')
      .flatMap(polygons),
  };
}

function tracePolygons(context, polygons, width, height) {
  context.beginPath();
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (!ring.length) continue;
      const points = [];
      let previous = ring[0][0];
      for (const [longitude, latitude] of ring) {
        let unwrapped = longitude;
        while (unwrapped - previous > 180) unwrapped -= 360;
        while (unwrapped - previous < -180) unwrapped += 360;
        points.push([(unwrapped + 180) / 360 * width, (90 - latitude) / 180 * height]);
        previous = unwrapped;
      }
      for (const shift of [-width, 0, width]) {
        context.moveTo(points[0][0] + shift, points[0][1]);
        for (const point of points.slice(1)) context.lineTo(point[0] + shift, point[1]);
        context.closePath();
      }
    }
  }
}

function makeEarthTexture(topology, width, compact) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = width / 2;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#124d7e');
  gradient.addColorStop(0.32, '#176b96');
  gradient.addColorStop(0.66, '#155d88');
  gradient.addColorStop(1, '#124d7e');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const random = seededRandom(2521);
  const detailScale = width / 4096;
  for (let index = 0; index < Math.max(32, 15000 * detailScale * detailScale); index += 1) {
    context.fillStyle = random() > 0.5 ? 'rgba(133,203,223,0.035)' : 'rgba(5,19,36,0.05)';
    context.fillRect(random() * canvas.width, random() * canvas.height, 2 + random() * 8, 1);
  }
  context.strokeStyle = 'rgba(215,187,112,0.075)';
  context.lineWidth = 0.8;
  context.beginPath();
  for (let lon = 0; lon <= 360; lon += 30) {
    const x = lon / 360 * canvas.width;
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = (90 - lat) / 180 * canvas.height;
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
  }
  context.stroke();
  if (topology) {
    const { land, korea } = decodeTopology(topology);
    tracePolygons(context, land, canvas.width, canvas.height);
    context.fillStyle = '#78835b';
    context.fill('evenodd');
    context.strokeStyle = '#a1a273';
    context.lineWidth = 1.2;
    context.stroke();
    context.save();
    context.clip('evenodd');
    for (let index = 0; index < Math.max(32, 7500 * detailScale * detailScale); index += 1) {
      const y = random() * canvas.height;
      context.fillStyle = random() > 0.5 ? 'rgba(209,184,94,0.11)' : 'rgba(40,67,34,0.12)';
      context.beginPath();
      context.ellipse(random() * canvas.width, y, 3 + random() * 16, 2 + random() * 8, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    tracePolygons(context, korea, canvas.width, canvas.height);
    context.fillStyle = '#a6b878';
    context.fill('evenodd');
    context.strokeStyle = '#e5bd54';
    context.lineWidth = 1.5;
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = compact ? 1 : 2;
  return texture;
}

function makeAtmosphere(compact) {
  return new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.026, compact ? 32 : 48, compact ? 20 : 32), new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 worldPosition;
      varying vec3 worldNormal;
      void main() {
        worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        worldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 worldPosition;
      varying vec3 worldNormal;
      void main() {
        vec3 view = normalize(cameraPosition - worldPosition);
        float rim = pow(1.0 - abs(dot(normalize(worldNormal), view)), 3.2);
        gl_FragColor = vec4(vec3(0.64, 0.64, 0.33), rim * 0.25);
      }
    `,
  }));
}

export function createCosmicWorld(options = {}) {
  const compact = Boolean(options.compact);
  const desiredWidth = compact ? 1024 : 2048;
  const supportedWidth = Number.isFinite(options.textureWidth) ? options.textureWidth : desiredWidth;
  const textureWidth = 2 ** Math.floor(Math.log2(Math.max(16, Math.min(desiredWidth, supportedWidth))));
  const group = new THREE.Group();
  group.name = 'KOS — the universe to Korean origins';
  const galaxy = makeGalaxy(compact ? 8500 : 16000);
  const galaxySystem = new THREE.Group();
  galaxySystem.position.copy(galaxy.position);
  galaxySystem.rotation.copy(galaxy.rotation);
  galaxy.position.set(0, 0, 0);
  galaxy.rotation.set(0, 0, 0);
  const galaxyGlow = makeGalaxyGlow();
  galaxySystem.add(galaxyGlow, galaxy);
  const distantStars = makeDistantStars(compact ? 600 : 1000);
  group.add(galaxySystem, distantStars);
  group.userData.brandGalaxy = {
    mode: 'single-apostrophe', apostropheCount: 1,
    formationSeconds: 5.8, formation: 0, oceanColor: '#176b96',
    motion: 'ordered-polar-unfurl', finalDiameter: galaxy.userData.finalDiameter,
    originViewBoxWidth: BRAND_ORIGIN_HEIGHT * 24 / 36,
    originViewBoxHeight: BRAND_ORIGIN_HEIGHT,
  };

  const earthSystem = new THREE.Group();
  const rotatingEarth = new THREE.Group();
  earthSystem.add(rotatingEarth);
  // A small placeholder avoids keeping two atlas-sized canvases alive while
  // the geographic texture is drawn and uploaded on memory-limited browsers.
  const fallbackTexture = makeEarthTexture(null, Math.min(128, textureWidth), compact);
  const planetMaterial = new THREE.MeshStandardMaterial({
    map: fallbackTexture,
    roughness: 0.88,
    metalness: 0.02,
    emissive: 0x0b2842,
    emissiveIntensity: 0.19,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, compact ? 48 : 64, compact ? 32 : 40), planetMaterial);
  planet.name = 'Geographic Earth — olive land and blue ocean';
  rotatingEarth.add(planet);
  earthSystem.add(makeAtmosphere(compact));
  group.add(earthSystem);

  const koreaDirection = geographicVector(KOREA_LAT, KOREA_LON);
  const beacon = new THREE.Group();
  beacon.position.copy(koreaDirection.clone().multiplyScalar(EARTH_RADIUS + 0.04));
  beacon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), koreaDirection);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true });
  beacon.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), markerMaterial));
  const signal = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.31, 40), new THREE.MeshBasicMaterial({
    color: GOLD, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false,
  }));
  signal.position.z = 0.05;
  beacon.add(signal);
  const pole = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1.15),
  ]), new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.5 }));
  beacon.add(pole);
  rotatingEarth.add(beacon);

  const orbitPoints = [];
  for (let index = 0; index <= 256; index += 1) {
    const angle = index / 256 * Math.PI * 2;
    orbitPoints.push(new THREE.Vector3(Math.cos(angle) * 45, -14 + Math.sin(angle) * 6, Math.sin(angle) * 45));
  }
  const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPoints), new THREE.LineBasicMaterial({
    color: 0xcba449, transparent: true, opacity: 0.12,
  }));
  orbit.name = 'Orbital path';
  group.add(orbit);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(5.4, 28, 20), new THREE.MeshBasicMaterial({ color: 0xe1b552 }));
  sun.position.set(-76, 18, -8);
  group.add(sun);
  const sunlight = new THREE.PointLight(0xffdfa2, 1600, 250, 1.7);
  sunlight.position.copy(sun.position);
  group.add(sunlight);
  const key = new THREE.DirectionalLight(0xf5e6be, 2.1);
  key.position.set(-18, 24, -36);
  key.target = earthSystem;
  group.add(key);
  const fill = new THREE.HemisphereLight(0xd4d2a4, 0x4b1930, 1.55);
  group.add(fill);

  const flight = new THREE.CatmullRomCurve3([
    new THREE.Vector3(18, 48, -55),
    new THREE.Vector3(-58, 31, -110),
    new THREE.Vector3(-30, 7, -186),
    new THREE.Vector3(15, -3, -238),
    new THREE.Vector3(34, 9, -171),
    new THREE.Vector3(12, 13, -92),
    new THREE.Vector3(-18, 14, -43),
  ], false, 'catmullrom', 0.22);
  const gaze = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4, 0, -240),
    new THREE.Vector3(4, 0, -247),
    new THREE.Vector3(19, -3, -236),
    new THREE.Vector3(30, 8, -205),
    new THREE.Vector3(4, 2, -67),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0),
  ], false, 'catmullrom', 0.15);
  const planetEntry = flight.getPoint(1);
  let disposed = false;
  let lastTime = 0;
  let lastProgress = 0;
  const axis = new THREE.Vector3(0, 1, 0);

  function koreaWorldDirection() {
    return koreaDirection.clone().applyAxisAngle(axis, rotatingEarth.rotation.y);
  }

  function update(time, progress) {
    lastTime = Number.isFinite(time) ? time : 0;
    lastProgress = clamp(progress, 0, 1);
    galaxySystem.rotation.z = lastTime * 0.0024;
    const formation = smooth((lastTime - 2.2) / 3.6);
    const emergence = smooth((lastTime - 1.5) / 1.1);
    // Thousands of stars initially occupy a small logo silhouette. Keep that
    // handoff delicate, then gain luminosity as the ribbons separate.
    const starOpacity = emergence * THREE.MathUtils.lerp(0.10, 1.0, smooth((lastTime - 2.4) / 3.0));
    galaxy.material.uniforms.formation.value = formation;
    galaxy.material.uniforms.opacity.value = starOpacity;
    galaxy.visible = starOpacity > 0.001;
    galaxyGlow.material.uniforms.opacity.value = smooth((lastTime - 3.0) / 2.8);
    galaxyGlow.visible = lastTime > 3.0;
    distantStars.material.uniforms.opacity.value = 0.7 * smooth((lastTime - 4.4) / 2);
    distantStars.visible = lastTime > 4.4;
    group.userData.brandGalaxy.formation = formation;
    const lock = smooth((lastProgress - 0.54) / 0.2);
    rotatingEarth.rotation.y = THREE.MathUtils.lerp(-1.12 + lastTime * 0.045, -0.647, lock);
    const orbitalPhase = lastTime * 0.035;
    earthSystem.position.set(Math.sin(orbitalPhase) * 1.45, 0, (Math.cos(orbitalPhase) - 1) * 1.45);
    const pulse = 1 + ((lastTime * 0.55) % 1) * 2.5;
    const beaconOpacity = 1 - smooth((lastProgress - 0.82) / 0.13);
    signal.scale.setScalar(pulse);
    signal.material.opacity = 0.72 * (1 - (pulse - 1) / 2.5) * beaconOpacity;
    markerMaterial.opacity = beaconOpacity;
    pole.material.opacity = 0.5 * beaconOpacity;
    beacon.visible = lastProgress > 0.49 && lastProgress < 0.95;
  }

  function getCamera(progress) {
    const p = clamp(progress, 0, 1);
    let position;
    let target;
    if (p <= 0.63) {
      // Watch the single brand apostrophe become a galaxy before flying into it. Both
      // curves reach their original Earth entry at 16.38 seconds, so the globe
      // and Korea approach still join the existing route without a camera cut.
      const voyage = smooth((p * 26 - 7.4) / (26 * 0.63 - 7.4));
      position = flight.getPoint(voyage);
      target = gaze.getPoint(voyage);
      if (p > 0.53) target.lerp(earthSystem.position, smooth((p - 0.53) / 0.1));
    } else {
      const approach = (p - 0.63) / 0.37;
      const korea = koreaWorldDirection();
      const entryDirection = planetEntry.clone().sub(earthSystem.position).normalize();
      const entryRadius = planetEntry.distanceTo(earthSystem.position);
      const direction = entryDirection.clone().lerp(korea, smooth(approach)).normalize();
      // Keep the camera outside the surface even at the end of the Korean zoom.
      const radius = THREE.MathUtils.lerp(entryRadius, EARTH_RADIUS + 1.4, smooth(approach));
      position = direction.multiplyScalar(radius).add(earthSystem.position);
      target = earthSystem.position.clone().add(korea.multiplyScalar(EARTH_RADIUS * smooth((approach - 0.28) / 0.72)));
    }
    let landmark = "KO'S · a galaxy takes shape";
    if (p > 7.4 / 26 && p < 0.43) landmark = 'Inside the galaxy';
    if (p >= 0.43 && p < 0.77) landmark = 'Earth';
    if (p >= 0.77) landmark = 'Korea';
    return { position, target, landmark };
  }

  const atlasRequest = new AbortController();
  const ready = Promise.resolve(options.worldData || fetch(new URL('./world-110m.json', import.meta.url), { signal: atlasRequest.signal })
    .then((response) => {
      if (!response.ok) throw new Error(`World atlas: ${response.status}`);
      return response.json();
    }))
    .then((topology) => {
      if (disposed) return false;
      const texture = makeEarthTexture(topology, textureWidth, compact);
      planetMaterial.map = texture;
      planetMaterial.needsUpdate = true;
      fallbackTexture.dispose();
      fallbackTexture.image.width = 1;
      fallbackTexture.image.height = 1;
      return true;
    })
    .catch(() => false);

  function dispose() {
    if (disposed) return;
    disposed = true;
    atlasRequest.abort();
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          if (material.map) textures.add(material.map);
        }
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) {
      texture.dispose();
      // CanvasTexture.dispose releases the GPU allocation, while shrinking the
      // source releases the canvas backing store even if this world is retained.
      texture.image.width = 1;
      texture.image.height = 1;
    }
  }

  update(0, 0);
  function getBrandGalaxy() {
    return { system: galaxySystem, profile: group.userData.brandGalaxy };
  }
  return { group, getCamera, getBrandGalaxy, update, ready, dispose };
}
