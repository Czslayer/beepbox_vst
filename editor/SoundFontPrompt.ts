// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {Config} from "../synth/SynthConfig.js";
import {Instrument} from "../synth/synth.js";
import {EditorConfig} from "./EditorConfig.js";
import {SongDocument} from "./SongDocument.js";
import {Prompt} from "./Prompt.js";
import {HTML} from "imperative-html/dist/esm/elements-strict.js";
import {ChangeGroup} from "./Change.js";
import {ChangePasteInstrument, ChangeCustomizeInstrument, ChangeAddChannelInstrument} from "./changes.js";
import {SoundFont, SoundFontPreset, SoundFontRegistry} from "../synth/SoundFont.js";

const {button, div, h2, p, select, option, input, label} = HTML;

// Global cache for recently loaded SoundFont in the session
let cachedSoundFont: SoundFont | null = null;

export function setCachedSoundFont(sf: SoundFont | null): void {
	cachedSoundFont = sf;
	if (sf) {
		SoundFontRegistry.register(sf);
	}
}

export function getCachedSoundFont(): SoundFont | null {
	return cachedSoundFont;
}

export class SoundFontPrompt implements Prompt {
	private readonly _fileInput: HTMLInputElement = input({type: "file", accept: ".sf2,audio/x-soundfont,application/x-soundfont", style: "display: none;"});
	private readonly _loadFileButton: HTMLButtonElement = button({type: "button", style: "padding: 6px 14px; margin-bottom: 8px; font-weight: bold; cursor: pointer;"}, "📂 Choose .sf2 File...");
	private readonly _titleHeading: HTMLHeadingElement = h2("Import SoundFont (.sf2)");
	private readonly _sfNameText: HTMLParagraphElement = p({style: "margin: 0 0 2px 0; font-size: 13px; font-weight: bold;"}, "");
	private readonly _sfMetaText: HTMLDivElement = div({style: "font-size: 11px; margin-bottom: 8px; color: var(--secondary-text, #aaa);"});
	private readonly _searchInput: HTMLInputElement = input({type: "text", placeholder: "Search presets (e.g. Piano, Bass, Strings, Drum)...", style: "width: 100%; margin-bottom: 8px;"});
	private readonly _presetSelect: HTMLSelectElement = select({style: "width: 100%; height: 120px; margin-bottom: 8px;", size: "6"});
	private readonly _infoText: HTMLDivElement = div({style: "font-size: 11px; color: var(--secondary-text, #999); margin-bottom: 6px; min-height: 24px;"});
	private readonly _synthModeSelect: HTMLSelectElement = select({style: "width: 100%; margin-bottom: 6px;"},
		option({value: "soundfont"}, "SoundFont Synth (Actual SF2 Sample Playback)"),
		option({value: "auto"}, "Auto BeepBox Synth (Approximation)"),
		option({value: "harmonics"}, "Harmonics (28-harmonic additive)"),
		option({value: "pickedString"}, "Picked String (Acoustic / Plucked)"),
		option({value: "spectrum"}, "Spectrum (Formant / Noise)"),
		option({value: "chip"}, "Chip Wave (Retro Pulse/Tri/Saw)"),
	);
	private readonly _targetSelect: HTMLSelectElement = select({style: "width: 100%; margin-bottom: 8px;"});
	private readonly _previewButton: HTMLButtonElement = button({type: "button", style: "margin-right: 6px; padding: 5px 12px; cursor: pointer;"}, "▶ Preview Note");
	private readonly _importFoldersButton: HTMLButtonElement = button({type: "button", class: "confirmButton", style: "padding: 5px 14px; margin-bottom: 6px; width: 100%; font-weight: bold; cursor: pointer;"}, "📁 Add All Banks as Preset Folders");
	private readonly _importButton: HTMLButtonElement = button({type: "button", style: "padding: 5px 12px; cursor: pointer;"}, "Apply Preset");
	private readonly _cancelButton: HTMLButtonElement = button({class: "cancelButton"});
	
	private readonly _browserSection: HTMLDivElement = div({style: "display: none;"});
	private readonly _uploadSection: HTMLDivElement = div({style: "text-align: center; padding: 12px 0;"});

