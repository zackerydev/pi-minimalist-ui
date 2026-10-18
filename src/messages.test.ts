import {
	AssistantMessageComponent,
	initTheme,
	type Theme,
	UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, test } from "vitest";

import { compactMessages } from "./messages.js";

initTheme("dark");

const theme = {
	fg: (color: string, text: string) => (color === "dim" ? `\x1b[2m${text}\x1b[22m` : text),
} as Theme;

function plain(text: string): string {
	return text
		.replace(/\u001b\][^\u0007]*\u0007/g, "")
		.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
		.trimEnd();
}

const abortedMessage = {
	api: "anthropic-messages",
	content: [],
	model: "test-model",
	provider: "anthropic",
	role: "assistant" as const,
	stopReason: "aborted" as const,
	timestamp: 0,
	usage: {
		cacheRead: 0,
		cacheWrite: 0,
		cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
		input: 0,
		output: 0,
		totalTokens: 0,
	},
};

const toolCallMessage = {
	...abortedMessage,
	content: [
		{ thinking: "I should inspect the files.", type: "thinking" as const },
		{ arguments: { path: "src" }, id: "tool-1", name: "ls", type: "toolCall" as const },
	],
	stopReason: "toolUse" as const,
};

function clickThinking(message: AssistantMessageComponent, y = 0): void {
	message.render(80);
	expect(
		message.handleMouse({
			alt: false,
			button: "left",
			ctrl: false,
			height: 24,
			screenX: 0,
			screenY: y,
			shift: false,
			type: "click",
			width: 80,
			x: 0,
			y,
		})?.handled,
	).toBe(true);
}

