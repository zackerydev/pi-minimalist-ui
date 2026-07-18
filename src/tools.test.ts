import {
	type AgentToolResult,
	type ExtensionAPI,
	initTheme,
	type Theme,
	ToolExecutionComponent,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { getCapabilities, setCapabilities, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, test, vi } from "vitest";

import { registerCompactTools, removeToolSpacing } from "./tools.js";

initTheme("dark");

type RenderContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];

const theme = {
	bold: (text: string) => text,
	fg: (_color: string, text: string) => text,
} as Theme;

function createTools(): Map<string, ToolDefinition> {
	const tools = new Map<string, ToolDefinition>();
	const pi = {
		registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool),
	} as unknown as ExtensionAPI;
	registerCompactTools(pi);
	return tools;
}

function renderContext(
	args: unknown,
	state: Record<string, unknown> = {},
	overrides: Partial<RenderContext> = {},
): RenderContext {
	return {
		args,
		argsComplete: true,
		cwd: "/tmp/example",
		executionStarted: true,
		expanded: false,
		invalidate: vi.fn(),
		isError: false,
		isPartial: true,
		lastComponent: undefined,
		showImages: true,
		state,
		toolCallId: "tool-1",
		...overrides,
	};
}

const calls: Record<string, unknown> = {
	bash: { command: "npm test" },
	edit: { edits: [{ newText: "new", oldText: "old" }], path: "src/index.ts" },
	find: { path: "src", pattern: "*.ts" },
	grep: { path: "src", pattern: "registerTool" },
	ls: { path: "src" },
	read: { path: "src/index.ts" },
	write: { content: "one\ntwo\nthree", path: "src/new.ts" },
};

describe("compact tool rendering", () => {
	test("registers every built-in with a self-rendered shell", () => {
		const tools = createTools();

		expect([...tools.keys()].sort()).toEqual(["bash", "edit", "find", "grep", "ls", "read", "write"]);
		for (const tool of tools.values()) expect(tool.renderShell).toBe("self");
	});

	test("does not leave a blank row before compact tool lines", () => {
		const tool = createTools().get("ls");
		const tui = { requestRender: vi.fn() } as unknown as TUI;
		const row = new ToolExecutionComponent("ls", "tool-1", calls.ls, {}, tool, tui, "/tmp/example");
		row.setArgsComplete();
		row.markExecutionStarted();
		row.updateResult({ content: [{ type: "text", text: "index.ts" }], isError: false }, false);

		const restore = removeToolSpacing();
		try {
			const lines = row.render(80);
			expect(lines).toHaveLength(1);
			expect(visibleWidth(lines[0] ?? "")).toBeGreaterThan(0);
		} finally {
			restore();
		}
	});

	test("hides inline image rows until the tool is expanded", () => {
		const previousCapabilities = getCapabilities();
		setCapabilities({ hyperlinks: false, images: "iterm2", trueColor: true });
		const tool = createTools().get("read");
		const tui = { requestRender: vi.fn() } as unknown as TUI;
		const row = new ToolExecutionComponent("read", "tool-1", calls.read, {}, tool, tui, "/tmp/example");
		row.setArgsComplete();
		row.markExecutionStarted();
		row.updateResult(
			{
				content: [
					{ type: "text", text: "Read image file [image/png]" },
					{
						data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XwMfrAAAAABJRU5ErkJggg==",
						mimeType: "image/png",
						type: "image",
					},
				],
				isError: false,
			},
			false,
		);

		const restore = removeToolSpacing();
		try {
			expect(row.render(80)).toHaveLength(1);
		} finally {
			restore();
			setCapabilities(previousCapabilities);
		}
	});

	test("renders every collapsed call as one bounded line", () => {
		const tools = createTools();

		for (const [name, args] of Object.entries(calls)) {
			const tool = tools.get(name);
			const component = tool?.renderCall?.(args, theme, renderContext(args));
			const lines = component?.render(24) ?? [];

			expect(lines, name).toHaveLength(1);
			expect(visibleWidth(lines[0] ?? ""), name).toBeLessThanOrEqual(24);
		}
	});

	test("summarizes a write without rendering its content", () => {
		const tool = createTools().get("write");
		const args = calls.write;
		const state = {};
		const call = tool?.renderCall?.(args, theme, renderContext(args, state));
		const result: AgentToolResult<unknown> = {
			content: [{ type: "text", text: "Successfully wrote 13 bytes to src/new.ts" }],
			details: undefined,
		};
		const collapsed = tool?.renderResult?.(
			result,
			{ expanded: false, isPartial: false },
			theme,
			renderContext(args, state, { isPartial: false }),
		);

		expect(call?.render(80)).toEqual(["✓ write src/new.ts 3 lines"]);
		expect(collapsed?.render(80)).toEqual([]);
		expect(call?.render(80).join("\n")).not.toContain("one");
	});

	test("shows full output only when expanded", () => {
		const tool = createTools().get("bash");
		const args = calls.bash;
		const result: AgentToolResult<unknown> = {
			content: [{ type: "text", text: "first\nsecond" }],
			details: undefined,
		};
		const expanded = tool?.renderResult?.(
			result,
			{ expanded: true, isPartial: false },
			theme,
			renderContext(args, {}, { expanded: true, isPartial: false }),
		);

		expect(expanded?.render(80).map((line) => line.trimEnd())).toEqual(["first", "second"]);
	});

	test("expands file content and edit diffs", () => {
		const tools = createTools();
		const writeArgs = calls.write;
		const writeResult: AgentToolResult<unknown> = {
			content: [{ type: "text", text: "Successfully wrote the file" }],
			details: undefined,
		};
		const writeOutput = tools
			.get("write")
			?.renderResult?.(
				writeResult,
				{ expanded: true, isPartial: false },
				theme,
				renderContext(writeArgs, {}, { expanded: true, isPartial: false }),
			);

		const editArgs = calls.edit;
		const editResult: AgentToolResult<unknown> = {
			content: [{ type: "text", text: "Successfully replaced one block" }],
			details: { diff: "-old\n+new", patch: "", firstChangedLine: 1 },
		};
		const editOutput = tools
			.get("edit")
			?.renderResult?.(
				editResult,
				{ expanded: true, isPartial: false },
				theme,
				renderContext(editArgs, {}, { expanded: true, isPartial: false }),
			);

		expect(writeOutput?.render(80).map((line) => line.trimEnd())).toEqual(["one", "two", "three"]);
		expect(editOutput?.render(80).map((line) => line.trimEnd())).toEqual(["-old", "+new"]);
	});

	test("keeps failures on one collapsed line", () => {
		const tool = createTools().get("bash");
		const args = calls.bash;
		const state = {};
		const call = tool?.renderCall?.(args, theme, renderContext(args, state));
		const result: AgentToolResult<unknown> = {
			content: [{ type: "text", text: "test output\n\nCommand exited with code 1" }],
			details: undefined,
		};
		tool?.renderResult?.(
			result,
			{ expanded: false, isPartial: false },
			theme,
			renderContext(args, state, { isError: true, isPartial: false }),
		);

		expect(call?.render(80)).toEqual(["✕ bash npm test — Command exited with code 1"]);
	});
});
