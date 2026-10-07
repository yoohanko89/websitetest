# KO'S — Korean Original Soul

An English ingredient website with **Your Korean Odyssey**, a visitor-led
3D journey. An automatically playing galaxy → orbiting Earth → Korea zoom
pauses on arrival and invites the visitor to begin. The camera follows Jeju,
the south coast, Maisan and Buseoksa before entering tea, yuzu and ginseng
farms. Visitors choose growing regions on an illustrated atlas, fly there in
3D and deliberately discover the leaf, fruit and root. Three discoveries
reveal KO'S ingredient philosophy and buyer links. Burgundy, gold yellow
and olive green connect the voyage to the brand.

The underlying camera route spans 83 seconds; visitor decisions pause the
route at Korea (24s), tea (63.4s), yuzu (72.2s) and ginseng (82.4s).
The atlas moves along the actual camera route, rather than replacing the
3D scene with photos. Leaves and ingredient discovery accents remain alive
while a visitor reads a farm story. Reduced motion starts paused and makes
explicit destination choices immediate. Discovery marks last only for the
current page visit; Restart clears them.

## Public site

GitHub Pages serves https://yoohanko89.github.io/websitetest/ from the `main`
branch. A `.nojekyll` file keeps the site as plain static files. Changes pushed
to `main` trigger the existing Pages build and deployment. Confirm the latest
Pages workflow succeeds before reporting a deployment as complete.

## Develop and preview

Use the existing checkout. Cloud tasks already have an isolated environment;
do not create a Git worktree unless explicitly requested.

```sh
cd /workspace/websitetest
python -m http.server 8000 --bind 0.0.0.0
```

Python 3 and a browser are sufficient. There is no npm installation or application
build required. Check the server internally with `curl -I http://127.0.0.1:8000/`.

The rendered English page is in `index.html`, with presentation in `styles.css`
and interactions in `app.js`. Editorial source copy is kept in
`assets/buyer-content.json`; editing that JSON alone does not regenerate the page.
The 3D scene modules, `assets/odyssey.js` visitor controller, vendored Three.js and geographic data are served locally
under `assets/`, with source and license notes in `assets/vendor/README.md`.

Validate desktop/mobile navigation, actual WebGL rendering, the Korea arrival
checkpoint, Begin, continuous atlas travel, deliberate farm discoveries,
truthful passport progress, final brand reveal and Restart. A map jump must not
record a discovery. Check reduced motion, ingredient links, FAQ disclosures
and a complete sourcing-brief download. The journey hooks are
`window.__KOS_JOURNEY` (camera/playback) and `window.__KOS_ODYSSEY` (visitor
state); their `getState()` methods support browser verification. The page's ingredient copy is available in
HTML without JavaScript.

## Artwork and inquiries

The opening contains artistic 3D models: a particle galaxy, Earth with locally
drawn geographic textures, Korean terrain, farm rows, moving tea leaves, fruit
trees and a root lifted from soil. They are not a geographic reconstruction of
specific farms. Ingredient section images are generated artwork. Neither the
models nor the images document suppliers, inventory or certification. Verify
product origin, organic status and commercial terms against actual documentation.

The public site is configured at https://yoohanko89.github.io/websitetest/.
The contact address is still undecided: `site-config.json` keeps `inquiryEmail`
as `null`. Until a real contact address is configured, the inquiry form
downloads a local text brief; it does not pretend to submit or store an inquiry.
With a contact address, it opens the visitor's email application. It still does
not provide a backend submission service.

## Configure a real production domain later

Inspect the current configuration without changing files:

```sh
python scripts/configure-site.py --check
python scripts/configure-site.py --help
```

Once the production HTTPS URL is confirmed, set `KOS_SITE_URL` to that actual
URL, then run:

```sh
python scripts/configure-site.py --site-url "$KOS_SITE_URL"
```

Optionally pass `--inquiry-email "$KOS_INQUIRY_EMAIL"` with a verified business
contact address. Omitting it preserves the existing contact configuration.
The script preserves other JSON settings and sets the canonical URL, Open Graph
page and image URLs, a homepage-only `sitemap.xml`, and its `robots.txt` entry.
Section anchors are not separate pages. `--root PATH` supports a copied checkout.

Deploy the resulting static files and check the public URLs separately. Local
configuration does not establish publication, indexing or search rankings.

## Export a file you can open directly

The optional exporter creates a self-contained 3D preview and a static deployment
ZIP outside this checkout. The preview embeds the application, imagery, geographic
data, site configuration and dependency license notices; it can be opened directly
from your downloads folder. It does not create a public URL.

With an installed esbuild executable available, run:

```sh
python scripts/export-preview.py \
  --esbuild /tmp/kos-3d-build/node_modules/.bin/esbuild \
  --output /tmp/kos-3d-preview.html \
  --zip-output /tmp/kos-website.zip
```

Use your own esbuild path on another machine. The export tool needs esbuild only
to bundle the preview; the ordinary website runs using the vendored browser
modules with no build. Unzip the deployment package and serve its root directory
with the development command above, or upload it to a static website host.
Open `kos-3d-preview.html` to view the complete single-file preview. A browser with
WebGL support is required for the 3D journey.
