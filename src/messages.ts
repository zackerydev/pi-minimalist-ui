import { AssistantMessageComponent, type Theme, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

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

interface AssistantMessageState {
	hiddenThinkingLabel: string;
	hideThinkingBlock: boolean;
	lastMessage?: {
		content: Array<{ thinking?: string; text?: string; type: string }>;
		errorMessage?: string;
		stopReason: string;
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

	const originalAssistantRender = AssistantMessageComponent.prototype.render;
	const compactAssistantRender = function (this: AssistantMessageComponent, width: number): string[] {
		const { hiddenThinkingLabel, hideThinkingBlock, lastMessage } = this as unknown as AssistantMessageState;
		const hasToolCalls = lastMessage?.content.some((part) => part.type === "toolCall") ?? false;
		const hasThinking = lastMessage?.content.some((part) => part.type === "thinking" && part.thinking?.trim()) ?? false;
		const hasText = lastMessage?.content.some((part) => part.type === "text" && part.text?.trim()) ?? false;
		if (hasToolCalls && hasThinking && !hasText && hideThinkingBlock && !hiddenThinkingLabel) return [];
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
		if (AssistantMessageComponent.prototype.render === compactAssistantRender) {
			AssistantMessageComponent.prototype.render = originalAssistantRender;
		}
	};
}
