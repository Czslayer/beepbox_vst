// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

export interface DiagnosticLogEntry {
	id: number;
	timestamp: string;
	type: "crash" | "perf_audio_underrun" | "perf_audio_budget" | "perf_audio_jitter" | "perf_frame_drop" | "perf_long_task" | "warn" | "info";
	source: string;
	message: string;
	details?: any;
	stack?: string;
}

export interface DiagnosticSummary {
	totalLogs: number;
	crashes: number;
	audioUnderruns: number;
	audioBudgetWarnings: number;
	audioJitterWarnings: number;
	frameDrops: number;
	longTasks: number;
	worstAudioDurationMs: number;
	worstFrameDropMs: number;
}

export class DiagnosticsLogger {
	private static _initialized: boolean = false;
	private static _nextId: number = 1;
	private static readonly _maxLogs: number = 200;
	public static readonly logs: DiagnosticLogEntry[] = [];
	
	// Rate-limiting / deduplication counters
	private static _lastLogTimes: Record<string, number> = {};
	private static _suppressedCounts: Record<string, number> = {};
	
	// Stats
	public static worstAudioDurationMs: number = 0;
	public static worstFrameDropMs: number = 0;
	public static totalUnderruns: number = 0;
	public static totalCrashes: number = 0;
	public static totalFrameDrops: number = 0;

