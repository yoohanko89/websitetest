#!/usr/bin/env python3
"""Export the current site as an offline HTML preview and deployable ZIP.

The normal static site needs no build. This optional export uses esbuild to put
the Three.js module graph into a single file that can be opened with file://.
Neither export changes the site source or its configured production URL.
"""

import argparse
import base64
import hashlib
import html
from html.parser import HTMLParser
import json
import mimetypes
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import unquote, urlsplit
import zipfile


TAG = re.compile(r"<(?:img|source|link)\b[^>]*>", re.IGNORECASE)
ATTRIBUTE = re.compile(r"\b(src|href|srcset)\s*=\s*([\"'])(.*?)\2", re.IGNORECASE)
SCRIPT = re.compile(r"<script\b[^>]*\bsrc\s*=\s*([\"'])(.*?)\1[^>]*>\s*</script\s*>", re.IGNORECASE)
CSS_URL = re.compile(r"url\(\s*([\"']?)([^)\"']+)\1\s*\)", re.IGNORECASE)


def safe_json(value):
    # A script element is parsed as HTML even when its contents are JSON.
    return json.dumps(value, ensure_ascii=True, separators=(",", ":")).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


class OfflineResources(HTMLParser):
    """Ensure the HTML export has no file or network resource dependencies."""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        candidates = []
        if tag in {"img", "source", "script"} and attrs.get("src"):
            candidates.append(attrs["src"])
        if tag == "link" and attrs.get("href"):
            candidates.append(attrs["href"])
        for value in candidates:
            if not value.startswith("data:"):
                raise ValueError(f"Offline export retains a resource URL: {value}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help="Static site source directory")
    parser.add_argument("--esbuild", default=shutil.which("esbuild"), help="Path to an installed esbuild executable (export only)")
    parser.add_argument("--output", type=Path, default=Path("/tmp/kos-3d-preview.html"), help="Self-contained HTML output, outside the source checkout")
    parser.add_argument("--zip-output", type=Path, default=Path("/tmp/kos-website.zip"), help="Static deployment ZIP output, outside the source checkout")
    args = parser.parse_args()
    root = args.root.resolve()
    if not args.esbuild:
        parser.error("An installed esbuild executable is required; pass --esbuild PATH.")
    for output in [args.output, args.zip_output]:
        if output.resolve().is_relative_to(root):
            parser.error("Write exports outside the source checkout.")

    resources = {"index.html", "styles.css", "site-config.json", "assets/world-110m.json"}

    def local_file(reference, base=root):
        reference = html.unescape(reference.strip())
        url = urlsplit(reference)
        if url.scheme == "data":
            return None
        if url.scheme or url.netloc:
            raise ValueError(f"Offline export cannot depend on a network resource: {reference}")
        if not url.path or url.path.startswith("/"):
            raise ValueError(f"Expected a relative local resource: {reference}")
        path = (base / unquote(url.path)).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError(f"Missing or out-of-root resource: {reference}")
        resources.add(path.relative_to(root).as_posix())
        return path

    def data_url(reference, base=root):
        path = local_file(reference, base)
        if path is None:
            return reference
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"

    source = (root / "index.html").read_text(encoding="utf-8")
    original_source = source
    styles = (root / "styles.css").read_text(encoding="utf-8")
    if re.search(r"@import\b", styles, re.IGNORECASE):
        raise ValueError("Inline any CSS @import dependencies before exporting.")
    styles = CSS_URL.sub(lambda match: f'url("{data_url(match.group(2))}")', styles)

    def rewrite_tag(match):
        tag = match.group()
        if re.search(r"\brel\s*=\s*([\"'])stylesheet\1", tag, re.IGNORECASE):
            href = ATTRIBUTE.search(tag)
            if not href or href.group(3) != "styles.css":
                raise ValueError("Expected the site stylesheet to be styles.css.")
            return f"<style>{styles}</style>"

        def rewrite_attribute(attribute):
            if attribute.group(1).lower() == "srcset":
                raise ValueError("Inline srcset candidates explicitly before exporting.")
            return f'{attribute.group(1)}="{data_url(attribute.group(3))}"'

        return ATTRIBUTE.sub(rewrite_attribute, tag)

    source = TAG.sub(rewrite_tag, source)
    scripts = SCRIPT.findall(source)
    if len(scripts) != 1 or scripts[0][1] != "app.js":
        raise ValueError("Expected one external application script: app.js.")
    source = SCRIPT.sub("", source)

    with tempfile.TemporaryDirectory(prefix="kos-preview-") as scratch:
        bundle_path = Path(scratch) / "app-bundle.js"
        metadata_path = Path(scratch) / "bundle-meta.json"
        subprocess.run([
            str(args.esbuild), "app.js", "--bundle", "--format=esm", "--target=es2020",
            "--minify", "--legal-comments=inline", f"--outfile={bundle_path}",
            f"--metafile={metadata_path}",
        ], cwd=root, check=True)
        bundle = bundle_path.read_text(encoding="utf-8")
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        for name in metadata["inputs"]:
            local_file(name)

    if "assets/journey-3d.js" not in resources or "assets/vendor/three.module.js" not in resources:
        raise ValueError("The app does not yet include the actual Three.js journey; refusing an outdated export.")
    if not ("__KOS_WORLD_DATA" in bundle and "__KOS_SITE_CONFIG" in bundle):
        raise ValueError("The app must support embedded world data and site configuration for offline export.")

    world = json.loads((root / "assets/world-110m.json").read_text(encoding="utf-8"))
    config = json.loads((root / "site-config.json").read_text(encoding="utf-8"))
    license_names = ["assets/vendor/THREE-LICENSE.txt", "assets/vendor/world-atlas-LICENSE"]
    if "assets/globe-renderer.js" in resources:
        license_names += [f"assets/vendor/{name}-LICENSE" for name in ["d3-geo", "d3-array", "topojson-client", "internmap"]]
    licenses = {}
    for name in license_names:
        path = local_file(name)
        licenses[name] = path.read_text(encoding="utf-8")
    bootstrap = f"globalThis.__KOS_WORLD_DATA={safe_json(world)};globalThis.__KOS_SITE_CONFIG={safe_json(config)};"
    # Protect the HTML script boundary without changing JavaScript string values.
    bundle = re.sub(r"</script", r"<\\/script", bundle, flags=re.IGNORECASE)
    inline = f'<script id="kos-license-notices" type="application/json">{safe_json(licenses)}</script>\n<script>{bootstrap}</script>\n<script type="module">{bundle}</script>\n'
    source, count = re.subn(r"</body\s*>", lambda match: inline + match.group(), source, count=1, flags=re.IGNORECASE)
    if count != 1:
        raise ValueError("The page has no closing body tag.")
    OfflineResources().feed(source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(source, encoding="utf-8")

    # Runtime JS closure comes from esbuild; include only live assets and useful
    # deployment/editorial instructions, never Git metadata or build dependencies.
    for name in ["README.md", "robots.txt", "sitemap.xml", "scripts/configure-site.py", "scripts/export-preview.py", "assets/buyer-content.json", "assets/vendor/README.md"]:
        if (root / name).is_file():
            local_file(name)
    digests = {name: hashlib.sha256((root / name).read_bytes()).digest() for name in resources}
    args.zip_output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.zip_output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in sorted(resources):
            archive.write(root / name, arcname=name)
    with zipfile.ZipFile(args.zip_output) as archive:
        if archive.testzip() is not None:
            raise ValueError("ZIP CRC verification failed.")
        for name in resources:
            if hashlib.sha256(archive.read(name)).digest() != digests[name]:
                raise ValueError(f"ZIP content verification failed: {name}")
    if original_source != (root / "index.html").read_text(encoding="utf-8"):
        raise ValueError("The page changed during export; rerun against the final source.")
    print(json.dumps({
        "preview": str(args.output.resolve()), "preview_bytes": args.output.stat().st_size,
        "zip": str(args.zip_output.resolve()), "zip_bytes": args.zip_output.stat().st_size,
        "zip_files": sorted(resources), "crc_and_readback_verified": True,
        "html_resource_dependencies": "All images, icons, styles and application modules embedded",
    }, indent=2))


if __name__ == "__main__":
    main()
