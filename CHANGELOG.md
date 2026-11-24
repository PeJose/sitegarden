# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.4] - 2026-11-24

### Added
- This changelog.
- GitHub releases: a tagged release with these notes is created when a new version lands on main.
- The PR check now fails when `CHANGELOG.md` has no entry for the new version.

## [0.1.3] - 2026-11-24

### Changed
- Archived the client-perf-pass OpenSpec change and added the map-performance spec.
- Logged the decisions for the two perf experiments that were tried and reverted (zoom-stepped labels, lazy chunks).

## [0.1.2] - 2026-11-24

### Changed
- Moved the app from `web/` to the repository root and fixed paths.
- Removed the design board copies from the repo.
- Ignore local `.claude` tooling.

### Removed
- The `web/` version fallback in CI.

## [0.1.1] - 2026-11-24

### Added
- Project README and a security policy.

### Changed
- Moved planning docs and design boards under `docs/`.

## [0.1.0] - 2026-11-24

### Added
- `pnpm perf`: a repeatable measurement script with scenarios, screenshot diffs and a recorded baseline in `perf/`.

### Changed
- Map client performance pass (client-perf-pass): idle GPU use dropped from about 22% to about 8-10%.
- Animations run on their own compositor layers, and the marching dashes, down pulse and lantern are stepped at 12-15 frames per second.
- Pan and zoom move the map imperatively, with no React render per frame.
- Tiles decode asynchronously and the first fly-to is smooth.
- The paper texture is viewport-sized and served as WebP.
- Animations pause in hidden tabs and stay off with reduced motion.

### Removed
- Star twinkle and campfire animations.

## [0.0.1] - 2026-11-24

### Added
- Initial import: docs, design boards and the visual map proof of concept.
- OpenSpec setup and the client-perf-pass proposal.
- Pull request checks: lint, tests, build and a required version bump.
