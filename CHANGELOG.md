# Changelog

All notable changes to this project are documented here.

## [0.1.2] - 2026-10-16

### Fixed

- Render MCP calls, `codemode`, and MCP discovery/resource tools as single-line summaries instead of clipped, empty background bars. Expanded mode retains full arguments, output, and inline images, including for resumed sessions before MCP tools connect.

### Changed

- Coalesce tool-completion Git scans with a 250 ms debounce, flush at run completion, and cancel pending refreshes on shutdown.
- Cache unchanged single-line tool layouts and reduce redundant width measurements and line-count allocations.
- Add Git scheduling and render-cache regression tests and a reproducible layout microbenchmark (`npm run bench`).
- Update development dependencies and tool-rendering test fixtures for Pi 1.3.0.
- Validate compatibility with Pi 1.3.0; the compatibility update itself required no runtime changes.

## [0.1.1] - 2026-07-18

### Added

- Tightly stacked, single-line rendering for Pi's built-in tools, with full output and images retained in expanded mode.
- Dimmed, background-free user prompts and compact abort notices.
- Removed hidden-thinking gaps between prompts and tool calls.
- Clear the terminal viewport when Pi starts so shell output does not remain above the UI.
- Suppress transient thinking-level notices while retaining the level in the editor frame.

## [0.1.0] - 2026-07-16

### Added

- Minimal editor frame with project, Git, tool, model, and thinking status.
- ANSI-aware rendering for narrow and full-width terminals.
- Focused regression coverage for editor framing, Git failures, lifecycle cleanup, and unsafe terminal metadata.
- Automated formatting, type checking, tests, builds, and package validation.

[0.1.2]: https://github.com/zackerydev/pi-minimalist-ui/releases/tag/v0.1.2
[0.1.1]: https://github.com/zackerydev/pi-minimalist-ui/releases/tag/v0.1.1
[0.1.0]: https://www.npmjs.com/package/pi-minimalist-ui/v/0.1.0
