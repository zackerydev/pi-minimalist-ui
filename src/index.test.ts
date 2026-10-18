import type { CustomEditor, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, type EditorComponent, type EditorTheme, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, test, vi } from "vitest";

import minimalistUi from "./index.js";

type EventHandler = (event: unknown, context: ExtensionContext) => unknown;
const execResult = (code: number, stdout = "", stderr = "") => ({ code, killed: false, stderr, stdout });

interface EditorHarness {
	clearScreen: ReturnType<typeof vi.fn>;
	context: ExtensionContext;
	editor: CustomEditor;
	exec: ReturnType<typeof vi.fn>;
	handlers: Map<string, EventHandler>;
}

function createEditor(
	execImplementation: () => Promise<ReturnType<typeof execResult>> = async () => execResult(1),
	contextValues: { cwd?: string; modelId?: string } = {},
	sessionReason: "startup" | "reload" = "startup",
): EditorHarness {
	const handlers = new Map<string, EventHandler>();
	let editorFactory: ((tui: TUI, theme: EditorTheme, keybindings: never) => EditorComponent) | undefined;
	const theme = {
		borderColor: (text: string) => `\x1b[35m${text}\x1b[39m`,
		selectList: {},
	} as EditorTheme;
	const ui = {
		theme: {
			fg: (_color: string, text: string) => text,
		},
		setEditorComponent: (factory: typeof editorFactory) => {
			editorFactory = factory;
		},
		setFooter: vi.fn(),
		setHiddenThinkingLabel: vi.fn(),
		setWorkingVisible: vi.fn(),
	} as unknown as ExtensionContext["ui"];
	const context = {
		cwd: contextValues.cwd ?? "/tmp/example",
		model: { id: contextValues.modelId ?? "test-model" },
		ui,
	} as ExtensionContext;
	const exec = vi.fn(execImplementation);
	const pi = {
		exec,
		getThinkingLevel: () => "off",
		on: (event: string, handler: EventHandler) => handlers.set(event, handler),
		registerTool: vi.fn(),
		registerToolRenderer: vi.fn(),
	} as unknown as ExtensionAPI;

	minimalistUi(pi);
	handlers.get("session_start")?.({ type: "session_start", reason: sessionReason }, context);
	if (!editorFactory) throw new Error("The extension did not register an editor");

	const clearScreen = vi.fn();
	const tui = {
		requestRender: vi.fn(),
		terminal: { clearScreen, rows: 24 },
	} as unknown as TUI;
	const keybindings = { matches: () => false } as never;
	return {
		clearScreen,
		context,
		editor: editorFactory(tui, theme, keybindings) as CustomEditor,
		exec,
		handlers,
	};
}