	private _soundFont: SoundFont | null = null;
	private _filteredPresets: SoundFontPreset[] = [];

	public readonly container: HTMLDivElement;

	constructor(private _doc: SongDocument, initialSoundFont: SoundFont | null = null) {
		this._soundFont = initialSoundFont || cachedSoundFont;

		// Set up upload section
		this._uploadSection.appendChild(
			p({style: "margin: 0 0 10px 0; font-size: 12px; color: var(--secondary-text, #aaa); line-height: 1.5;"},
				"Load any SoundFont 2 (.sf2) file to add its instrument banks as preset folders in the Preset dropdown, or synthesize presets onto your channels."
			)
		);
		this._uploadSection.appendChild(this._loadFileButton);
		this._uploadSection.appendChild(this._fileInput);

		// Set up browser section
		const topRow = div({style: "display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;"},
			div({style: "flex-grow: 1;"}, this._sfNameText, this._sfMetaText),
			button({type: "button", style: "font-size: 10px; padding: 2px 6px; margin-left: 8px; cursor: pointer;", onclick: () => this._fileInput.click()}, "Change File")
		);

		this._browserSection.appendChild(topRow);
		this._browserSection.appendChild(this._importFoldersButton);
		this._browserSection.appendChild(
			div({style: "display: flex; gap: 8px; align-items: center; margin-bottom: 6px;"},
				label({style: "width: 80px; font-size: 12px;"}, "Synth Mode:"),
				div({class: "selectContainer", style: "flex-grow: 1;"}, this._synthModeSelect)
			)
		);
		this._browserSection.appendChild(div({style: "border-top: 1px solid var(--ui-widget-background, #333); margin: 6px 0;"}));
		this._browserSection.appendChild(this._searchInput);
		this._browserSection.appendChild(this._presetSelect);
		this._browserSection.appendChild(this._infoText);
		this._browserSection.appendChild(
			div({style: "display: flex; gap: 8px; align-items: center; margin-bottom: 6px;"},
				label({style: "width: 80px; font-size: 12px;"}, "Target:"),
				div({class: "selectContainer", style: "flex-grow: 1;"}, this._targetSelect)
			)
		);
		this._browserSection.appendChild(
			div({style: "display: flex; justify-content: space-between; align-items: center; margin-top: 8px;"},
				this._previewButton,
				this._importButton,
			)
		);

		this.container = div({class: "prompt noSelection", style: "width: 380px; max-width: 95vw;"},
			this._titleHeading,
			this._uploadSection,
			this._browserSection,
			this._cancelButton,
		);

		this._updateTargetOptions();

		this._loadFileButton.addEventListener("click", () => this._fileInput.click());
		this._fileInput.addEventListener("change", this._whenFileSelected);
		this._presetSelect.addEventListener("change", this._whenPresetChanged);
		this._searchInput.addEventListener("input", this._whenSearchChanged);
		this._previewButton.addEventListener("click", this._previewNote);
		this._importFoldersButton.addEventListener("click", this._importAllBanksToFolders);
		this._importButton.addEventListener("click", this._confirmImport);
		this._cancelButton.addEventListener("click", this._close);

		if (this._soundFont && this._soundFont.presets.length > 0) {
			this._displayLoadedSoundFont(this._soundFont);
		}
	}

	private _updateTargetOptions(): void {
		const channelIndex = this._doc.channel;
		const instrumentIndex = this._doc.getCurrentInstrument();
		const isNoise = this._doc.song.getChannelIsNoise(channelIndex);
		const maxInst = this._doc.song.getMaxInstrumentsPerChannel();

		this._targetSelect.innerHTML = "";
		this._targetSelect.appendChild(
			option({value: "folders"}, "Add All Banks to Preset Folders (Menu)")
		);
		this._targetSelect.appendChild(
			option({value: "current"}, `Current Instrument (Ch ${channelIndex + 1}${isNoise ? " Drum" : ""}, Inst ${instrumentIndex + 1})`)
		);
		if (this._doc.song.channels[channelIndex].instruments.length < maxInst) {
			this._targetSelect.appendChild(option({value: "new"}, `Add New Instrument to Channel ${channelIndex + 1}`));
		}
		this._targetSelect.appendChild(option({value: "populateAll"}, "Populate All Song Channels"));
	}