	public static init(): void {
		if (this._initialized || typeof window === "undefined") return;
		this._initialized = true;

		// 1. Global crash listeners
		window.addEventListener("error", (event: ErrorEvent) => {
			this.logCrash("WindowOnError", event.error || event.message, {
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno
			});
		});

		window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
			this.logCrash("UnhandledPromiseRejection", event.reason || "Promise rejected", {
				reason: event.reason
			});
		});

		// 2. Expose debug helper on window
		(window as any).beepboxDiagnostics = {
			getLogs: () => this.getLogs(),
			clearLogs: () => this.clearLogs(),
			getSummary: () => this.getSummary(),
			printSummary: () => this.printSummary(),
			exportJSON: () => this.exportJSON(),
		};

		this.logInfo("DiagnosticsLogger", "Crash and diagnostics logging initialized");
	}

	public static logCrash(source: string, error: any, context?: any): void {
		this.totalCrashes++;
		const message: string = error?.message ? error.message : String(error);
		const stack: string | undefined = error?.stack ? String(error.stack) : undefined;
		
		const entry: DiagnosticLogEntry = {
			id: this._nextId++,
			timestamp: new Date().toISOString(),
			type: "crash",
			source,
			message,
			details: context,
			stack
		};

		this._addEntry(entry);

		console.error(
			`%c[BeepBox CRASH] [${source}] ${message}`,
			"color: #ff3344; font-weight: bold; background: #220005; padding: 2px 5px; border-radius: 3px;",
			{ error, details: context, stack }
		);

		this._sendToServer(entry);
	}

	public static logAudioPerformance(durationMs: number, budgetMs: number, context?: any): void {
		if (durationMs > this.worstAudioDurationMs) {
			this.worstAudioDurationMs = durationMs;
		}

		const isUnderrun: boolean = durationMs > budgetMs;
		if (isUnderrun) this.totalUnderruns++;

		const loadPercent: number = Math.round((durationMs / budgetMs) * 100);
		const type = isUnderrun ? "perf_audio_underrun" : "perf_audio_budget";
		const source = "AudioSynth";
		const key = `audio_perf_${type}`;

		const now = performance.now();
		const lastLog = this._lastLogTimes[key] || 0;
		const suppressed = this._suppressedCounts[key] || 0;

		const entry: DiagnosticLogEntry = {
			id: this._nextId++,
			timestamp: new Date().toISOString(),
			type,
			source,
			message: isUnderrun 
				? `Audio buffer underrun: synth took ${durationMs.toFixed(1)}ms (budget: ${budgetMs.toFixed(1)}ms, ${loadPercent}% load)`
				: `Audio synthesis load high: took ${durationMs.toFixed(1)}ms (budget: ${budgetMs.toFixed(1)}ms, ${loadPercent}% load)`,
			details: {
				durationMs: Math.round(durationMs * 10) / 10,
				budgetMs: Math.round(budgetMs * 10) / 10,
				loadPercent,
				...context
			}
		};

		this._addEntry(entry);

		// Throttle console output to once every 1500ms so the user's console isn't flooded
		if (now - lastLog > 1500) {
			this._lastLogTimes[key] = now;
			const extra = suppressed > 0 ? ` (+${suppressed} similar hits throttled)` : "";
			this._suppressedCounts[key] = 0;

			if (isUnderrun) {
				console.warn(
					`%c[BeepBox PERF HIT] Audio underrun: took ${durationMs.toFixed(1)}ms for ${budgetMs.toFixed(1)}ms buffer (${loadPercent}% CPU load)${extra}`,
					"color: #ffaa00; font-weight: bold; background: #221800; padding: 2px 4px; border-radius: 3px;",
					entry.details
				);
			} else {
				console.warn(
					`[BeepBox PERF HIT] Audio load high: ${loadPercent}% (${durationMs.toFixed(1)}ms / ${budgetMs.toFixed(1)}ms)${extra}`,
					entry.details
				);
			}
		} else {
			this._suppressedCounts[key] = suppressed + 1;
		}
	}

	public static logAudioJitter(intervalMs: number, expectedIntervalMs: number): void {
		const key = "audio_jitter";
		const now = performance.now();
		const lastLog = this._lastLogTimes[key] || 0;
		const suppressed = this._suppressedCounts[key] || 0;

		const entry: DiagnosticLogEntry = {
			id: this._nextId++,
			timestamp: new Date().toISOString(),
			type: "perf_audio_jitter",
			source: "AudioContext",
			message: `Audio callback delayed: interval ${intervalMs.toFixed(1)}ms vs expected ~${expectedIntervalMs.toFixed(1)}ms`,
			details: { intervalMs: Math.round(intervalMs * 10) / 10, expectedIntervalMs: Math.round(expectedIntervalMs * 10) / 10 }
		};

		this._addEntry(entry);

		if (now - lastLog > 2000) {
			this._lastLogTimes[key] = now;
			const extra = suppressed > 0 ? ` (+${suppressed} similar delays)` : "";
			this._suppressedCounts[key] = 0;
			console.warn(`[BeepBox PERF HIT] Audio callback jitter: ${intervalMs.toFixed(1)}ms${extra}`);
		} else {
			this._suppressedCounts[key] = suppressed + 1;
		}
	}

	public static logFrameDrop(deltaMs: number): void {
		this.totalFrameDrops++;
		if (deltaMs > this.worstFrameDropMs) {
			this.worstFrameDropMs = deltaMs;
		}

		const key = "frame_drop";
		const now = performance.now();
		const lastLog = this._lastLogTimes[key] || 0;
		const suppressed = this._suppressedCounts[key] || 0;

		const fpsApprox = Math.round(1000 / deltaMs);
		const entry: DiagnosticLogEntry = {
			id: this._nextId++,
			timestamp: new Date().toISOString(),
			type: "perf_frame_drop",
			source: "RenderLoop",
			message: `UI frame drop: frame took ${deltaMs.toFixed(1)}ms (~${fpsApprox} FPS)`,
			details: { deltaMs: Math.round(deltaMs * 10) / 10, fpsApprox }
		};

		this._addEntry(entry);

		if (now - lastLog > 2500) {
			this._lastLogTimes[key] = now;
			const extra = suppressed > 0 ? ` (+${suppressed} similar frame drops)` : "";
			this._suppressedCounts[key] = 0;
			console.warn(`[BeepBox PERF HIT] UI frame stutter: ${deltaMs.toFixed(1)}ms (~${fpsApprox} FPS)${extra}`);
		} else {
			this._suppressedCounts[key] = suppressed + 1;
		}
	}

	public static logLongTask(durationMs: number, name?: string): void {
		const key = "long_task";
		const now = performance.now();
		const lastLog = this._lastLogTimes[key] || 0;

		const entry: DiagnosticLogEntry = {
			id: this._nextId++,
			timestamp: new Date().toISOString(),
			type: "perf_long_task",
			source: "MainThread",
			message: `Long task blocking main thread: ${durationMs.toFixed(1)}ms`,
			details: { durationMs: Math.round(durationMs * 10) / 10, name }
		};

		this._addEntry(entry);

		if (now - lastLog > 3000) {
			this._lastLogTimes[key] = now;
			console.warn(`[BeepBox PERF HIT] Main thread frozen for ${durationMs.toFixed(1)}ms (${name || "task"})`);
		}
	}

	public static logWarn(source: string, message: string, details?: any): void {
		const entry: DiagnosticLogEntry = {
			id: this._nextId++,
			timestamp: new Date().toISOString(),
			type: "warn",
			source,
			message,
			details
		};
		this._addEntry(entry);
		console.warn(`[BeepBox WARN] [${source}] ${message}`, details);
	}

	public static logInfo(source: string, message: string, details?: any): void {
		const entry: DiagnosticLogEntry = {
			id: this._nextId++,
			timestamp: new Date().toISOString(),
			type: "info",
			source,
			message,
			details
		};
		this._addEntry(entry);
	}

	private static _addEntry(entry: DiagnosticLogEntry): void {
		this.logs.push(entry);
		if (this.logs.length > this._maxLogs) {
			this.logs.shift();
		}
	}

	private static _sendToServer(entry: DiagnosticLogEntry): void {
		if (typeof window === "undefined" || !window.fetch) return;
		try {
			window.fetch("/api/client-log", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(entry),
				keepalive: true
			}).catch(() => {
				// Server may not be running or network unavailable, silent failure
			});
		} catch (_) {
			// Ignore network failure
		}
	}

	public static getLogs(): DiagnosticLogEntry[] {
		return this.logs.slice();
	}

	public static clearLogs(): void {
		this.logs.length = 0;
		this.totalUnderruns = 0;
		this.totalCrashes = 0;
		this.totalFrameDrops = 0;
		this.worstAudioDurationMs = 0;
		this.worstFrameDropMs = 0;
		this._lastLogTimes = {};
		this._suppressedCounts = {};
	}

	public static getSummary(): DiagnosticSummary {
		let crashes = 0;
		let underruns = 0;
		let budgetWarnings = 0;
		let jitter = 0;
		let frameDrops = 0;
		let longTasks = 0;

		for (const log of this.logs) {
			switch (log.type) {
				case "crash": crashes++; break;
				case "perf_audio_underrun": underruns++; break;
				case "perf_audio_budget": budgetWarnings++; break;
				case "perf_audio_jitter": jitter++; break;
				case "perf_frame_drop": frameDrops++; break;
				case "perf_long_task": longTasks++; break;
			}
		}

		return {
			totalLogs: this.logs.length,
			crashes,
			audioUnderruns: underruns,
			audioBudgetWarnings: budgetWarnings,
			audioJitterWarnings: jitter,
			frameDrops,
			longTasks,
			worstAudioDurationMs: Math.round(this.worstAudioDurationMs * 10) / 10,
			worstFrameDropMs: Math.round(this.worstFrameDropMs * 10) / 10
		};
	}

	public static printSummary(): void {
		const summary = this.getSummary();
		console.group("=== BeepBox Performance & Crash Diagnostics ===");
		console.table(summary);
		if (this.logs.length > 0) {
			console.log("Recent log entries:", this.logs.slice(-20));
		}
		console.groupEnd();
	}

	public static exportJSON(): string {
		return JSON.stringify({
			summary: this.getSummary(),
			userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
			url: typeof window !== "undefined" ? window.location.href : "",
			logs: this.logs
		}, null, 2);
	}
}
