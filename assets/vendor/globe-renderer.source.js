import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';

// Real orthographic geography. Rotate from 0 to -127 degrees to reveal Korea.
// All sizes are CSS pixels; this module owns the canvas backing resolution.
export function createGlobe(canvas) {
  const context = canvas.getContext('2d', { alpha: true });
  const abort = new AbortController();
  let width = Math.max(1, canvas.clientWidth || 640);
  let height = Math.max(1, canvas.clientHeight || 640);
  let dpr = 1;
  let destroyed = false;
  let geography;
  let lastRotation = 0;
  let lastScale = 1;
  const projection = geoOrthographic().clipAngle(90).precision(0.35);
  const path = geoPath(projection, context);
  const graticule = geoGraticule10();
  const korea = [127.5, 36.5];
  const sphere = { type: 'Sphere' };

  function resize(nextWidth, nextHeight) {
    if (destroyed || !context) return;
    width = Math.max(1, Number(nextWidth) || canvas.clientWidth || 640);
    height = Math.max(1, Number(nextHeight) || canvas.clientHeight || 640);
    dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    draw(lastRotation, lastScale);
  }

  function draw(rotationDegrees = lastRotation, scale = lastScale) {
    if (destroyed || !context) return;
    lastRotation = Number.isFinite(rotationDegrees) ? rotationDegrees : 0;
    lastScale = Math.max(0.05, Math.min(4, Number(scale) || 1));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!geography) return;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.435 * lastScale;
    projection.translate([cx, cy]).scale(radius).rotate([lastRotation, -20, 0]);

    // Burgundy atmosphere and an olive-lit ocean carry the KOS palette.
    const atmosphere = context.createRadialGradient(cx, cy, radius * 0.88, cx, cy, radius * 1.16);
    atmosphere.addColorStop(0, 'rgba(189,157,95,0)');
    atmosphere.addColorStop(0.62, 'rgba(190,157,99,0.12)');
    atmosphere.addColorStop(0.77, 'rgba(123,56,71,0.07)');
    atmosphere.addColorStop(1, 'rgba(93,22,44,0)');
    context.fillStyle = atmosphere;
    context.beginPath();
    context.arc(cx, cy, radius * 1.16, 0, Math.PI * 2);
    context.fill();

    const ocean = context.createRadialGradient(cx - radius * 0.42, cy - radius * 0.4, radius * 0.06, cx + radius * 0.2, cy + radius * 0.15, radius * 1.15);
    ocean.addColorStop(0, '#63654b');
    ocean.addColorStop(0.36, '#424d3b');
    ocean.addColorStop(0.68, '#263b30');
    ocean.addColorStop(1, '#1e1720');
    context.beginPath();
    path(sphere);
    context.fillStyle = ocean;
    context.fill();

    const oliveLand = context.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    oliveLand.addColorStop(0, '#b0ae7c');
    oliveLand.addColorStop(0.42, '#879465');
    oliveLand.addColorStop(1, '#536646');
    context.beginPath();
    path(geography.land);
    context.fillStyle = oliveLand;
    context.fill();
    context.strokeStyle = 'rgba(210,201,137,0.28)';
    context.lineWidth = 0.7;
    context.stroke();

    context.beginPath();
    path(geography.borders);
    context.strokeStyle = 'rgba(41,56,34,0.29)';
    context.lineWidth = 0.55;
    context.stroke();

    context.beginPath();
    path(graticule);
    context.strokeStyle = 'rgba(224,209,164,0.10)';
    context.lineWidth = 0.55;
    context.stroke();

    if (geography.southKorea) {
      context.beginPath();
      path(geography.southKorea);
      context.fillStyle = '#c7ad58';
      context.fill();
      context.strokeStyle = '#e6ca76';
      context.lineWidth = 0.8;
      context.stroke();
    }

    // A clipped radial shade gives the sphere dimensional light and a dark limb.
    context.save();
    context.beginPath();
    path(sphere);
    context.clip();
    const shade = context.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, radius * 0.2, cx + radius * 0.13, cy + radius * 0.13, radius * 1.15);
    shade.addColorStop(0, 'rgba(248,235,174,0.07)');
    shade.addColorStop(0.5, 'rgba(20,14,20,0)');
    shade.addColorStop(0.82, 'rgba(17,8,17,0.36)');
    shade.addColorStop(1, 'rgba(13,5,13,0.8)');
    context.fillStyle = shade;
    context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    context.restore();

    context.beginPath();
    path(sphere);
    context.strokeStyle = 'rgba(215,193,128,0.37)';
    context.lineWidth = 0.95;
    context.stroke();

    // Orthographic projection also returns points on the hidden hemisphere;
    // angular distance must be checked before drawing the origin marker.
    const distance = geoDistance([-lastRotation, 20], korea);
    if (distance < Math.PI / 2 - 0.02) {
      const [x, y] = projection(korea);
      const markerSize = Math.max(2.6, Math.min(5, radius * 0.016));
      const visibility = Math.min(1, (Math.PI / 2 - distance) * 3);
      context.save();
      context.globalAlpha = visibility;
      const beacon = context.createRadialGradient(x, y, markerSize, x, y, markerSize * 6);
      beacon.addColorStop(0, 'rgba(240,203,94,0.52)');
      beacon.addColorStop(1, 'rgba(240,203,94,0)');
      context.fillStyle = beacon;
      context.beginPath();
      context.arc(x, y, markerSize * 6, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(x, y, markerSize * 2.9, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(229,193,93,0.7)';
      context.lineWidth = 1;
      context.stroke();
      context.beginPath();
      context.arc(x, y, markerSize, 0, Math.PI * 2);
      context.fillStyle = '#f1ce6b';
      context.fill();
      context.restore();
    }
  }

  resize(width, height);
  const ready = context ? fetch(new URL('./world-110m.json', import.meta.url), { signal: abort.signal })
    .then(response => {
      if (!response.ok) throw new Error(`Globe map unavailable (${response.status})`);
      return response.json();
    })
    .then(topology => {
      if (destroyed) return false;
      const countries = feature(topology, topology.objects.countries);
      geography = {
        land: feature(topology, topology.objects.land),
        borders: mesh(topology, topology.objects.countries, (a, b) => a !== b),
        southKorea: countries.features.find(country => String(country.id) === '410'),
      };
      draw(lastRotation, lastScale);
      return true;
    })
    .catch(() => false) : Promise.resolve(false);

  return {
    ready,
    draw,
    resize,
    destroy() {
      destroyed = true;
      abort.abort();
      geography = undefined;
      if (context) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    },
  };
}