describe("minimalist editor", () => {
	test("clears the terminal only when mounting at startup", () => {
		const startup = createEditor();
		const reload = createEditor(undefined, {}, "reload");

		expect(startup.clearScreen).toHaveBeenCalledOnce();
		expect(reload.clearScreen).not.toHaveBeenCalled();
	});

	test("does not overwrite process-wide UI configuration", () => {
		const key = "PI_SIMPLE_UI_HIDE_TOOLS";
		const original = process.env[key];
		process.env[key] = "original";
		const handlers = new Map<string, EventHandler>();
		const pi = {
			on: (event: string, handler: EventHandler) => handlers.set(event, handler),
			registerTool: vi.fn(),
			registerToolRenderer: vi.fn(),
		} as unknown as ExtensionAPI;

		try {
			minimalistUi(pi);
			expect(process.env[key]).toBe("original");
			handlers.get("session_shutdown")?.({}, {} as ExtensionContext);
			expect(process.env[key]).toBe("original");
		} finally {
			if (original === undefined) delete process.env[key];
			else process.env[key] = original;
		}
	});

	test.each([false, true])("does not mark empty or short zero-padding input as truncated (focused: %s)", (focused) => {
		const { context, editor, handlers } = createEditor();
		try {
			editor.focused = focused;
			// Pi applies its editorPaddingX setting after mounting a custom editor.
			editor.setPaddingX(0);
			for (const text of ["", "hello"]) {
				editor.setText(text);
				for (const width of [12, 80, 20]) {
					const rows = editor.render(width).slice(1, -1);
					const output = rows.join("\n");
					expect(output).not.toContain("…");
					if (text) expect(output).toContain(text);
					if (focused) expect(output).toContain(CURSOR_MARKER);
					for (const row of rows) expect(visibleWidth(row)).toBe(width);
				}
			}
		} finally {
			handlers.get("session_shutdown")?.({}, context);
		}
	});

	test("preserves input and the cursor at an exact wrap boundary", () => {
		const { editor } = createEditor();
		editor.focused = true;
		editor.setText("q".repeat(18));

		const lines = editor.render(20);
		const output = lines.join("\n");

		expect(output.match(/q/g)).toHaveLength(18);
		expect(output).toContain(CURSOR_MARKER);
		for (const line of lines) expect(visibleWidth(line)).toBe(20);
	});

	test("keeps focused content distinct from borders at narrow widths", () => {
		for (let width = 1; width <= 20; width++) {
			const { editor } = createEditor();
			editor.focused = true;
			editor.setText("q");
			const lines = editor.render(width);
			const output = lines.join("\n");

			if (width >= 4) {
				expect(output.match(/q/g)).toHaveLength(1);
				expect(output).toContain(CURSOR_MARKER);
			}
			for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
		}
	});

	test("does not describe an unavailable Git status as clean", async () => {
		const responses = [execResult(0, "main\n"), execResult(1, "", "not a work tree")];
		const { editor, exec } = createEditor(async () => {
			const response = responses.shift();
			if (!response) throw new Error("Unexpected Git call");
			return response;
		});

		await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(2));
		const output = editor.render(40).join("\n");

		expect(output).toContain("main");
		expect(output).not.toContain("main ✓");
		expect(output).not.toContain("main ✗");
	});

	test("reads Git state from the active extension context", async () => {
		const { exec } = createEditor();

		await vi.waitFor(() => expect(exec).toHaveBeenCalled());

		expect(exec.mock.calls[0]?.[2]).toMatchObject({ cwd: "/tmp/example" });
	});

	test("neutralizes terminal controls in displayed metadata", () => {
		const { editor } = createEditor(undefined, {
			cwd: "/tmp/project\nname\x1b]52;c;clipboard\x07",
			modelId: "model\u202Etxt",
		});

		const output = editor.render(100).join("\n");

		expect(output).not.toContain("project\nname");
		expect(output).not.toContain("\x1b]52;c;clipboard\x07");
		expect(output).not.toContain("\u202E");
	});

	test("refreshes once more when Git state changes during a scan", async () => {
		let releaseBranch: ((result: ReturnType<typeof execResult>) => void) | undefined;
		const firstBranch = new Promise<ReturnType<typeof execResult>>((resolve) => {
			releaseBranch = resolve;
		});
		let call = 0;
		const { context, exec, handlers } = createEditor(async () => {
			call++;
			if (call === 1) return firstBranch;
			if (call % 2 === 0) return execResult(0);
			return execResult(0, "main\n");
		});

		await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(1));
		handlers.get("agent_end")?.({ type: "agent_end" }, context);
		releaseBranch?.(execResult(0, "main\n"));

		await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(4));
	});

	test("coalesces tool bursts and flushes Git state at agent end", async () => {
		vi.useFakeTimers();
		try {
			const { context, exec, handlers } = createEditor(async () => execResult(0, "main\n"));
			await vi.advanceTimersByTimeAsync(0);
			expect(exec).toHaveBeenCalledTimes(2);

			for (let index = 0; index < 50; index++) {
				handlers.get("tool_execution_end")?.({ isError: false }, context);
			}
			expect(vi.getTimerCount()).toBe(1);
			await vi.advanceTimersByTimeAsync(249);
			expect(exec).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(1);
			expect(exec).toHaveBeenCalledTimes(4);

			handlers.get("tool_execution_end")?.({ isError: false }, context);
			handlers.get("agent_end")?.({ type: "agent_end" }, context);
			await vi.advanceTimersByTimeAsync(0);
			expect(exec).toHaveBeenCalledTimes(6);
			expect(vi.getTimerCount()).toBe(0);

			handlers.get("tool_execution_end")?.({ isError: false }, context);
			handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, context);
			await vi.advanceTimersByTimeAsync(1_000);
			expect(exec).toHaveBeenCalledTimes(6);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	test("cancels an in-flight Git scan during shutdown", async () => {
		const never = new Promise<ReturnType<typeof execResult>>(() => {});
		const { context, exec, handlers } = createEditor(async () => never);

		await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(1));
		const signal = exec.mock.calls[0]?.[2]?.signal as AbortSignal | undefined;
		handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, context);

		expect(signal?.aborted).toBe(true);
	});

	test("counts tool outcomes and releases the spinner timer", () => {
		vi.useFakeTimers();
		try {
			const { context, editor, handlers } = createEditor();
			handlers.get("agent_start")?.({ type: "agent_start" }, context);
			handlers.get("tool_execution_end")?.({ isError: false }, context);
			handlers.get("tool_execution_end")?.({ isError: true }, context);

			const output = editor.render(60).join("\n");
			expect(output).toContain("✓1 ✕1");
			expect(vi.getTimerCount()).toBe(2);

			handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, context);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});
