import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, test } from "vitest";

import minimalistUi from "./index.js";
import { addBorderLabels, addBottomLabel, addSideBorders } from "./layout.js";

const border = (text: string) => `\x1b[35m${text}\x1b[39m`;
const styled = (text: string) => `\x1b[32m${text}\x1b[39m`;

function expectWidth(line: string, width: number): void {
	expect(visibleWidth(line)).toBe(width);
}

describe("minimalist UI frame rendering", () => {
	test("the extension module loads", () => {
		expect(typeof minimalistUi).toBe("function");
	});

	test("fits the crash case at terminal width 21", () => {
		expectWidth(addBorderLabels(21, styled("jesters-sports (main ✗) ⠼"), styled("✓52"), border), 21);
		expectWidth(addBottomLabel(21, styled("gpt-5.6-terra · medium"), border), 21);
	});

	test("all frame lines fit every terminal width", () => {
		for (let width = 0; width <= 120; width++) {
			expectWidth(
				addBorderLabels(
					width,
					styled("a-very-long-project-name (feature/long-branch ✗) ⠼"),
					styled("✓123 ✕45"),
					border,
				),
				width,
			);
			expectWidth(addBottomLabel(width, styled("a-very-long-model-name · xhigh"), border), width);
			expectWidth(addSideBorders(` ${styled("a long editor line that must be truncated")} `, width, border), width);
		}
	});

	test("side borders fill the requested width", () => {
		expect(visibleWidth(addSideBorders("x", 10, border))).toBe(10);
	});

	test("still marks real content overflow with an ellipsis", () => {
		const line = addSideBorders(styled("abcdefghijk"), 8, border);
		expect(line).toContain("abcde");
		expect(line).toContain("…");
		expectWidth(line, 8);
	});

	test("preserves width with graphemes and wide characters", () => {
		for (let width = 0; width <= 40; width++) {
			expectWidth(addBorderLabels(width, styled("世界 👩🏽‍💻"), styled("e\u0301"), border), width);
			expectWidth(addBottomLabel(width, styled("模型 · 高"), border), width);
			expectWidth(addSideBorders(` ${styled("こんにちは 🌍")} `, width, border), width);
		}
	});
});
