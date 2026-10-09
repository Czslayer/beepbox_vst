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

const {button, div, h2, p, select, option, input, label, span} = HTML;

export function setCachedSoundFont(sf: SoundFont | null): void {
	if (sf) {
		SoundFontRegistry.register(sf);
	}
}

export function getCachedSoundFont(): SoundFont | null {
	const sfs = SoundFontRegistry.getSoundFonts();
	return sfs.length > 0 ? sfs[sfs.length - 1] : null;
}

export class SoundFontPrompt implements Prompt {
	private readonly _fileInput: HTMLInputElement = input({
		type: "file",
		accept: ".sf2,audio/x-soundfont,application/x-soundfont",
		multiple: true,
		style: "display: none;"
	});

	private readonly _loadFileButton: HTMLButtonElement = button({
		type: "button",
		style: "padding: 6px 14px; font-weight: bold; cursor: pointer; background: linear-gradient(135deg, #4a6fa5, #885ba5); border: none; color: #fff; border-radius: 4px;"
	}, "📂 Add .sf2 SoundFont File(s)...");

	private readonly _titleHeading: HTMLHeadingElement = h2("SoundFont Library & Instrument Import");

	private readonly _sfSelect: HTMLSelectElement = select({
		style: "width: 100%; margin-bottom: 6px; padding: 4px; font-size: 11px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
	});

	private readonly _removeSfButton: HTMLButtonElement = button({
		type: "button",
		style: "padding: 3px 8px; font-size: 10px; cursor: pointer; background: #884444; color: #fff; border: none; border-radius: 3px;"
	}, "🗑️ Remove SF2");

	private readonly _clearAllSfButton: HTMLButtonElement = button({
		type: "button",
		style: "padding: 3px 8px; font-size: 10px; cursor: pointer; background: #663333; color: #fff; border: none; border-radius: 3px;"
	}, "🧹 Clear Library");

	private readonly _sfMetaText: HTMLDivElement = div({
		style: "font-size: 11px; margin-bottom: 8px; color: var(--secondary-text, #aaa);"
	});

	private readonly _searchInput: HTMLInputElement = input({
		type: "text",
		placeholder: "Search presets (e.g. Piano, Bass, Strings, Drum)...",
		style: "width: 100%; box-sizing: border-box; margin-bottom: 6px; padding: 5px; font-size: 11px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
	});

	private readonly _presetSelect: HTMLSelectElement = select({
		style: "width: 100%; height: 120px; margin-bottom: 6px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;",
		size: "6"
	});

	private readonly _infoText: HTMLDivElement = div({
		style: "font-size: 11px; color: var(--secondary-text, #999); margin-bottom: 6px; min-height: 22px;"
	});

	private readonly _synthModeSelect: HTMLSelectElement = select({
		style: "width: 100%; margin-bottom: 6px; padding: 4px; font-size: 11px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
	},
		option({value: "soundfont"}, "SoundFont Synth (Actual SF2 Sample Playback)"),
		option({value: "auto"}, "Auto BeepBox Synth (Approximation)"),
		option({value: "harmonics"}, "Harmonics (28-harmonic additive)"),
		option({value: "pickedString"}, "Picked String (Acoustic / Plucked)"),
		option({value: "spectrum"}, "Spectrum (Formant / Noise)"),
		option({value: "chip"}, "Chip Wave (Retro Pulse/Tri/Saw)")
	);

	private readonly _targetSelect: HTMLSelectElement = select({
		style: "width: 100%; margin-bottom: 8px; padding: 4px; font-size: 11px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
	});

	private readonly _previewButton: HTMLButtonElement = button({
		type: "button",
		style: "padding: 5px 12px; font-size: 11px; cursor: pointer; background: #4a6fa5; color: #fff; border: none; border-radius: 3px;"
	}, "▶ Preview Note");

