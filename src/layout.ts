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
	if (visibleWidth(inner) > innerWidth) inner = truncateToWidth(inner, innerWidth, "…");
	inner += " ".repeat(Math.max(0, innerWidth - visibleWidth(inner)));
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
	if (visibleWidth(right) > innerWidth) right = truncateToWidth(right, innerWidth, "…");

	const leftWidth = innerWidth - visibleWidth(right);
	let left = leftLabel && width >= 8 ? ` ${leftLabel} ` : "";
	if (visibleWidth(left) > leftWidth) left = truncateToWidth(left, leftWidth, "…");

	const fillWidth = innerWidth - visibleWidth(left) - visibleWidth(right);
	return border("┌") + left + border("─".repeat(fillWidth)) + right + border("┐");
}

export function addBottomLabel(width: number, label: string, border: (text: string) => string): string {
	if (width <= 0) return "";
	if (width === 1) return border("└");

	const innerWidth = width - 2;
	let right = label && width >= 8 ? ` ${label} ` : "";
	if (visibleWidth(right) > innerWidth) right = truncateToWidth(right, innerWidth, "…");
	const fillWidth = innerWidth - visibleWidth(right);
	return border("└") + border("─".repeat(fillWidth)) + right + border("┘");
}