	private _whenFileSelected = (): void => {
		const file: File = this._fileInput.files![0];
		if (!file) return;

		const reader = new FileReader();
		reader.addEventListener("load", () => {
			try {
				const parsed = SoundFont.parse(<ArrayBuffer>reader.result);
				if (parsed.presets.length === 0) {
					alert("No presets found in this SoundFont (.sf2) file.");
					return;
				}
				this._soundFont = parsed;
				setCachedSoundFont(parsed);
				this._displayLoadedSoundFont(parsed);
			} catch (err: any) {
				console.error("Failed to parse SoundFont:", err);
				alert("Error parsing SoundFont file: " + (err.message || err));
			}
		});
		reader.readAsArrayBuffer(file);
	};

	private _displayLoadedSoundFont(sf: SoundFont): void {
		this._uploadSection.style.display = "none";
		this._browserSection.style.display = "";

		// Count unique banks
		const bankSet = new Set<number>();
		for (const p of sf.presets) bankSet.add(p.bank);

		this._sfNameText.textContent = sf.name || "SoundFont Bank";
		this._sfMetaText.textContent = `${sf.presets.length} presets in ${bankSet.size} bank${bankSet.size === 1 ? "" : "s"}` + (sf.author ? ` • ${sf.author}` : "");

		this._updatePresetList(this._searchInput.value);
	}

	private _updatePresetList(filterQuery: string): void {
		if (!this._soundFont) return;
		const q = filterQuery.trim().toLowerCase();
		this._presetSelect.innerHTML = "";
		this._filteredPresets = [];

		for (const preset of this._soundFont.presets) {
			if (
				q === "" ||
				preset.name.toLowerCase().includes(q) ||
				preset.preset.toString().includes(q) ||
				preset.bank.toString().includes(q)
			) {
				this._filteredPresets.push(preset);
				const opt = option({value: preset.getDisplayName()}, preset.getDisplayName());
				this._presetSelect.appendChild(opt);
			}
		}

		if (this._filteredPresets.length > 0) {
			this._presetSelect.selectedIndex = 0;
			this._whenPresetChanged();
		} else {
			this._infoText.textContent = "No matching presets found.";
		}
	}

	private _whenSearchChanged = (): void => {
		this._updatePresetList(this._searchInput.value);
	};

	private _getSelectedPreset(): SoundFontPreset | null {
		const idx = this._presetSelect.selectedIndex;
		if (idx >= 0 && idx < this._filteredPresets.length) {
			return this._filteredPresets[idx];
		}
		return null;
	}

	private _whenPresetChanged = (): void => {
		const preset = this._getSelectedPreset();
		if (!preset) {
			this._infoText.textContent = "";
			return;
		}

		const {sample} = preset.getPrimarySampleAndZone();
		let info = `Bank: ${preset.bank} | Program: ${preset.preset}`;
		if (preset.isDrum || preset.bank === 128) {
			info += " • Percussion / Drum Kit (Multi-sample)";
		} else if (sample) {
			info += ` • Sample: "${sample.name}" (${sample.sampleRate} Hz, Key: ${sample.originalPitch})`;
		}
		this._infoText.textContent = info;
	};

	private _importAllBanksToFolders = (): void => {
		if (!this._soundFont) return;
		const mode = <any>this._synthModeSelect.value;
		const result = EditorConfig.addSoundFont(this._soundFont, mode);
		this._doc.prompt = null;
		this._doc.notifier.changed();
		alert(`Successfully added ${result.banksCount} SoundFont bank folder(s) containing ${result.presetsCount} presets into the Preset dropdown menu!`);
	};