	private readonly _importFoldersButton: HTMLButtonElement = button({
		type: "button",
		class: "confirmButton",
		style: "padding: 6px 14px; margin-bottom: 8px; width: 100%; font-weight: bold; cursor: pointer; background: linear-gradient(135deg, #4a9b81, #4a6fa5); border: none; color: #fff; border-radius: 4px;"
	}, "📁 Add All SoundFont Banks as Preset Folders");

	private readonly _importButton: HTMLButtonElement = button({
		type: "button",
		class: "okayButton",
		style: "padding: 5px 14px; font-size: 11px; font-weight: bold; cursor: pointer;"
	}, "Apply Preset");

	private readonly _cancelButton: HTMLButtonElement = button({class: "cancelButton"});

	private readonly _browserSection: HTMLDivElement = div({style: "display: none;"});
	private readonly _uploadSection: HTMLDivElement = div({style: "text-align: center; padding: 12px 0;"});

	private _filteredPresets: SoundFontPreset[] = [];

	public readonly container: HTMLDivElement;

	constructor(private _doc: SongDocument) {
		this._uploadSection.appendChild(
			p({style: "margin: 0 0 10px 0; font-size: 12px; color: var(--secondary-text, #aaa); line-height: 1.5;"},
				"Load one or multiple SoundFont 2 (.sf2) files to add their instrument banks into your BeepBox session preset menu or synthesize instruments onto your channels."
			)
		);
		this._uploadSection.appendChild(this._loadFileButton);
		this._uploadSection.appendChild(this._fileInput);

		// Browser Section setup
		const sfHeaderRow = div({style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;"},
			span({style: "font-size: 11px; font-weight: bold; color: #88bbff;"}, "Active SoundFont:"),
			div({style: "display: flex; gap: 4px;"},
				button({
					type: "button",
					style: "font-size: 10px; padding: 2px 6px; cursor: pointer; background: #335577; color: #fff; border: none; border-radius: 3px;",
					onclick: () => this._fileInput.click()
				}, "➕ Add SF2"),
				this._removeSfButton,
				this._clearAllSfButton
			)
		);

		this._browserSection.appendChild(sfHeaderRow);
		this._browserSection.appendChild(this._sfSelect);
		this._browserSection.appendChild(this._sfMetaText);
		this._browserSection.appendChild(this._importFoldersButton);
		this._browserSection.appendChild(
			div({style: "display: flex; gap: 8px; align-items: center; margin-bottom: 6px;"},
				label({style: "width: 80px; font-size: 11px; font-weight: bold;"}, "Synth Mode:"),
				div({class: "selectContainer", style: "flex-grow: 1;"}, this._synthModeSelect)
			)
		);
		this._browserSection.appendChild(div({style: "border-top: 1px solid var(--ui-widget-background, #333); margin: 6px 0;"}));
		this._browserSection.appendChild(this._searchInput);
		this._browserSection.appendChild(this._presetSelect);
		this._browserSection.appendChild(this._infoText);
		this._browserSection.appendChild(
			div({style: "display: flex; gap: 8px; align-items: center; margin-bottom: 6px;"},
				label({style: "width: 80px; font-size: 11px; font-weight: bold;"}, "Target:"),
				div({class: "selectContainer", style: "flex-grow: 1;"}, this._targetSelect)
			)
		);
		this._browserSection.appendChild(
			div({style: "display: flex; justify-content: space-between; align-items: center; margin-top: 8px;"},
				this._previewButton,
				this._importButton
			)
		);

		this.container = div({class: "prompt noSelection", style: "width: 400px; max-width: 95vw;"},
			this._titleHeading,
			this._uploadSection,
			this._browserSection,
			this._cancelButton
		);

		this._updateTargetOptions();

		this._loadFileButton.addEventListener("click", () => this._fileInput.click());
		this._fileInput.addEventListener("change", this._whenFilesSelected);
		this._sfSelect.addEventListener("change", this._whenSfSelectionChanged);
		this._removeSfButton.addEventListener("click", this._removeCurrentSoundFont);
		this._clearAllSfButton.addEventListener("click", this._clearAllSoundFonts);
		this._presetSelect.addEventListener("change", this._whenPresetChanged);
		this._searchInput.addEventListener("input", this._whenSearchChanged);
		this._previewButton.addEventListener("click", this._previewNote);
		this._importFoldersButton.addEventListener("click", this._importAllBanksToFolders);
		this._importButton.addEventListener("click", this._confirmImport);
		this._cancelButton.addEventListener("click", this._close);

		this._refreshLibraryUI();
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

	private _whenFilesSelected = (): void => {
		const files: FileList | null = this._fileInput.files;
		if (!files || files.length === 0) return;

		let loadedCount = 0;
		let errors = 0;

		const processNext = (index: number) => {
			if (index >= files.length) {
				this._fileInput.value = "";
				this._refreshLibraryUI();
				if (loadedCount > 0) {
					// Automatically register all loaded soundfonts to preset folders
					const sfs = SoundFontRegistry.getSoundFonts();
					for (const sf of sfs) {
						EditorConfig.addSoundFont(sf, <any>this._synthModeSelect.value);
					}
				}
				return;
			}

			const file = files[index];
			const reader = new FileReader();
			reader.addEventListener("load", () => {
				try {
					const parsed = SoundFont.parse(<ArrayBuffer>reader.result, file.name.replace(/\.sf2$/i, ""));
					if (parsed.presets.length > 0) {
						SoundFontRegistry.register(parsed);
						loadedCount++;
					} else {
						errors++;
					}
				} catch (err) {
					console.error("Failed to parse SoundFont:", file.name, err);
					errors++;
				}
				processNext(index + 1);
			});
			reader.readAsArrayBuffer(file);
		};

		processNext(0);
	};

	private _refreshLibraryUI(): void {
		const sfs = SoundFontRegistry.getSoundFonts();

		if (sfs.length === 0) {
			this._uploadSection.style.display = "";
			this._browserSection.style.display = "none";
			return;
		}

		this._uploadSection.style.display = "none";
		this._browserSection.style.display = "";

		const prevValue = this._sfSelect.value;
		this._sfSelect.innerHTML = "";

		let totalPresets = 0;
		for (const sf of sfs) totalPresets += sf.presets.length;

		this._sfSelect.appendChild(
			option({value: "ALL"}, `🌐 All Loaded SoundFonts (${sfs.length} SF2 Files, ${totalPresets} presets)`)
		);

		for (let i = 0; i < sfs.length; i++) {
			const sf = sfs[i];
			const labelStr = `🎹 ${sf.name || `SoundFont ${i + 1}`} (${sf.presets.length} presets)`;
			this._sfSelect.appendChild(option({value: sf.name}, labelStr));
		}

		if (prevValue && Array.from(this._sfSelect.options).some(o => o.value === prevValue)) {
			this._sfSelect.value = prevValue;
		} else {
			this._sfSelect.selectedIndex = 0;
		}

		this._updatePresetList(this._searchInput.value);
	}

	private _whenSfSelectionChanged = (): void => {
		this._updatePresetList(this._searchInput.value);
	};

	private _removeCurrentSoundFont = (): void => {
		const selectedValue = this._sfSelect.value;
		if (selectedValue === "ALL") {
			this._clearAllSoundFonts();
			return;
		}
		SoundFontRegistry.remove(selectedValue);
		this._refreshLibraryUI();
	};

	private _clearAllSoundFonts = (): void => {
		SoundFontRegistry.clear();
		EditorConfig.clearSoundFontPresets();
		this._refreshLibraryUI();
	};

	private _updatePresetList(filterQuery: string): void {
		const sfs = SoundFontRegistry.getSoundFonts();
		if (sfs.length === 0) return;

		const selectedValue = this._sfSelect.value;
		const q = filterQuery.trim().toLowerCase();

		this._presetSelect.innerHTML = "";
		this._filteredPresets = [];

		let activeList: SoundFont[] = sfs;
		if (selectedValue !== "ALL") {
			activeList = sfs.filter(s => s.name === selectedValue);
		}

		let totalBankSet = new Set<number>();

		for (const sf of activeList) {
			for (const preset of sf.presets) {
				totalBankSet.add(preset.bank);
				if (
					q === "" ||
					preset.name.toLowerCase().includes(q) ||
					preset.preset.toString().includes(q) ||
					preset.bank.toString().includes(q) ||
					sf.name.toLowerCase().includes(q)
				) {
					this._filteredPresets.push(preset);
					const prefix = selectedValue === "ALL" ? `[${sf.name}] ` : "";
					const dispName = `${prefix}${preset.getDisplayName()}`;
					const opt = option({value: dispName}, dispName);
					this._presetSelect.appendChild(opt);
				}
			}
		}

		if (selectedValue === "ALL") {
			this._sfMetaText.textContent = `Library contains ${sfs.length} SoundFonts with ${this._filteredPresets.length} matching presets across ${totalBankSet.size} banks.`;
		} else {
			const activeSf = activeList[0];
			this._sfMetaText.textContent = activeSf ? `${activeSf.presets.length} presets in ${totalBankSet.size} bank(s)` + (activeSf.author ? ` • ${activeSf.author}` : "") : "";
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
		let info = `[${preset.soundFont.name}] Bank: ${preset.bank} | Program: ${preset.preset}`;
		if (preset.isDrum || preset.bank === 128) {
			info += " • Percussion / Drum Kit";
		} else if (sample) {
			info += ` • Sample: "${sample.name}" (${sample.sampleRate} Hz)`;
		}
		this._infoText.textContent = info;
	};

	private _importAllBanksToFolders = (): void => {
		const sfs = SoundFontRegistry.getSoundFonts();
		if (sfs.length === 0) return;

		const mode = <any>this._synthModeSelect.value;
		let totalBanks = 0;
		let totalPresets = 0;

		for (const sf of sfs) {
			const res = EditorConfig.addSoundFont(sf, mode);
			totalBanks += res.banksCount;
			totalPresets += res.presetsCount;
		}

		this._doc.prompt = null;
		this._doc.notifier.changed();
		alert(`Successfully added ${totalBanks} SoundFont bank folder(s) containing ${totalPresets} presets into the Preset dropdown menu across ${sfs.length} SoundFonts!`);
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
		if (!preset) {
			this._close();
			return;
		}

		const mode = <any>this._synthModeSelect.value;
		const target = this._targetSelect.value;

		// Register selected soundfont into preset menu
		EditorConfig.addSoundFont(preset.soundFont, mode);

		if (target === "folders") {
			this._doc.prompt = null;
			this._doc.notifier.changed();
			return;
		}

		const group: ChangeGroup = new ChangeGroup();

		if (target === "populateAll") {
			let melodicIdx = 0;
			let drumIdx = 0;

			const activeSf = preset.soundFont;
			const melodicPresets = activeSf.presets.filter(p => !p.isDrum && p.bank !== 128);
			const drumPresets = activeSf.presets.filter(p => p.isDrum || p.bank === 128);

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
		this._loadFileButton.removeEventListener("click", () => this._fileInput.click());
		this._fileInput.removeEventListener("change", this._whenFilesSelected);
		this._sfSelect.removeEventListener("change", this._whenSfSelectionChanged);
		this._removeSfButton.removeEventListener("click", this._removeCurrentSoundFont);
		this._clearAllSfButton.removeEventListener("click", this._clearAllSoundFonts);
		this._presetSelect.removeEventListener("change", this._whenPresetChanged);
		this._searchInput.removeEventListener("input", this._whenSearchChanged);
		this._previewButton.removeEventListener("click", this._previewNote);
		this._importFoldersButton.removeEventListener("click", this._importAllBanksToFolders);
		this._importButton.removeEventListener("click", this._confirmImport);
		this._cancelButton.removeEventListener("click", this._close);
	};
}
