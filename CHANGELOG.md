# [1.1.0](https://github.com/skquievreux/websitedoctor/compare/v1.0.2...v1.1.0) (2026-09-15)


### Bug Fixes

* **docker:** drop --break-system-packages, unsupported by this image's pip 22.0.2 ([#11](https://github.com/skquievreux/websitedoctor/issues/11)) ([ea980b5](https://github.com/skquievreux/websitedoctor/commit/ea980b5b01814a933b1b68f532e540293625aebd))
* **docker:** use scrapling install, not a raw camoufox fetch ([#12](https://github.com/skquievreux/websitedoctor/issues/12)) ([8953eb6](https://github.com/skquievreux/websitedoctor/commit/8953eb6c492b1a48d4bee5da34d6750debec37ee)), closes [hi#severity](https://github.com/hi/issues/severity)
* PDF token URL used http:// even for external https:// requests ([#7](https://github.com/skquievreux/websitedoctor/issues/7)) ([be3486a](https://github.com/skquievreux/websitedoctor/commit/be3486aacf387b82f852a31e883c8d8b68cb9442))


### Features

* build+push image to registry, pull instead of build on server ([#9](https://github.com/skquievreux/websitedoctor/issues/9)) ([af42b23](https://github.com/skquievreux/websitedoctor/commit/af42b2301e538f74a1d78f0ac101730821a09678))
* single-use token for browser-openable PDF download links ([#6](https://github.com/skquievreux/websitedoctor/issues/6)) ([35a3c1a](https://github.com/skquievreux/websitedoctor/commit/35a3c1ae5715942138fb33442a3a4131a39d2663)), closes [#live-pages](https://github.com/skquievreux/websitedoctor/issues/live-pages) [#status-box](https://github.com/skquievreux/websitedoctor/issues/status-box) [#live-pages](https://github.com/skquievreux/websitedoctor/issues/live-pages)

## [1.0.2](https://github.com/skquievreux/websitedoctor/compare/v1.0.1...v1.0.2) (2026-03-14)


### Bug Fixes

* **ci:** force Node.js 24 runtime for actions in release workflow ([7ca615c](https://github.com/skquievreux/websitedoctor/commit/7ca615c3dc716c9366385159ed5ab3fab7e6b9b8))
* replace diff modal with inline tab selectors and add diff PDF export ([b9ebb95](https://github.com/skquievreux/websitedoctor/commit/b9ebb95f7878d4b8b1cbb268aa2a3830d3ccee76))

## [1.0.1](https://github.com/skquievreux/websitedoctor/compare/v1.0.0...v1.0.1) (2026-03-14)


### Bug Fixes

* resolve CI warnings for Node.js 20 deprecation and unused url param ([4b3f074](https://github.com/skquievreux/websitedoctor/commit/4b3f074de42fd1b477b53038ebb9f5bf956cc65b))

# 1.0.0 (2026-03-14)


### Bug Fixes

* package-lock.json mit neuen devDependencies committen ([3fc9e02](https://github.com/skquievreux/websitedoctor/commit/3fc9e021c2f1606b5cbe7f20d1300b1225979a74))


### Features

* ESLint, semantic-release, Node.js 24 ([0c8d5c1](https://github.com/skquievreux/websitedoctor/commit/0c8d5c140b09afb79563f9f2e0e9b34bc81dfbb2))
* **phase5:** PDF-Export via Playwright + [@media](https://github.com/media) print CSS ([719f488](https://github.com/skquievreux/websitedoctor/commit/719f488e1b5817f79c9566bd0fa91951c601cd9a))
* README, GitHub Actions audit, Git hooks ([03137f8](https://github.com/skquievreux/websitedoctor/commit/03137f873b64c480cee7bb02937231129a5b11e9))
