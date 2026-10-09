// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {Config} from "../synth/SynthConfig.js";
import {HTML} from "imperative-html/dist/esm/elements-strict.js";
import {SongDocument} from "./SongDocument.js";
import {Prompt} from "./Prompt.js";
import {SectionManager} from "./SectionManager.js";
import {Note, Pattern} from "../synth/synth.js";
import {ChangeGroup} from "./Change.js";

const {button, div, label, h2, input, select, option} = HTML;

export class AIGenerateSectionPrompt implements Prompt {
	private readonly _sectionTypeSelect: HTMLSelectElement = select({
		style: "width: 100%; margin-top: 4px; padding: 4px; font-size: 12px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
	},
		option({value: "Auto / Continuation"}, "✨ Auto Continuation / Next Section"),
		option({value: "Chorus"}, "🎵 Chorus / Main Theme"),
		option({value: "Verse 2"}, "📖 Verse 2 / Story Progression"),
		option({value: "Bridge"}, "🌁 Bridge / Harmonic Shift"),
		option({value: "Solo / Melodic Variation"}, "🎸 Solo / Lead Melodic Variation"),
		option({value: "Drop / Breakdown"}, "🔥 Drop / Rhythmic Breakdown"),
		option({value: "Outro"}, "🌅 Outro / Fade Ending")
	);

	private readonly _promptInput: HTMLInputElement = input({
		type: "text",
		placeholder: "e.g. Upbeat synth lead with driving bassline and 16th note hi-hats",
		style: "width: 100%; box-sizing: border-box; margin-top: 4px; padding: 6px; font-size: 11px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
	});

	private readonly _channelCheckboxes: HTMLInputElement[] = [];
	private readonly _channelListContainer: HTMLDivElement = div({
		style: "margin: 6px 0; text-align: left; max-height: 90px; overflow-y: auto; padding: 4px; background: rgba(0,0,0,0.2); border-radius: 4px;"
	});

	private readonly _statusDiv: HTMLDivElement = div({
		style: "margin-top: 8px; font-size: 11px; color: #88bbff; text-align: center; min-height: 1.2em;"
	});

	private readonly _cancelButton: HTMLButtonElement = button({class: "cancelButton"}, "Cancel");
	private readonly _generateButton: HTMLButtonElement = button({
		class: "okayButton",
		style: "width: 60%; background: linear-gradient(135deg, #4a6fa5, #885ba5); border: none; font-weight: bold; cursor: pointer;"
	}, "✨ Generate 8 Bars");

	public readonly container: HTMLDivElement = div({class: "prompt noSelection", style: "width: 320px; text-align: left;"},
		h2({style: "text-align: center; margin-bottom: 8px; color: #88bbff;"}, "✨ AI Generate Section (+8 Bars)"),
		div({style: "font-size: 11px; color: #bbbbdd; margin-bottom: 8px;"},
			"Gemini AI analyzes your existing song key, scale, phrasing, and sections to compose 8 new matching bars."
		),
		label({style: "display: block; font-size: 11px; font-weight: bold; margin-top: 6px;"},
			"Target Section Type:",
			this._sectionTypeSelect,
		),
		label({style: "display: block; font-size: 11px; font-weight: bold; margin-top: 8px;"},
			"Creative Direction / Prompt (Optional):",
			this._promptInput,
		),
		div({style: "font-size: 11px; font-weight: bold; margin-top: 8px;"}, "Generate for Channels:"),
		this._channelListContainer,
		this._statusDiv,
		div({style: "display: flex; flex-direction: row-reverse; justify-content: space-between; margin-top: 10px;"},
			this._generateButton,
			this._cancelButton,
		),
	);

	constructor(private _doc: SongDocument) {
		for (let i = 0; i < this._doc.song.getChannelCount(); i++) {
			const channel = this._doc.song.channels[i];
			const isNoise = this._doc.song.getChannelIsNoise(i);
			const prefix = isNoise ? "🥁" : "🎹";
			const labelText = channel.name ? `${prefix} Ch${i + 1}: ${channel.name}` : `${prefix} Ch${i + 1}`;

			const checkbox = input({type: "checkbox", checked: true, style: "margin-right: 6px;"});
			this._channelCheckboxes.push(checkbox);

			this._channelListContainer.appendChild(
				label({style: "display: flex; align-items: center; margin: 2px 0; font-size: 11px; cursor: pointer;"},
					checkbox,
					labelText
				)
			);
		}

		this._generateButton.addEventListener("click", this._onGenerate);
		this._cancelButton.addEventListener("click", this._close);
		this.container.addEventListener("keydown", this._whenKeyPressed);
	}

	private _close = (): void => {
		this._doc.undo();
	}

	public cleanUp = (): void => {
		this._generateButton.removeEventListener("click", this._onGenerate);
		this._cancelButton.removeEventListener("click", this._close);
		this.container.removeEventListener("keydown", this._whenKeyPressed);
	}

	private _whenKeyPressed = (event: KeyboardEvent): void => {
		if (event.keyCode === 27) { // ESC
			this._close();
		}
	}

