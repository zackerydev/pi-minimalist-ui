import {
	AssistantMessageComponent,
	initTheme,
	type Theme,
	UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
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
