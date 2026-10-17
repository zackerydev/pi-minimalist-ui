import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	type AgentToolResult,
	type EditToolDetails,
	type ExtensionAPI,
	type Theme,
	ToolExecutionComponent,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Container, Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { Static, TSchema } from "typebox";

import { sanitizeTerminalText } from "./layout.js";

interface CompactCall {
	subject: string;
	meta?: string;
}

interface CompactToolState {
	line?: SingleLine;
}

interface CompactRenderer<TParams extends TSchema, TDetails> {
	call: (args: Static<TParams>) => CompactCall;
	summary?: (result: AgentToolResult<TDetails>, args: Static<TParams>) => string | undefined;
	expanded?: (result: AgentToolResult<TDetails>, args: Static<TParams>, isError: boolean) => string;
}

type ToolFactory<TParams extends TSchema, TDetails, TState> = (
	cwd: string,
) => ToolDefinition<TParams, TDetails, TState>;

class SingleLine implements Component {
	private cachedWidth: number | undefined;
	private cachedLines: string[] = [];

	constructor(private text: string) {}

	setText(text: string): void {
		if (text === this.text) return;
		this.text = text;
		this.invalidate();
	}

	render(width: number): string[] {
		if (width !== this.cachedWidth) {
			this.cachedLines = width > 0 ? [truncateToWidth(this.text, width, "…")] : [];
			this.cachedWidth = width;
		}
		return this.cachedLines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
	}
}

function compactText(value: unknown, fallback = "…"): string {
	if (typeof value !== "string") return fallback;
	const compact = value.replace(/\s+/g, " ").trim();
	return sanitizeTerminalText(compact) || fallback;
}

function textOutput(result: AgentToolResult<unknown>): string {
	return result.content
		.flatMap((part) => (part.type === "text" ? [part.text] : []))
		.join("\n")
		.trimEnd();
}

function lineCount(text: string): number {
	if (!text) return 0;
	let count = 1;
	for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) count++;
	return count;
}

function errorSummary(result: AgentToolResult<unknown>): string | undefined {
	const lines = textOutput(result)
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	return lines.length > 0 ? compactText(lines.at(-1)) : undefined;
}

function expandedText(result: AgentToolResult<unknown>): string {
	return textOutput(result);
}

function styleOutput(text: string, theme: Theme, isError: boolean): string {
	const color = isError ? "error" : "toolOutput";
	return text
		.split("\n")
		.map((line) => theme.fg(color, line))
		.join("\n");
}

function renderLine(
	name: string,
	call: CompactCall,
	theme: Theme,
	state: { isPartial: boolean; isError: boolean },
	summary?: string,
): string {
	const status = state.isPartial
		? theme.fg("muted", "·")
		: state.isError
			? theme.fg("error", "✕")
			: theme.fg("success", "✓");
	let text = `${status} ${theme.fg("toolTitle", theme.bold(name))} ${theme.fg("accent", compactText(call.subject))}`;
	if (call.meta) text += theme.fg("muted", ` ${compactText(call.meta, "")}`);
	if (summary) text += theme.fg(state.isError ? "error" : "muted", ` — ${compactText(summary, "")}`);
	return text;
}

function compactRenderers<TParams extends TSchema, TDetails>(
	name: string,
	renderer: CompactRenderer<TParams, TDetails>,
): Required<Pick<ToolDefinition<TParams, TDetails, CompactToolState>, "renderShell" | "renderCall" | "renderResult">> {
	return {
		renderShell: "self",
		renderCall(args, theme, context) {
			const line = context.lastComponent instanceof SingleLine ? context.lastComponent : new SingleLine("");
			context.state.line = line;
			line.setText(
				renderLine(name, renderer.call(args), theme, {
					isError: context.isError,
					isPartial: context.isPartial,
				}),
			);
			return line;
		},
		renderResult(result, { expanded }, theme, context) {
			const summary = context.isError ? errorSummary(result) : renderer.summary?.(result, context.args);
			context.state.line?.setText(
				renderLine(
					name,
					renderer.call(context.args),
					theme,
					{ isError: context.isError, isPartial: context.isPartial },
					summary,
				),
			);

			if (!expanded) return new Container();
			const output = renderer.expanded?.(result, context.args, context.isError) ?? expandedText(result);
			return output ? new Text(styleOutput(output, theme, context.isError), 0, 0) : new Container();
		},
	};
}

function registerCompactTool<TParams extends TSchema, TDetails, TState>(
	pi: ExtensionAPI,
	factory: ToolFactory<TParams, TDetails, TState>,
	renderer: CompactRenderer<TParams, TDetails>,
): void {
	const original = factory(process.cwd());
	pi.registerTool<TParams, TDetails, CompactToolState>({
		...original,
		...compactRenderers(original.name, renderer),
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return factory(ctx.cwd).execute(toolCallId, params, signal, onUpdate, ctx);
		},
	});
}

const mcpHelpers = new Set([
	"codemode",
	"tool_search",
	"list_mcp_resources",
	"list_mcp_resource_templates",
	"read_mcp_resource",
]);

