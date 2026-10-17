import { basename } from "node:path";

import { CustomEditor, type ExtensionAPI, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component, type EditorTheme, type TUI } from "@earendil-works/pi-tui";

import { addBorderLabels, addBottomLabel, addSideBorders, sanitizeTerminalText } from "./layout.js";
import { compactMessages } from "./messages.js";
import { registerCompactMcpRenderers, registerCompactTools, removeToolSpacing } from "./tools.js";

class EmptyFooter implements Component {
	render(): string[] {
		return [];
	}

	invalidate(): void {}
}

function isHorizontalBorder(line: string): boolean {
	const plain = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
	return /^─+$/.test(plain) || /^─── [↑↓] \d+ more ─*$/.test(plain);
}

export default function minimalistUi(pi: ExtensionAPI) {
	registerCompactTools(pi);
	registerCompactMcpRenderers(pi);
	const restoreToolSpacing = removeToolSpacing();

	let tui: TUI | undefined;
	let restoreMessages: (() => void) | undefined;
	let succeeded = 0;
	let failed = 0;
	let branch: string | undefined;
	let dirty: boolean | undefined;
	let refreshingGit = false;
	let refreshPending = false;
	let pendingCwd: string | undefined;
	let gitAbortController: AbortController | undefined;
	let gitRefreshTimer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;
	let clearTerminalOnEditorMount = false;
	let working = false;
	let spinnerFrame = 0;
	let spinnerTimer: ReturnType<typeof setInterval> | undefined;
	const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

	const startSpinner = () => {
		working = true;
		spinnerFrame = 0;
		if (spinnerTimer) clearInterval(spinnerTimer);
		spinnerTimer = setInterval(() => {
			spinnerFrame = (spinnerFrame + 1) % spinnerFrames.length;
			tui?.requestRender();
		}, 80);
		tui?.requestRender();
	};

	const stopSpinner = () => {
		working = false;
		if (spinnerTimer) clearInterval(spinnerTimer);
		spinnerTimer = undefined;
		tui?.requestRender();
	};

	const readGitState = async (cwd: string, signal: AbortSignal) => {
		const branchResult = await pi
			.exec("git", ["branch", "--show-current"], { cwd, signal, timeout: 2_000 })
			.catch(() => undefined);
		if (signal.aborted) return;
		branch = branchResult?.code === 0 && !branchResult.killed ? branchResult.stdout.trim() || undefined : undefined;
		if (!branch) {
			dirty = undefined;
			return;
		}
		const statusResult = await pi
			.exec("git", ["--no-optional-locks", "status", "--porcelain"], { cwd, signal, timeout: 2_000 })
			.catch(() => undefined);
		if (signal.aborted) return;
		dirty = statusResult?.code === 0 && !statusResult.killed ? Boolean(statusResult.stdout.trim()) : undefined;
	};

	const refreshGit = async (cwd: string) => {
		if (stopped) return;
		pendingCwd = cwd;
		if (refreshingGit) {
			refreshPending = true;
			return;
		}
		refreshingGit = true;
		const controller = new AbortController();
		gitAbortController = controller;
		try {
			do {
				refreshPending = false;
				await readGitState(pendingCwd, controller.signal);
			} while (refreshPending && !controller.signal.aborted);
		} finally {
			refreshingGit = false;
			if (gitAbortController === controller) gitAbortController = undefined;
			tui?.requestRender();
		}
	};

	const cancelScheduledGitRefresh = () => {
		if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
		gitRefreshTimer = undefined;
	};

	const scheduleGitRefresh = (cwd: string) => {
		if (stopped) return;
		cancelScheduledGitRefresh();
		gitRefreshTimer = setTimeout(() => {
			gitRefreshTimer = undefined;
			void refreshGit(cwd);
		}, 250);
	};

	pi.on("agent_start", (_event, ctx) => {
		ctx.ui.setWorkingVisible(false);
		succeeded = 0;
		failed = 0;
		startSpinner();
		void refreshGit(ctx.cwd);
	});

	pi.on("tool_execution_end", (event, ctx) => {
		if (event.isError) failed++;
		else succeeded++;
		tui?.requestRender();
		scheduleGitRefresh(ctx.cwd);
	});

	pi.on("agent_end", (_event, ctx) => {
		stopSpinner();
		cancelScheduledGitRefresh();
		void refreshGit(ctx.cwd);
	});

	pi.on("message_start", (_event, ctx) => {
		ctx.ui.setWorkingVisible(false);
	});

	pi.on("session_start", (event, ctx) => {
		stopped = false;
		clearTerminalOnEditorMount = event.reason === "startup";
		restoreMessages?.();
		restoreMessages = compactMessages(ctx.ui.theme);
		ctx.ui.setFooter(() => new EmptyFooter());
		ctx.ui.setHiddenThinkingLabel("");
		ctx.ui.setWorkingVisible(false);
		void refreshGit(ctx.cwd);

		class SimpleEditor extends CustomEditor {
			constructor(instance: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
				super(instance, theme, keybindings, { paddingX: 2 });
				tui = instance;
				if (clearTerminalOnEditorMount) {
					clearTerminalOnEditorMount = false;
					instance.terminal.clearScreen();
					instance.requestRender(true);
				}
			}

			override render(width: number): string[] {
				const lines = super.render(width);
				const borderIndices: number[] = [];
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					if (line !== undefined && isHorizontalBorder(line)) borderIndices.push(i);
				}
				const top = borderIndices.at(0);
				const bottom = borderIndices.at(-1);
				if (top === undefined || bottom === undefined) return lines;
				const counts = [
					succeeded > 0 ? ctx.ui.theme.fg("success", `✓${succeeded}`) : "",
					failed > 0 ? ctx.ui.theme.fg("error", `✕${failed}`) : "",
				]
					.filter(Boolean)
					.join(" ");
				const directory = ctx.ui.theme.fg("success", sanitizeTerminalText(basename(ctx.cwd)));
				const safeBranch = branch ? sanitizeTerminalText(branch) : undefined;
				const gitStateIcon =
					dirty === undefined ? "" : ` ${ctx.ui.theme.fg(dirty ? "error" : "success", dirty ? "✗" : "✓")}`;
				const projectStatus = safeBranch
					? `${directory} (${ctx.ui.theme.fg("accent", safeBranch)}${gitStateIcon})`
					: directory;
				const projectStatusWithSpinner = working
					? `${projectStatus} ${ctx.ui.theme.fg("accent", spinnerFrames[spinnerFrame] ?? "")}`
					: projectStatus;

				lines[top] = addBorderLabels(width, projectStatusWithSpinner, counts, (text) => this.borderColor(text));
				for (let i = top + 1; i < bottom; i++) {
					const line = lines[i];
					if (line !== undefined) lines[i] = addSideBorders(line, width, (text) => this.borderColor(text));
				}
				const status = truncateToWidth(
					`${sanitizeTerminalText(ctx.model?.id ?? "no model")} · ${pi.getThinkingLevel()}`,
					Math.max(0, width - 4),
					"…",
				);
				lines[bottom] = addBottomLabel(width, ctx.ui.theme.fg("muted", status), (text) => this.borderColor(text));
				return lines;
			}
		}

		ctx.ui.setEditorComponent((instance, theme, keybindings) => new SimpleEditor(instance, theme, keybindings));
	});

	pi.on("session_shutdown", () => {
		stopped = true;
		cancelScheduledGitRefresh();
		restoreMessages?.();
		restoreMessages = undefined;
		restoreToolSpacing();
		gitAbortController?.abort();
		gitAbortController = undefined;
		stopSpinner();
		tui = undefined;
	});
}