	private _extractSongContext(): any {
		const song = this._doc.song;
		const sections = SectionManager.getSections();

		const channelsContext: any[] = [];
		for (let c = 0; c < song.getChannelCount(); c++) {
			if (!this._channelCheckboxes[c].checked) continue;

			const channel = song.channels[c];
			const isNoise = song.getChannelIsNoise(c);
			const barsSummary: any[] = [];

			// Sample up to 8 existing bars for context
			const maxBarsToSample = Math.min(16, song.barCount);
			for (let b = 0; b < maxBarsToSample; b++) {
				const pattern = song.getPattern(c, b);
				if (pattern != null && pattern.notes.length > 0) {
					const notesList: any[] = [];
					for (const note of pattern.notes) {
						const startStep = Math.round((note.start * 16) / (song.beatsPerBar * Config.partsPerBeat));
						const durationSteps = Math.round(((note.end - note.start) * 16) / (song.beatsPerBar * Config.partsPerBeat));
						notesList.push({
							pitches: note.pitches,
							startStep,
							durationSteps: Math.max(1, durationSteps)
						});
					}
					barsSummary.push({
						barIndex: b + 1,
						notes: notesList
					});
				}
			}

			channelsContext.push({
				channelIndex: c,
				name: channel.name || (isNoise ? `Drums ${c + 1}` : `Channel ${c + 1}`),
				isNoise,
				existingBars: barsSummary
			});
		}

		return {
			scale: Config.scales[song.scale].name,
			key: Config.keys[song.key].name,
			tempo: song.tempo,
			beatsPerBar: song.beatsPerBar,
			sectionType: this._sectionTypeSelect.value,
			customPrompt: this._promptInput.value.trim(),
			existingSections: sections,
			channels: channelsContext
		};
	}

	private _onGenerate = async (): Promise<void> => {
		this._generateButton.disabled = true;
		this._cancelButton.disabled = true;
		this._statusDiv.textContent = "⏳ Analyzing song phrasing & context...";

		try {
			const context = this._extractSongContext();
			this._statusDiv.textContent = "✨ Gemini AI is composing 8 new bars...";

			const response = await fetch("/api/generate-section", {
				method: "POST",
				headers: {"Content-Type": "application/json"},
				body: JSON.stringify(context)
			});

			if (!response.ok) {
				const errorJson = await response.json().catch(() => ({}));
				throw new Error(errorJson.error || "Server generation error");
			}

			const result = await response.json();
			if (!result.success || !result.data) {
				throw new Error(result.error || "Invalid response from AI server");
			}

			this._statusDiv.textContent = "⚡ Applying new 8-bar section...";
			this._applyGeneratedSection(result.data);

		} catch (err: any) {
			console.error("AI Generation Error:", err);
			this._statusDiv.style.color = "#ff8888";
			this._statusDiv.textContent = `❌ Error: ${err.message || "Failed to generate section"}`;
			this._generateButton.disabled = false;
			this._cancelButton.disabled = false;
		}
	}

	private _applyGeneratedSection(aiData: any): void {
		const song = this._doc.song;
		const oldBarCount = song.barCount;
		const partsPerBar = song.beatsPerBar * Config.partsPerBeat;

		const group: ChangeGroup = new ChangeGroup();

		// 1. Expand song bar count by 8
		song.barCount += 8;

		const sectionName = aiData.sectionName || this._sectionTypeSelect.value || "Section 2";

		// 2. Populate notes for each channel
		if (aiData.channels && Array.isArray(aiData.channels)) {
			for (const chanData of aiData.channels) {
				const cIndex = chanData.channelIndex;
				if (cIndex < 0 || cIndex >= song.getChannelCount()) continue;

				const channel = song.channels[cIndex];

				if (chanData.bars && Array.isArray(chanData.bars)) {
					for (let b = 0; b < 8; b++) {
						const barData = chanData.bars.find((barObj: any) => barDataMatches(barObj, b + 1));
						const targetBarIndex = oldBarCount + b;

						// Create new pattern
						const pattern = new Pattern();
						if (barData && barData.notes && Array.isArray(barData.notes)) {
							for (const noteData of barData.notes) {
								if (!noteData.pitches || !Array.isArray(noteData.pitches) || noteData.pitches.length === 0) continue;

								const startStep = Math.max(0, Math.min(15, noteData.startStep || 0));
								const durationSteps = Math.max(1, Math.min(16, noteData.durationSteps || 2));

								const startPart = Math.round((startStep * partsPerBar) / 16);
								const endPart = Math.min(partsPerBar, Math.round(((startStep + durationSteps) * partsPerBar) / 16));

								const note = new Note(noteData.pitches[0], startPart, endPart, Config.noteSizeMax);
								note.pitches = noteData.pitches.map((p: number) => Number(p));
								pattern.notes.push(note);
							}
						}

						channel.patterns.push(pattern);
						channel.bars[targetBarIndex] = channel.patterns.length;
					}
				}
			}
		}

		// Fill in empty bar patterns for any un-generated channels for bars 0..7
		for (let c = 0; c < song.getChannelCount(); c++) {
			const channel = song.channels[c];
			for (let b = 0; b < 8; b++) {
				const targetBarIndex = oldBarCount + b;
				if (channel.bars[targetBarIndex] === undefined || channel.bars[targetBarIndex] === 0) {
					channel.bars[targetBarIndex] = 0; // Empty pattern
				}
			}
		}

		// 3. Add new section in SectionManager
		SectionManager.addSection(oldBarCount, oldBarCount + 7, sectionName);

		// 4. Update track bar scroll position to newly added section
		this._doc.barScrollPos = oldBarCount;
		this._doc.prompt = null;
		this._doc.record(group, true);
		this._doc.notifier.changed();
	}
}

function barDataMatches(barObj: any, expectedIndex: number): boolean {
	return barObj && (barObj.barIndex === expectedIndex || barObj.barIndex === (expectedIndex - 1));
}
