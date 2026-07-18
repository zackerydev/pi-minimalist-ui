# Changelog

All notable changes to this project are documented here.

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

[0.1.1]: https://github.com/zackerydev/pi-minimalist-ui/releases/tag/v0.1.1
[0.1.0]: https://www.npmjs.com/package/pi-minimalist-ui/v/0.1.0