function argumentPreview(args: unknown): string {
	if (args && typeof args === "object") {
		const values = args as Record<string, unknown>;
		for (const key of ["url", "path", "filename", "query", "pattern", "ref", "code"]) {
			if (typeof values[key] === "string" && values[key].trim()) return values[key];
		}
	}
	return JSON.stringify(args) ?? "…";
}

export function registerCompactMcpRenderers(pi: ExtensionAPI): void {
	// Resolve by name, not the currently connected tools: resumed sessions and late
	// MCP connections need the same rendering before their tools are registered.
	pi.registerToolRenderer((name, next) => {
		if (!name.startsWith("mcp__") && !mcpHelpers.has(name)) return next();
		const label = name.startsWith("mcp__") ? name.slice(5).replace("__", ".") : name;
		return compactRenderers<TSchema, unknown>(label, {
			call: (args) => ({ subject: argumentPreview(args) }),
			expanded: (result, args) => {
				const input = JSON.stringify(args, null, 2);
				return [input, expandedText(result)].filter(Boolean).join("\n\n");
			},
		});
	});
}

export function removeToolSpacing(): () => void {
	const originalRender = ToolExecutionComponent.prototype.render;
	const compactRender = function (this: ToolExecutionComponent, width: number): string[] {
		const rendered = originalRender.call(this, width);
		const lines = rendered[0] === "" ? rendered.slice(1) : rendered;
		const { expanded } = this as unknown as { expanded: boolean };
		return expanded ? lines : lines.slice(0, 1);
	};
	ToolExecutionComponent.prototype.render = compactRender;

	return () => {
		if (ToolExecutionComponent.prototype.render === compactRender) {
			ToolExecutionComponent.prototype.render = originalRender;
		}
	};
}

function countDiff(details: EditToolDetails | undefined): string | undefined {
	if (!details?.diff) return undefined;
	let additions = 0;
	let removals = 0;
	for (const line of details.diff.split("\n")) {
		if (line.startsWith("+") && !line.startsWith("+++")) additions++;
		if (line.startsWith("-") && !line.startsWith("---")) removals++;
	}
	return `+${additions} −${removals}`;
}

export function registerCompactTools(pi: ExtensionAPI): void {
	registerCompactTool(pi, createReadToolDefinition, {
		call: (args) => {
			const start = args.offset;
			const end = start !== undefined && args.limit !== undefined ? start + args.limit - 1 : undefined;
			const range = start !== undefined ? `lines ${start}${end !== undefined ? `–${end}` : "+"}` : undefined;
			return { subject: compactText(args.path), ...(range ? { meta: range } : {}) };
		},
		summary: (result) => {
			const count = lineCount(textOutput(result));
			return count > 0 ? `${count} lines${result.details?.truncation?.truncated ? ", truncated" : ""}` : undefined;
		},
	});

	registerCompactTool(pi, createBashToolDefinition, {
		call: (args) => ({
			subject: compactText(args.command),
			...(args.timeout !== undefined ? { meta: `timeout ${args.timeout}s` } : {}),
		}),
	});

	registerCompactTool(pi, createEditToolDefinition, {
		call: (args) => ({
			subject: compactText(args.path),
			...(Array.isArray(args.edits) ? { meta: `${args.edits.length} block${args.edits.length === 1 ? "" : "s"}` } : {}),
		}),
		summary: (result) => countDiff(result.details),
		expanded: (result, _args, isError) =>
			isError ? expandedText(result) : (result.details?.diff ?? expandedText(result)),
	});

	registerCompactTool(pi, createWriteToolDefinition, {
		call: (args) => {
			const count = typeof args.content === "string" ? lineCount(args.content) : 0;
			return {
				subject: compactText(args.path),
				...(count > 0 ? { meta: `${count} line${count === 1 ? "" : "s"}` } : {}),
			};
		},
		expanded: (result, args, isError) =>
			isError ? expandedText(result) : typeof args.content === "string" ? args.content : expandedText(result),
	});

	registerCompactTool(pi, createGrepToolDefinition, {
		call: (args) => {
			const path = compactText(args.path, ".");
			const glob = args.glob ? ` ${compactText(args.glob, "")}` : "";
			return { subject: `/${compactText(args.pattern, "")}/`, meta: `in ${path}${glob}` };
		},
		summary: (result) => {
			const count = lineCount(textOutput(result));
			return count > 0 ? `${count} lines` : undefined;
		},
	});

	registerCompactTool(pi, createFindToolDefinition, {
		call: (args) => ({ subject: compactText(args.pattern), meta: `in ${compactText(args.path, ".")}` }),
		summary: (result) => {
			const count = lineCount(textOutput(result));
			return count > 0 ? `${count} files` : undefined;
		},
	});

	registerCompactTool(pi, createLsToolDefinition, {
		call: (args) => ({ subject: compactText(args.path, ".") }),
		summary: (result) => {
			const count = lineCount(textOutput(result));
			return count > 0 ? `${count} entries` : undefined;
		},
	});
}
