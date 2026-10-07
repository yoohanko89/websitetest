# 3D journey and geographic dependencies

The current opening film uses Three.js **0.180.0**. `three.module.js` and
`three.core.js` are copied unmodified from that package's `build/` directory.
Its MIT license is preserved as `THREE-LICENSE.txt`. The application imports
these local files; it makes no CDN or remote graphics requests.

The editable 3D sources are `../journey-3d.js`, `../cosmic-world.js`,
`../korean-landscapes.js` and `../korean-farms.js`. The visitor-led journey
controller is `../odyssey.js`; the atlas is `../odyssey-map.svg`. They render actual meshes,
instanced vegetation, volumetric star points and one perspective camera. The
Korean terrain is an artistic interpretation, not surveyed geographic geometry.

To refresh the pinned vendor files, install outside the checkout with npm's
normal TLS and integrity checks:

```sh
npm install --prefix /tmp/kos-3d-build --cache /tmp/kos-npm-cache \
  --no-audit --no-fund three@0.180.0 esbuild@0.25.11
cp /tmp/kos-3d-build/node_modules/three/build/three.module.js assets/vendor/
cp /tmp/kos-3d-build/node_modules/three/build/three.core.js assets/vendor/
cp /tmp/kos-3d-build/node_modules/three/LICENSE assets/vendor/THREE-LICENSE.txt
```

## Earlier 2D globe (not loaded by the homepage)

The browser module at `../globe-renderer.js` bundles pinned `d3-geo` 3.1.1 and
`topojson-client` 3.1.0, including their `d3-array` and `internmap` dependencies.
Their license notices are preserved in this directory.

`../world-110m.json` is the unmodified `countries-110m.json` distributed with
`world-atlas` 2.0.2. It derives from Natural Earth 4.1.0 Admin 0 geographic data,
which is in the public domain: https://www.naturalearthdata.com/about/terms-of-use/
The world-atlas software license is included here. Boundaries are for a visual
origin story and are not a precise cadastral or navigational map.

The module exports `createGlobe(canvas)`. The returned object exposes:

- `ready`: a Promise resolving to `true` after loading geography, or `false` when
  loading fails so the caller can retain its fallback image.
- `resize(width, height)`: size in CSS pixels; backing pixels account for DPR.
- `draw(rotationDegrees, scale = 1)`: true orthographic geographic rotation.
  Rotate from `0` to `-127` to bring Korea into view. The center latitude is 20° N.
- `destroy()`: cancel the map request and clear the canvas.

`globe-renderer.source.js` is the maintainable source. Rebuild outside the checkout
with npm's normal TLS and package-integrity checks:

```sh
npm install --prefix /tmp/kos-globe-tools --cache /tmp/kos-globe-npm-cache \
  --no-audit --no-fund --ignore-scripts \
  d3-geo@3.1.1 topojson-client@3.1.0 world-atlas@2.0.2 esbuild@0.25.11
cp assets/vendor/globe-renderer.source.js /tmp/kos-globe-tools/globe-renderer.source.js
node /tmp/kos-globe-tools/node_modules/esbuild/bin/esbuild \
  /tmp/kos-globe-tools/globe-renderer.source.js --bundle --format=esm \
  --target=es2020 --minify --legal-comments=inline --outfile=assets/globe-renderer.js
```

Runtime needs only the two local static files. It does not require npm, an external
map API, a CDN, or a separate application build.
