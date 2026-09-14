#!/usr/bin/env python3
"""Bot-block fallback for a single URL, using Scrapling's StealthyFetcher
(Camoufox — fingerprint-hardened Firefox) instead of plain Playwright
Chromium. Only invoked by crawl.js when a normal visit looks bot-blocked
(403/429/503 or a Cloudflare/PerimeterX-style challenge title) — this is
NOT the default crawl path, just the fallback for sites that reject
headless Chromium outright.

Runs the exact same in-page check JS as the Node crawl (scripts/browser/
seo-eval.js, scripts/browser/links-eval.js) via page_action, so scoring
stays identical between both paths — see seo-v2.js's computeSeoFromData().

Usage: python3 scripts/stealth_fetch.py <url> <screenshot_path>
Prints one JSON line to stdout; non-zero exit + {"error": "..."} on failure.
"""
import json
import sys
import time
from pathlib import Path

from scrapling.fetchers import StealthyFetcher

# Kept as plain JS-expression strings, read from the same files Node uses,
# so the two runtimes can never drift apart on what a check considers a pass.
BROWSER_DIR = Path(__file__).parent / "browser"


def _read_js_export(filename, export_name):
    text = (BROWSER_DIR / filename).read_text(encoding="utf-8")
    marker = f"export const {export_name} = `"
    start = text.index(marker) + len(marker)
    end = text.rindex("`")
    return text[start:end]


SEO_EVAL_JS = _read_js_export("seo-eval.js", "SEO_EVAL_JS")
LINKS_EVAL_JS = _read_js_export("links-eval.js", "LINKS_EVAL_JS")


def main():
    url, screenshot_path = sys.argv[1], sys.argv[2]
    Path(screenshot_path).parent.mkdir(parents=True, exist_ok=True)

    collected = {}

    def collect(page):
        collected["title"] = page.title()
        collected["seo"] = page.evaluate(SEO_EVAL_JS)
        collected["links"] = page.evaluate(LINKS_EVAL_JS)
        try:
            page.screenshot(path=screenshot_path, full_page=True)
            collected["screenshotPath"] = screenshot_path.replace("\\", "/")
        except Exception:
            collected["screenshotPath"] = None

    start = time.time()
    response = StealthyFetcher.fetch(
        url,
        solve_cloudflare=True,
        page_action=collect,
        timeout=25000,
        network_idle=True,
    )

    print(json.dumps({
        "statusCode": response.status,
        "title": collected.get("title", ""),
        "loadTime": round((time.time() - start) * 1000),
        "screenshotPath": collected.get("screenshotPath"),
        "seo": collected.get("seo", {}),
        "links": collected.get("links", []),
        "viaFallback": "scrapling",
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)
