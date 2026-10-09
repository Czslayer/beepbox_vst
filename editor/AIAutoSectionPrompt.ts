// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {Config} from "../synth/SynthConfig.js";
import {HTML} from "imperative-html/dist/esm/elements-strict.js";
import {SongDocument} from "./SongDocument.js";
import {Prompt} from "./Prompt.js";
import {SectionManager} from "./SectionManager.js";

const {button, div, label, h2, input} = HTML;

export class AIAutoSectionPrompt implements Prompt {
	private readonly _clearExistingBox: HTMLInputElement = input({
		type: "checkbox",
		checked: true,
		style: "margin-right: 6px;"
	});

	private readonly _statusDiv: HTMLDivElement = div({
		style: "margin-top: 10px; font-size: 11px; color: #88bbff; text-align: center; min-height: 1.4em;"
	});

	private readonly _cancelButton: HTMLButtonElement = button({class: "cancelButton"}, "Cancel");
	private readonly _analyzeButton: HTMLButtonElement = button({
		class: "okayButton",
		style: "width: 65%; background: linear-gradient(135deg, #4a9b81, #4a6fa5); border: none; font-weight: bold; cursor: pointer;"
	}, "✨ Auto-Section Song");

	public readonly container: HTMLDivElement = div({class: "prompt noSelection", style: "width: 310px; text-align: left;"},
		h2({style: "text-align: center; margin-bottom: 8px; color: #88bbff;"}, "✨ AI Auto-Section Song"),
		div({style: "font-size: 11px; color: #bbbbdd; margin-bottom: 10px; line-height: 1.4;"},
			"Gemini AI analyzes the entire song arrangement—pattern density, instrument drops, chord changes, and melody shifts—to automatically partition and label your song into section groups (Intro, Verse, Chorus, Bridge, Outro)."
		),
		label({style: "display: flex; align-items: center; font-size: 11px; cursor: pointer; margin-bottom: 10px;"},
			this._clearExistingBox,
			"Replace existing section groups"
		),
		this._statusDiv,
		div({style: "display: flex; flex-direction: row-reverse; justify-content: space-between; margin-top: 12px;"},
			this._analyzeButton,
			this._cancelButton,
		),
	);

	constructor(private _doc: SongDocument) {
		this._analyzeButton.addEventListener("click", this._onAnalyze);
		this._cancelButton.addEventListener("click", this._close);
		this.container.addEventListener("keydown", this._whenKeyPressed);
	}

	private _close = (): void => {
		this._doc.undo();
	}

	public cleanUp = (): void => {
		this._analyzeButton.removeEventListener("click", this._onAnalyze);
		this._cancelButton.removeEventListener("click", this._close);
		this.container.removeEventListener("keydown", this._whenKeyPressed);
	}

	private _whenKeyPressed = (event: KeyboardEvent): void => {
		if (event.keyCode === 27) { // ESC
			this._close();
		}
	}

	private _extractFullSongData(): any {
		const song = this._doc.song;
		const totalBars = song.barCount;
		const channelsData: any[] = [];

		for (let c = 0; c < song.getChannelCount(); c++) {
			const channel = song.channels[c];
			const isNoise = song.getChannelIsNoise(c);
			const barsArr: any[] = [];

			for (let b = 0; b < totalBars; b++) {
				const patternIndex = channel.bars[b];
				const pattern = song.getPattern(c, b);
				const hasNotes = pattern != null && pattern.notes.length > 0;
				let noteCount = 0;
				let samplePitches: number[] = [];

				if (pattern != null) {
					noteCount = pattern.notes.length;
					for (const n of pattern.notes) {
						for (const p of n.pitches) {
							if (samplePitches.indexOf(p) === -1) {
								samplePitches.push(p);
							}
						}
					}
				}

				barsArr.push({
					barIndex: b,
					patternIndex,
					hasNotes,
					noteCount,
					pitches: samplePitches.slice(0, 4)
				});
			}

			channelsData.push({
				channelIndex: c,
				name: channel.name || (isNoise ? `Drums ${c + 1}` : `Channel ${c + 1}`),
				isNoise,
				bars: barsArr
			});
		}

		return {
			totalBars,
			scale: Config.scales[song.scale].name,
			key: Config.keys[song.key].name,
			tempo: song.tempo,
			beatsPerBar: song.beatsPerBar,
			movements: SectionManager.getMovements(),
			channels: channelsData
		};
	}

	private _onAnalyze = async (): Promise<void> => {
		this._analyzeButton.disabled = true;
		this._cancelButton.disabled = true;
		this._statusDiv.textContent = "🔍 Extracting full song arrangement data...";

		try {
			const songData = this._extractFullSongData();
			this._statusDiv.textContent = "🧠 Gemini AI is analyzing song energy & sections...";

			const response = await fetch("/api/auto-section-song", {
				method: "POST",
				headers: {"Content-Type": "application/json"},
				body: JSON.stringify(songData)
			});

			if (!response.ok) {
				const errJson = await response.json().catch(() => ({}));
				throw new Error(errJson.error || "Failed to auto-section song");
			}

			const result = await response.json();
			if (!result.success || !result.data) {
				throw new Error(result.error || "Invalid response from AI server");
			}

			this._statusDiv.textContent = "✨ Applying AI-detected section groups...";
			this._applySections(result.data);

		} catch (err: any) {
			console.error("AI Auto-Section Error:", err);
			this._statusDiv.style.color = "#ff8888";
			this._statusDiv.textContent = `❌ Error: ${err.message || "Auto-sectioning failed"}`;
			this._analyzeButton.disabled = false;
			this._cancelButton.disabled = false;
		}
	}

	private _applySections(aiData: any): void {
		if (this._clearExistingBox.checked) {
			SectionManager.clearSections();
		}

		if (aiData.sections && Array.isArray(aiData.sections)) {
			for (const sec of aiData.sections) {
				if (typeof sec.startBar === "number" && typeof sec.endBar === "number" && sec.name) {
					const sBar = Math.max(0, Math.min(this._doc.song.barCount - 1, sec.startBar));
					const eBar = Math.max(sBar, Math.min(this._doc.song.barCount - 1, sec.endBar));
					const level = typeof sec.level === "number" ? Math.max(1, Math.min(3, sec.level)) : 1;
					SectionManager.addSection(sBar, eBar, String(sec.name).trim(), level);
				}
			}
		}

		this._doc.prompt = null;
		this._doc.notifier.changed();
	}
}
