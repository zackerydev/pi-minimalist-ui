# Pi Minimalist UI

![Pi Minimalist UI demo](https://raw.githubusercontent.com/zackerydev/pi-minimalist-ui/main/assets/demo.gif)

A visual-only plugin for `pi` that reduces noise.

A small, open-source editor UI extension for [Pi](https://github.com/earendil-works/pi). It replaces the default editor frame and footer with the project status you need, then stays out of the way.

The editor frame is inspired by [Jan-Oliver Jahner's original `simple` theme for Oh My Zsh](https://github.com/ohmyzsh/ohmyzsh/commit/210c1ef86deed805b3c5b25833d4b128f758b610).

## Features

- Clears the terminal viewport when Pi starts
- Project name, Git branch, and working-tree status inside the prompt box
- Thinking/working shows as a simple spinner
- Tightly stacked, single-line summaries for read, bash, edit, write, grep, find, and ls
- Dimmed `›` user prompts without background blocks
- Compact abort notices without surrounding blank rows
- Full tool output, diffs, and inline images remain available when expanded (`C-o`)
- Successful and failed tool counts for the current run
- Active model and thinking level in the frame without transient change notices
- ANSI-aware framing across narrow and full-width terminals
- No user configuration required and no application network requests

## Installation

Review the source, then install the latest release from npm:

```bash
pi install npm:pi-minimalist-ui
```

Pi stores npm packages in its managed package directory and registers them in Pi settings. It does not copy files into `~/.pi/agent/extensions/` or modify project source code.

To pin this release, use `pi install npm:pi-minimalist-ui@0.1.1`.

## Compatibility

- Node.js 22.19 or newer
- Pi with extension package support

The extension uses Pi's public extension APIs and declares Pi's bundled core packages as peers. Development and release checks currently run against Pi 0.80.7.

## Development

Requirements: Node.js 22.19 or newer, npm 10, and Pi.

```bash
npm ci
npm run check
pi install "$PWD"
```

Pi loads `src/index.ts` directly from the checkout. After editing, run `npm run check`, then use `/reload` in Pi. Restart Pi when testing startup or shutdown behavior.

Other useful commands:

```bash
npm run build      # create and validate dist/
npm run format     # format tracked source and documentation
pi -e .            # one-off test without changing Pi settings
pi remove "$PWD"  # remove the local package reference
```

## Structure

```text
assets/               README and gallery preview
src/index.ts          Pi extension and lifecycle handling
src/index.test.ts     editor, Git, and lifecycle regressions
src/layout.ts         terminal-safe frame helpers
src/layout.test.ts    layout width regressions
src/messages.ts       compact user and abort message rendering
src/messages.test.ts  message rendering regressions
src/tools.ts          compact built-in tool renderers
src/tools.test.ts     tool rendering regressions
dist/                 generated release output
```

## Security and privacy

Pi extensions execute with the user's permissions, so source review matters. This extension does not make network requests, collect telemetry, read credentials, or construct shell commands from user input. It runs time-limited, read-only Git branch/status queries in the active project directory and renders the results after neutralizing terminal control characters.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Contributing

Keep changes focused and the interface small. See [CONTRIBUTING.md](CONTRIBUTING.md) for the short development checklist.

## License

[MIT](LICENSE)