	private _previewNote = (): void => {
		const preset = this._getSelectedPreset();
		if (!preset) return;

		const isNoise = this._doc.song.getChannelIsNoise(this._doc.channel);
		const mode = <any>this._synthModeSelect.value;
		const instObj = preset.toInstrumentObject(mode, isNoise);

		// Temporarily apply preset settings to current instrument to preview tone
		const instrument: Instrument = this._doc.song.channels[this._doc.channel].instruments[this._doc.getCurrentInstrument()];
		const tempBackup = instrument.toJsonObject();

		instrument.fromJsonObject(instObj, isNoise);
		this._doc.notifier.changed();

		// Play preview note
		const testPitch = isNoise ? 0 : Config.keys[this._doc.song.key].basePitch + 24;
		this._doc.performance.setTemporaryPitches([testPitch], 48);

		// Restore instrument after preview triggers
		setTimeout(() => {
			instrument.fromJsonObject(tempBackup, isNoise);
			this._doc.notifier.changed();
		}, 600);
	};

	private _confirmImport = (): void => {
		const preset = this._getSelectedPreset();
		if (!preset || !this._soundFont) {
			this._close();
			return;
		}

		const mode = <any>this._synthModeSelect.value;
		const target = this._targetSelect.value;

		// Ensure soundfont banks are registered into preset folders
		EditorConfig.addSoundFont(this._soundFont, mode);

		if (target === "folders") {
			this._doc.prompt = null;
			this._doc.notifier.changed();
			return;
		}

		const group: ChangeGroup = new ChangeGroup();

		if (target === "populateAll") {
			let melodicIdx = 0;
			let drumIdx = 0;
			const melodicPresets = this._soundFont.presets.filter(p => !p.isDrum && p.bank !== 128);
			const drumPresets = this._soundFont.presets.filter(p => p.isDrum || p.bank === 128);

			for (let ch = 0; ch < this._doc.song.getChannelCount(); ch++) {
				const isNoise = this._doc.song.getChannelIsNoise(ch);
				const channel = this._doc.song.channels[ch];
				for (let instIndex = 0; instIndex < channel.instruments.length; instIndex++) {
					const inst = channel.instruments[instIndex];
					let selectedPreset: SoundFontPreset | undefined;

					if (isNoise) {
						selectedPreset = drumPresets[drumIdx % Math.max(1, drumPresets.length)] ?? preset;
						drumIdx++;
					} else {
						selectedPreset = melodicPresets[melodicIdx % Math.max(1, melodicPresets.length)] ?? preset;
						melodicIdx++;
					}

					if (selectedPreset) {
						const instObj = selectedPreset.toInstrumentObject(mode, isNoise);
						group.append(new ChangePasteInstrument(this._doc, inst, instObj));
						group.append(new ChangeCustomizeInstrument(this._doc));
					}
				}
			}
		} else if (target === "new") {
			const channelIndex = this._doc.channel;
			const isNoise = this._doc.song.getChannelIsNoise(channelIndex);
			group.append(new ChangeAddChannelInstrument(this._doc));
			const newInstIndex = this._doc.song.channels[channelIndex].instruments.length - 1;
			const inst = this._doc.song.channels[channelIndex].instruments[newInstIndex];
			const instObj = preset.toInstrumentObject(mode, isNoise);
			group.append(new ChangePasteInstrument(this._doc, inst, instObj));
			group.append(new ChangeCustomizeInstrument(this._doc));
			this._doc.selection.selectInstrument(newInstIndex);
		} else {
			const channelIndex = this._doc.channel;
			const isNoise = this._doc.song.getChannelIsNoise(channelIndex);
			const instrumentIndex = this._doc.getCurrentInstrument();
			const inst = this._doc.song.channels[channelIndex].instruments[instrumentIndex];
			const instObj = preset.toInstrumentObject(mode, isNoise);
			group.append(new ChangePasteInstrument(this._doc, inst, instObj));
			group.append(new ChangeCustomizeInstrument(this._doc));
		}

		this._doc.prompt = null;
		this._doc.record(group, true);
	};

	private _close = (): void => {
		this._doc.undo();
	};

	public cleanUp = (): void => {
		this._fileInput.removeEventListener("change", this._whenFileSelected);
		this._presetSelect.removeEventListener("change", this._whenPresetChanged);
		this._searchInput.removeEventListener("input", this._whenSearchChanged);
		this._previewButton.removeEventListener("click", this._previewNote);
		this._importFoldersButton.removeEventListener("click", this._importAllBanksToFolders);
		this._importButton.removeEventListener("click", this._confirmImport);
		this._cancelButton.removeEventListener("click", this._close);
	};
}
