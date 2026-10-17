import {
	type ExtensionAPI,
	initTheme,
	ToolExecutionComponent,
	type ToolRendererResolver,
} from "@earendil-works/pi-coding-agent";
import { getCapabilities, setCapabilities, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, test, vi } from "vitest";

import { registerCompactMcpRenderers, removeToolSpacing } from "./tools.js";

initTheme("dark");

function createResolver(): ToolRendererResolver {
	let resolver: ToolRendererResolver | undefined;
	registerCompactMcpRenderers({
		registerToolRenderer: (value: ToolRendererResolver) => {
			resolver = value;
		},
	} as ExtensionAPI);
	if (!resolver) throw new Error("No MCP renderer registered");
	return resolver;
}

function createRow(name: string, args: unknown): ToolExecutionComponent {
	const renderers = createResolver()(name, () => undefined);
	expect(renderers?.renderShell).toBe("self");
	return new ToolExecutionComponent(
		name,
		"mcp-1",
		args,
		{},
		renderers,
		{ requestRender: vi.fn() } as unknown as TUI,
		"/tmp/example",
	);
}

function plain(text: string): string {
	return text
		.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n");
}

const cases = [
	["mcp__playwright__browser_navigate", { url: "https://example.com" }, "playwright.browser_navigate"],
	["mcp__playwright__browser_click", { ref: "e42", element: "Submit" }, "playwright.browser_click"],
	["codemode", { code: "const page = await mcp__playwright.browser_snapshot({});\ntext(page);" }, "codemode"],
	["tool_search", { query: "playwright browser" }, "tool_search"],
	["list_mcp_resources", {}, "list_mcp_resources"],
	["list_mcp_resource_templates", {}, "list_mcp_resource_templates"],
	["read_mcp_resource", { server: "docs", uri: "file:///README.md" }, "read_mcp_resource"],
] as const;

describe("compact MCP rendering", () => {
	test.each(cases)("renders %s without background bars, even before registration", (name, args, label) => {
		const row = createRow(name, args);
		const restore = removeToolSpacing();
		try {
			expect(plain(row.render(100)[0] ?? "")).toContain(`· ${label}`);
			row.setArgsComplete();
			row.markExecutionStarted();
			row.updateResult({ content: [{ type: "text", text: "large\nnoisy\nsnapshot" }], isError: false });
			const lines = row.render(100);
			expect(lines).toHaveLength(1);
			expect(plain(lines[0] ?? "")).toContain(`✓ ${label}`);
			expect(lines[0]).not.toMatch(/\u001b\[48[;:]/);
			expect(plain(lines.join("\n"))).not.toContain("noisy");
			for (const width of [0, 1, 8, 24]) {
				for (const line of row.render(width)) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
			}
		} finally {
			restore();
		}
	});

	test("leaves built-in and unrelated custom tool renderers alone", () => {
		const resolver = createResolver();
		const original = { renderShell: "default" as const };
		for (const name of ["read", "bash", "custom_tool"]) {
			const next = vi.fn(() => original);
			expect(resolver(name, next)).toBe(original);
			expect(next).toHaveBeenCalledOnce();
		}
	});

	test("keeps full scripts, arguments, and output available on expansion", () => {
		const args = { code: "const result = await mcp__playwright.browser_snapshot({});\ntext(result);" };
		const row = createRow("codemode", args);
		const output = "### Snapshot\nfirst\nsecond\nlast";
		row.updateResult({ content: [{ type: "text", text: output }], isError: false });
		const restore = removeToolSpacing();
		try {
			row.setExpanded(true);
			const expanded = plain(row.render(160).join("\n"));
			expect(expanded).toContain(JSON.stringify(args, null, 2));
			expect(expanded).toContain(output);
			row.setExpanded(false);
			expect(row.render(160)).toHaveLength(1);
		} finally {
			restore();
		}
	});

	test("handles partial arguments, updates, failures, and unsafe metadata", () => {
		const row = createRow("mcp__playwright__browser_navigate", undefined);
		const restore = removeToolSpacing();
		try {
			expect(plain(row.render(100).join(""))).toContain("· playwright.browser_navigate");
			row.updateArgs({ url: "https://example.com/\u001b]52;c;clipboard\u0007\n界" });
			row.updateResult({ content: [{ type: "text", text: "working" }], isError: false }, true);
			expect(plain(row.render(100).join(""))).toContain("· playwright.browser_navigate");
			row.updateResult({ content: [{ type: "text", text: "details\nNavigation failed" }], isError: true });
			const collapsed = row.render(160);
			expect(collapsed).toHaveLength(1);
			expect(plain(collapsed[0] ?? "")).toContain("✕ playwright.browser_navigate");
			expect(plain(collapsed[0] ?? "")).toContain("Navigation failed");
			expect(collapsed[0]).not.toContain("\u001b]52;");
			row.setExpanded(true);
			expect(plain(row.render(160).join("\n"))).toContain("details\nNavigation failed");
		} finally {
			restore();
		}
	});

	test("shows MCP screenshots only when expanded without changing the result", () => {
		const previousCapabilities = getCapabilities();
		setCapabilities({ hyperlinks: false, images: "iterm2", trueColor: true });
		const restore = removeToolSpacing();
		try {
			const row = createRow("mcp__playwright__browser_take_screenshot", { filename: "page.png" });
			const result = {
				content: [
					{ type: "text", text: "Screenshot saved" },
					{
						type: "image",
						mimeType: "image/png",
						data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XwMfrAAAAABJRU5ErkJggg==",
					},
				],
				isError: false,
			};
			const before = structuredClone(result);
			row.updateResult(result);
			expect(row.render(100)).toHaveLength(1);
			expect(row.render(100).join("\n")).not.toContain("1337;File=");
			row.setExpanded(true);
			expect(row.render(100).join("\n")).toContain("1337;File=");
			expect(result).toEqual(before);
		} finally {
			restore();
			setCapabilities(previousCapabilities);
		}
	});
});
