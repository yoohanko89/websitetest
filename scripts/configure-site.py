#!/usr/bin/env python3
"""Inspect a static site or configure its explicitly supplied production URL."""

import argparse
import html
import ipaddress
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit
from xml.etree import ElementTree as ET


def validate_site_url(value):
    if not value or any(char.isspace() or ord(char) < 32 for char in value):
        raise ValueError("Site URL must be an HTTPS URL without whitespace.")
    parts = urlsplit(value)
    if parts.scheme != "https" or not parts.hostname:
        raise ValueError("Site URL must use HTTPS and include a hostname.")
    if parts.username is not None or parts.password is not None:
        raise ValueError("Site URL must not contain credentials.")
    if parts.query or parts.fragment or "?" in value or "#" in value:
        raise ValueError("Site URL must not contain a query or fragment.")
    # Accessing .port also rejects malformed or out-of-range ports.
    parts.port
    hostname = parts.hostname.encode("idna").decode("ascii")
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        labels = hostname.rstrip(".").split(".")
        if len(hostname) > 253 or any(
            not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label)
            for label in labels
        ):
            raise ValueError("Site URL contains an invalid hostname.")
    if "\\" in parts.netloc or "\\" in parts.path:
        raise ValueError("Site URL must not contain backslashes.")
    path = parts.path.rstrip("/") + "/"
    return urlunsplit(("https", parts.netloc, path, "", ""))


def validate_email(value):
    if len(value) > 254 or not re.fullmatch(
        r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}", value
    ):
        raise ValueError("Inquiry email must be a valid business email address.")
    return value


class HeadMetadata(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.source = source
        self.line_offsets = [0]
        self.line_offsets.extend(match.end() for match in re.finditer("\n", source))
        self.in_head = False
        self.head_end = None
        self.targets = []
        self.feed(source)

    def position(self):
        line, column = self.getpos()
        return self.line_offsets[line - 1] + column

    def handle_starttag(self, tag, attrs):
        if tag == "head":
            self.in_head = True
        if not self.in_head:
            return
        attributes = dict(attrs)
        canonical = tag == "link" and "canonical" in (attributes.get("rel") or "").lower().split()
        social = tag == "meta" and (attributes.get("property") or "").lower() in {"og:url", "og:image"}
        if canonical or social:
            start = self.position()
            end = start + len(self.get_starttag_text())
            line_start = self.source.rfind("\n", 0, start) + 1
            line_end = self.source.find("\n", end)
            if line_end == -1:
                line_end = len(self.source)
            if not self.source[line_start:start].strip() and not self.source[end:line_end].strip():
                start, end = line_start, min(line_end + 1, len(self.source))
            self.targets.append((start, end))

    def handle_endtag(self, tag):
        if tag == "head":
            self.head_end = self.position()
            self.in_head = False


def set_metadata(source, site_url, image_url):
    parsed = HeadMetadata(source)
    if parsed.head_end is None:
        raise ValueError("index.html has no closing head element.")
    for start, end in reversed(parsed.targets):
        source = source[:start] + source[end:]
    head_end = HeadMetadata(source).head_end
    url = html.escape(site_url, quote=True)
    image = html.escape(image_url, quote=True)
    metadata = (
        f'  <link rel="canonical" href="{url}">\n'
        f'  <meta property="og:url" content="{url}">\n'
        f'  <meta property="og:image" content="{image}">\n'
    )
    return source[:head_end] + metadata + source[head_end:]


def load_site(root):
    index = root / "index.html"
    config_path = root / "site-config.json"
    if not index.is_file() or not config_path.is_file():
        raise ValueError("Root must contain index.html and site-config.json.")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if not isinstance(config, dict):
        raise ValueError("site-config.json must contain a JSON object.")
    return index.read_text(encoding="utf-8"), config


def check(root, source, config):
    print(f"Static site: {root}")
    if config.get("siteUrl"):
        print(f"Production URL: {validate_site_url(config['siteUrl'])}")
    else:
        print("Production URL: unset; domain configuration is still pending.")
    if config.get("inquiryEmail"):
        validate_email(config["inquiryEmail"])
        print("Inquiry contact: configured; the form opens an email application.")
    else:
        print("Inquiry contact: unset; the form downloads a local sourcing brief.")
    parsed = HeadMetadata(source)
    if parsed.head_end is None:
        raise ValueError("index.html has no closing head element.")
    print(f"Canonical / Open Graph URL tags present: {len(parsed.targets)} of 3")
    print(f"Homepage sitemap: {'present' if (root / 'sitemap.xml').is_file() else 'absent'}")
    print("Read-only check completed. Publication and search indexing are not checked.")


def atomic_write(path, content):
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help="Static site root (default: checkout containing this script).")
    parser.add_argument("--check", action="store_true", help="Report current configuration without changing files.")
    parser.add_argument("--site-url", help="Confirmed HTTPS production base URL; no credentials, query or fragment.")
    parser.add_argument("--inquiry-email", help="Optional public business contact; omitted values are preserved.")
    args = parser.parse_args()
    if args.check and (args.site_url or args.inquiry_email):
        parser.error("--check is read-only and cannot be combined with configuration values.")
    if not args.check and not args.site_url:
        parser.error("Use --check, or supply a confirmed --site-url to change configuration.")
    try:
        root = args.root.resolve()
        source, config = load_site(root)
        if args.check:
            check(root, source, config)
            return 0
        site_url = validate_site_url(args.site_url)
        email = validate_email(args.inquiry_email) if args.inquiry_email is not None else None
        if not (root / "assets" / "fresh-yuzu.webp").is_file():
            raise ValueError("The existing assets/fresh-yuzu.webp image is required.")
        updated_html = set_metadata(source, site_url, urljoin(site_url, "assets/fresh-yuzu.webp"))
        config["siteUrl"] = site_url
        if args.inquiry_email is not None:
            config["inquiryEmail"] = email
        namespace = "http://www.sitemaps.org/schemas/sitemap/0.9"
        ET.register_namespace("", namespace)
        sitemap = ET.Element(f"{{{namespace}}}urlset")
        entry = ET.SubElement(sitemap, f"{{{namespace}}}url")
        ET.SubElement(entry, f"{{{namespace}}}loc").text = site_url
        sitemap_text = ET.tostring(sitemap, encoding="unicode", xml_declaration=True) + "\n"
        robots_path = root / "robots.txt"
        robots = robots_path.read_text(encoding="utf-8") if robots_path.exists() else "User-agent: *\nAllow: /\n"
        lines = [line for line in robots.splitlines() if not re.match(r"\s*Sitemap\s*:", line, flags=re.I)]
        robots_text = "\n".join(lines).rstrip() + f"\nSitemap: {urljoin(site_url, 'sitemap.xml')}\n"
        for path, content in (
            (root / "index.html", updated_html),
            (root / "site-config.json", json.dumps(config, ensure_ascii=False, indent=2) + "\n"),
            (root / "sitemap.xml", sitemap_text),
            (robots_path, robots_text),
        ):
            atomic_write(path, content)
        print("Configured index.html, site-config.json, sitemap.xml and robots.txt.")
        print("Deploy the static files and verify the production URLs separately.")
        return 0
    except (ValueError, OSError, TypeError) as error:
        parser.exit(1, f"Configuration error: {error}\n")


if __name__ == "__main__":
    sys.exit(main())
