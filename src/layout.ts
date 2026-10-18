import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const unsafeTerminalCharacters = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

export function sanitizeTerminalText(text: string): string {
	return text.replace(unsafeTerminalCharacters, "�");
}

export function addSideBorders(line: string, width: number, border: (text: string) => string): string {
	if (width <= 0) return "";
	if (width === 1) return border("│");

	let start = line.charCodeAt(0) === 32 ? 1 : 0;
	let end = line.length;
	if (end > start && line.charCodeAt(end - 1) === 32) end--;

	const innerWidth = width - 2;
	let inner = line.slice(start, end);
	let contentWidth = visibleWidth(inner);
	// With zero editor padding, both border columns must come from trailing blanks.
	while (contentWidth > innerWidth && inner.endsWith(" ")) {
		inner = inner.slice(0, -1);
		contentWidth--;
	}
	if (contentWidth > innerWidth) {
		inner = truncateToWidth(inner, innerWidth, "…");
		contentWidth = visibleWidth(inner);
	}
	inner += " ".repeat(Math.max(0, innerWidth - contentWidth));
	return border("│") + inner + border("│");
}

export function addBorderLabels(
	width: number,
	leftLabel: string,
	rightLabel: string,
	border: (text: string) => string,
): string {
	if (width <= 0) return "";
	if (width === 1) return border("┌");

	const innerWidth = width - 2;
	let right = rightLabel && width >= 8 ? ` ${rightLabel} ` : "";
	let rightWidth = visibleWidth(right);
	if (rightWidth > innerWidth) {
		right = truncateToWidth(right, innerWidth, "…");
		rightWidth = visibleWidth(right);
	}

	const leftWidth = innerWidth - rightWidth;
	let left = leftLabel && width >= 8 ? ` ${leftLabel} ` : "";
	let labelWidth = visibleWidth(left);
	if (labelWidth > leftWidth) {
		left = truncateToWidth(left, leftWidth, "…");
		labelWidth = visibleWidth(left);
	}

	const fillWidth = innerWidth - labelWidth - rightWidth;
	return border("┌") + left + border("─".repeat(fillWidth)) + right + border("┐");
}

export function addBottomLabel(width: number, label: string, border: (text: string) => string): string {
	if (width <= 0) return "";
	if (width === 1) return border("└");

	const innerWidth = width - 2;
	let right = label && width >= 8 ? ` ${label} ` : "";
	let rightWidth = visibleWidth(right);
	if (rightWidth > innerWidth) {
		right = truncateToWidth(right, innerWidth, "…");
		rightWidth = visibleWidth(right);
	}
	const fillWidth = innerWidth - rightWidth;
	return border("└") + border("─".repeat(fillWidth)) + right + border("┘");
}
