import { AssistantMessageComponent, type Theme, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Container, MouseRegion, Spacer, Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";

import { sanitizeTerminalText } from "./layout.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";
const unsafeMessageCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

interface TextState {
	text: string;
}

interface UserMessageState {
	text: string;
}

type AssistantMessage = Parameters<AssistantMessageComponent["updateContent"]>[0];

interface AssistantMessageState {
	contentContainer: Container;
	hiddenThinkingLabel: string;
	hideThinkingBlock: boolean;
	lastMessage?: AssistantMessage;
	thinkingVisibilityOverrides: Map<number, boolean>;
}

function thinkingRuns(message: AssistantMessage): string[] {
	const runs: string[] = [];
	let current: string[] = [];
	for (const part of message.content) {
		if (part.type === "thinking") {
			if (part.thinking.trim()) current.push(part.thinking.trim());
		} else if (current.length > 0) {
			runs.push(current.join("\n\n"));
			current = [];
		}
	}
	if (current.length > 0) runs.push(current.join("\n\n"));
	return runs;
}

function thinkingPreview(thinking: string, theme: Theme): Component {
	const opening = thinking.trim().split(/\r?\n/, 1)[0] ?? "";
	const summary = sanitizeTerminalText(
		opening
			.replace(/^#{1,6}\s+/, "")
			.replace(/[*_`]/g, "")
			.replace(/\s+/g, " ")
			.trim(),
	);
	return {
		render(width) {
			const label = theme.fg("thinkingText", "󰧑 Thinking");
			const text = `${label}${theme.fg("muted", ` — ${summary}`)}`;
			return width > 0 ? [truncateToWidth(text, width, "…")] : [];
		},
		invalidate() {},
	};
}

function sanitizeMessageText(text: string): string {
	return text.replace(unsafeMessageCharacters, "�");
}

function plainTerminalText(text: string): string {
	return text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function markPromptZone(lines: string[]): string[] {
	if (lines.length === 0) return lines;
	const first = lines[0];
	const last = lines.at(-1);
	if (first !== undefined) lines[0] = OSC133_ZONE_START + first;
	if (last !== undefined) lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + last;
	return lines;
}

export function compactMessages(theme: Theme): () => void {
	const originalTextRender = Text.prototype.render;
	const compactTextRender = function (this: Text, width: number): string[] {
		const { text } = this as unknown as TextState;
		if (plainTerminalText(text).startsWith("Thinking level: ")) return [];
		return originalTextRender.call(this, width);
	};
	Text.prototype.render = compactTextRender;

	const originalUserRender = UserMessageComponent.prototype.render;
	const compactUserRender = function (this: UserMessageComponent, width: number): string[] {
		const { text } = this as unknown as UserMessageState;
		const content = theme.fg("dim", `› ${sanitizeMessageText(text)}`);
		return markPromptZone(new Text(content, 0, 0).render(width));
	};
	UserMessageComponent.prototype.render = compactUserRender;

	const originalAssistantUpdate = AssistantMessageComponent.prototype.updateContent;
	const compactAssistantUpdate = function (
		this: AssistantMessageComponent,
		...args: Parameters<AssistantMessageComponent["updateContent"]>
	): void {
		originalAssistantUpdate.apply(this, args);
		const { contentContainer, hideThinkingBlock, thinkingVisibilityOverrides } =
			this as unknown as AssistantMessageState;
		if (hideThinkingBlock) return;

		const message = args[0];
		const runs = thinkingRuns(message);
		let runIndex = 0;
		for (const [childIndex, child] of contentContainer.children.entries()) {
			if (!(child instanceof MouseRegion)) continue;
			const index = runIndex++;
			const thinking = runs[index];
			if (!thinking) continue;
			// Keep Pi's per-run overrides so expansion survives streaming and invalidation.
			const expanded = thinkingVisibilityOverrides.get(index) === false;
			const content: Component = expanded
				? { render: (width) => child.render(width), invalidate: () => child.invalidate() }
				: thinkingPreview(thinking, theme);
			contentContainer.children[childIndex] = new MouseRegion(content, (event) => {
				if (event.type !== "click" || event.button !== "left") return undefined;
				thinkingVisibilityOverrides.set(index, expanded);
				this.updateContent(message);
				return { handled: true };
			});
		}
		const firstVisible = message.content.find(
			(part) => (part.type === "thinking" && part.thinking.trim()) || (part.type === "text" && part.text.trim()),
		);
		if (firstVisible?.type === "thinking" && contentContainer.children[0] instanceof Spacer) {
			contentContainer.children.shift();
		}
	};
	AssistantMessageComponent.prototype.updateContent = compactAssistantUpdate;

	const originalAssistantRender = AssistantMessageComponent.prototype.render;
	const compactAssistantRender = function (this: AssistantMessageComponent, width: number): string[] {
		const { hiddenThinkingLabel, hideThinkingBlock, lastMessage } = this as unknown as AssistantMessageState;
		const hasToolCalls = lastMessage?.content.some((part) => part.type === "toolCall") ?? false;
		const hasThinking = lastMessage?.content.some((part) => part.type === "thinking" && part.thinking?.trim()) ?? false;
		const hasText = lastMessage?.content.some((part) => part.type === "text" && part.text?.trim()) ?? false;
		if (
			hasThinking &&
			!hasText &&
			hideThinkingBlock &&
			!hiddenThinkingLabel &&
			(lastMessage?.stopReason === "stop" || lastMessage?.stopReason === "toolUse")
		)
			return [];
		if (lastMessage?.stopReason !== "aborted" || hasToolCalls) return originalAssistantRender.call(this, width);

		const message =
			lastMessage.errorMessage && lastMessage.errorMessage !== "Request was aborted"
				? lastMessage.errorMessage
				: "Operation aborted";
		return markPromptZone(new Text(theme.fg("error", sanitizeMessageText(message)), 0, 0).render(width));
	};
	AssistantMessageComponent.prototype.render = compactAssistantRender;

	return () => {
		if (Text.prototype.render === compactTextRender) {
			Text.prototype.render = originalTextRender;
		}
		if (UserMessageComponent.prototype.render === compactUserRender) {
			UserMessageComponent.prototype.render = originalUserRender;
		}
		if (AssistantMessageComponent.prototype.updateContent === compactAssistantUpdate) {
			AssistantMessageComponent.prototype.updateContent = originalAssistantUpdate;
		}
		if (AssistantMessageComponent.prototype.render === compactAssistantRender) {
			AssistantMessageComponent.prototype.render = originalAssistantRender;
		}
	};
}