describe("minimal message rendering", () => {
	test("renders user prompts as one dimmed prefixed line without a background", () => {
		const restore = compactMessages(theme);
		try {
			const message = new UserMessageComponent("ship it");
			const lines = message.render(80);

			expect(lines).toHaveLength(1);
			expect(plain(lines[0] ?? "").trim()).toBe("› ship it");
			expect(lines.join("\n")).toContain("\x1b[2m");
			expect(lines.join("\n")).not.toMatch(/\u001b\[48/);
		} finally {
			restore();
		}
	});

	test("hides thinking level status messages", () => {
		const restore = compactMessages(theme);
		try {
			expect(new Text("Thinking level: low", 0, 0).render(80)).toEqual([]);
		} finally {
			restore();
		}
	});

	test("does not leave a hidden thinking spacer between a prompt and tool calls", () => {
		const restore = compactMessages(theme);
		try {
			const message = new AssistantMessageComponent(toolCallMessage, true, undefined, "");
			expect(message.render(80)).toEqual([]);
		} finally {
			restore();
		}
	});

	test("compacts visible thinking into a brain-icon row using the opening heading", () => {
		const restore = compactMessages(theme);
		try {
			const content = [
				{ thinking: "\n**Exploring file access methods**\n\nI should inspect the files.", type: "thinking" as const },
				toolCallMessage.content[1]!,
			];
			const original = JSON.stringify(content);
			const message = new AssistantMessageComponent({ ...toolCallMessage, content });
			const lines = message.render(80);

			expect(lines.map(plain)).toEqual(["󰧑 Thinking — Exploring file access methods"]);
			expect(JSON.stringify(content)).toBe(original);
		} finally {
			restore();
		}
	});

	test("clips thinking to one terminal-safe row at narrow widths and after resizing", () => {
		const restore = compactMessages(theme);
		try {
			const message = new AssistantMessageComponent({
				...toolCallMessage,
				content: [{ thinking: "Reviewing 界面 e\u0301 " + "details ".repeat(30), type: "thinking" }],
			});
			for (const width of [80, 20, 1, 0, 12, 120]) {
				const lines = message.render(width);
				expect(lines).toHaveLength(width > 0 ? 1 : 0);
				for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
				if (width >= 12) expect(plain(lines[0] ?? "")).toMatch(/…$/);
			}
		} finally {
			restore();
		}
	});

	test("neutralizes terminal controls and bidi overrides in thinking previews", () => {
		const restore = compactMessages(theme);
		try {
			const message = new AssistantMessageComponent({
				...toolCallMessage,
				content: [{ thinking: "Checking\tfiles\x1b]52;c;clipboard\x07\u202E", type: "thinking" }],
			});
			const output = message.render(80).join("\n");
			expect(output).toContain("Checking files");
			expect(output).not.toContain("\x1b]52;");
			expect(output).not.toContain("\u202E");
		} finally {
			restore();
		}
	});

	test("updates streaming previews and leaves assistant answers visible", () => {
		const restore = compactMessages(theme);
		try {
			const message = new AssistantMessageComponent();
			message.updateContent(
				{
					...toolCallMessage,
					content: [{ thinking: "Exploring", type: "thinking" }],
				},
				true,
			);
			expect(message.render(80).map(plain)).toEqual(["󰧑 Thinking — Exploring"]);

			message.updateContent(
				{
					...toolCallMessage,
					content: [
						{ thinking: "Exploring file access methods\n\nMore detail.", type: "thinking" },
						{ text: "Here is the answer.", type: "text" },
					],
					stopReason: "stop",
				},
				false,
			);
			const output = message.render(80).map(plain).join("\n");
			expect(output).toContain("󰧑 Thinking — Exploring file access methods");
			expect(output).toContain("Here is the answer.");
			expect(output).not.toContain("More detail.");
		} finally {
			restore();
		}
	});

	test("groups adjacent thinking blocks but preserves separate runs around assistant text", () => {
		const restore = compactMessages(theme);
		try {
			const message = new AssistantMessageComponent({
				...toolCallMessage,
				content: [
					{ thinking: "", type: "thinking" },
					{ thinking: "# First heading\n\nFirst details.", type: "thinking" },
					{ thinking: "Extra adjacent details.", type: "thinking" },
					{ text: "Progress update.", type: "text" },
					{ thinking: "", type: "thinking" },
					{ thinking: "Second heading\n\nSecond details.", type: "thinking" },
				],
			});
			const lines = message.render(80).map(plain);
			expect(lines.filter((line) => line.includes("Thinking"))).toEqual([
				"󰧑 Thinking — First heading",
				"󰧑 Thinking — Second heading",
			]);
			clickThinking(
				message,
				lines.findIndex((line) => line.includes("Second heading")),
			);
			const expanded = message.render(80).map(plain).join("\n");
			expect(expanded).toContain("Second details.");
			expect(expanded).not.toContain("First details.");
		} finally {
			restore();
		}
	});

	test("expands and collapses full thinking on click, retaining expansion through updates", () => {
		const restore = compactMessages(theme);
		try {
			const content = [
				{ thinking: "Exploring file access methods\n\nFull thinking details.", type: "thinking" as const },
			];
			const message = new AssistantMessageComponent({ ...toolCallMessage, content });
			clickThinking(message);
			expect(message.render(80).map(plain).join("\n")).toContain("Full thinking details.");
			message.updateContent({ ...toolCallMessage, content }, true);
			message.invalidate();
			expect(message.render(80).map(plain).join("\n")).toContain("Full thinking details.");
			clickThinking(message);
			expect(message.render(80).map(plain)).toEqual(["󰧑 Thinking — Exploring file access methods"]);

			message.setHideThinkingBlock(true);
			message.setHiddenThinkingLabel("");
			expect(message.render(80)).toEqual([]);
			message.setHideThinkingBlock(false);
			expect(message.render(80).map(plain)).toEqual(["󰧑 Thinking — Exploring file access methods"]);
		} finally {
			restore();
		}
	});

	test("restores Pi's original thinking rendering when the extension shuts down", () => {
		const restore = compactMessages(theme);
		new AssistantMessageComponent(toolCallMessage);
		restore();
		const output = new AssistantMessageComponent(toolCallMessage).render(80).map(plain).join("\n");
		expect(output).toContain("I should inspect the files.");
		expect(output).not.toContain("󰧑 Thinking");
	});

	test("renders an aborted operation without surrounding blank rows", () => {
		const restore = compactMessages(theme);
		try {
			const message = new AssistantMessageComponent(abortedMessage);
			const lines = message.render(80);

			expect(lines).toHaveLength(1);
			expect(plain(lines[0] ?? "").trim()).toBe("Operation aborted");
		} finally {
			restore();
		}
	});
});
