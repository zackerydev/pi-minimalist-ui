import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { truncateToWidth } from "@earendil-works/pi-tui";

import { registerCompactTools } from "../dist/tools.js";

const tools = new Map();
registerCompactTools({ registerTool: (tool) => tools.set(tool.name, tool) });
const theme = { bold: (text) => text, fg: (_color, text) => text };
const iterations = 100_000;
let checksum = 0;

function measure(render) {
	for (let index = 0; index < 5_000; index++) render();
	const samples = [];
	for (let sample = 0; sample < 5; sample++) {
		const start = performance.now();
		for (let index = 0; index < iterations; index++) checksum += render()[0].length;
		samples.push(performance.now() - start);
	}
	return samples.sort((a, b) => a - b)[2];
}

console.log(`Median of 5 samples, ${iterations.toLocaleString()} unchanged-row renders each:`);
for (const [name, command] of [
	["short", "npm test"],
	["long Unicode", "npm test -- " + "src/界-wide-path/".repeat(80)],
]) {
	const args = { command };
	const component = tools.get("bash").renderCall(args, theme, { args, isError: false, isPartial: false, state: {} });
	const previousRender = () => [truncateToWidth(`✓ bash ${command}`, 80, "…")];
	const cachedRender = () => component.render(80);
	assert.deepEqual(cachedRender(), previousRender());
	const before = measure(previousRender);
	const after = measure(cachedRender);
	console.log(`${name}: uncached ${before.toFixed(2)} ms; cached ${after.toFixed(2)} ms`);
}
console.log(`Checksum: ${checksum}`);
console.log("Isolated warm-cache layout benchmark, not end-to-end Pi performance.");
