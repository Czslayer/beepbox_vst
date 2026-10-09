// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {HTML} from "imperative-html/dist/esm/elements-strict.js";
import {SongDocument} from "./SongDocument.js";
import {Prompt} from "./Prompt.js";
import {CustomPresetManager, CustomPreset} from "./CustomPresetManager.js";
import {ColorConfig} from "./ColorConfig.js";
import {ChangeLoadChannelPreset} from "./changes.js";

const {button, div, span, h2, p} = HTML;

export class ManageCustomPresetsPrompt implements Prompt {
	private readonly _presetListContainer: HTMLDivElement = div({style: "max-height: 260px; overflow-y: auto; margin: 0.5em 0; border: 1px solid var(--ui-widget-border, #444); border-radius: 4px; padding: 4px;"});
	private readonly _exportButton: HTMLButtonElement = button({type: "button", style: "font-size: 11px; padding: 3px 8px; margin-right: 6px; cursor: pointer;"}, "Export JSON");
	private readonly _importButton: HTMLButtonElement = button({type: "button", style: "font-size: 11px; padding: 3px 8px; cursor: pointer;"}, "Import JSON");
	private readonly _cancelButton: HTMLButtonElement = button({class: "cancelButton"});
	private readonly _closeButton: HTMLButtonElement = button({class: "okayButton", style: "width: 100%;"}, "Close");

	public readonly container: HTMLDivElement;

	constructor(private _doc: SongDocument) {
		this.container = div({class: "prompt noSelection", style: "width: 360px;"},
			h2("Manage Custom Channel Presets"),
			p({style: `font-size: smaller; color: ${ColorConfig.secondaryText}; margin: 0.2em 0 0.5em 0;`},
				"Custom presets save up to 4 simultaneous instruments for a channel."
			),
			this._presetListContainer,
			div({style: "display: flex; justify-content: space-between; align-items: center; margin-top: 0.5em;"},
				div({}, this._exportButton, this._importButton),
			),
			div({style: "margin-top: 1em;"}, this._closeButton),
			this._cancelButton
		);

		this._renderList();

		this._closeButton.addEventListener("click", this._close);
		this._cancelButton.addEventListener("click", this._close);
		this._exportButton.addEventListener("click", this._exportJson);
		this._importButton.addEventListener("click", this._importJson);
	}

	private _renderList(): void {
		while (this._presetListContainer.firstChild) {
			this._presetListContainer.removeChild(this._presetListContainer.firstChild);
		}

		const presets: CustomPreset[] = CustomPresetManager.getAllPresets();
		if (presets.length === 0) {
			this._presetListContainer.appendChild(
				p({style: `font-size: 12px; color: ${ColorConfig.secondaryText}; text-align: center; padding: 12px 0;`},
					"No custom channel presets saved yet. Select 'Save Channel Preset...' from the preset menu to create one!"
				)
			);
			return;
		}

		for (const preset of presets) {
			const typeBadge = span({
				style: `font-size: 10px; padding: 1px 4px; border-radius: 3px; background: ${preset.isNoise ? "#3a2e54" : "#2e3a54"}; color: ${preset.isNoise ? "#bfa8ff" : "#a8caff"}; margin-right: 6px;`
			}, preset.isNoise ? "Drum" : "Pitch");

			const instCountText = span({style: `font-size: 11px; color: ${ColorConfig.secondaryText}; margin-right: 6px;`},
				`(${preset.instruments.length} inst${preset.instruments.length > 1 ? "s" : ""})`
			);

			const nameSpan = span({style: "font-weight: bold; font-size: 12px; flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"},
				preset.name
			);

			const loadBtn = button({type: "button", style: "font-size: 10px; padding: 2px 6px; margin-left: 4px; color: #88ff88; cursor: pointer;", title: "Load preset into current channel"}, "Load");
			const renameBtn = button({type: "button", style: "font-size: 10px; padding: 2px 5px; margin-left: 4px; cursor: pointer;"}, "Rename");
			const deleteBtn = button({type: "button", style: "font-size: 10px; padding: 2px 5px; margin-left: 4px; color: #ff8888; cursor: pointer;"}, "Delete");

			loadBtn.addEventListener("click", () => {
				this._doc.record(new ChangeLoadChannelPreset(this._doc, preset));
				this._doc.prompt = null;
				this._doc.notifier.changed();
			});

			renameBtn.addEventListener("click", () => {
				const newName = window.prompt("Rename preset:", preset.name);
				if (newName !== null && newName.trim() !== "") {
					CustomPresetManager.renamePreset(preset.id, newName.trim());
					this._renderList();
					this._doc.notifier.changed();
				}
			});

			deleteBtn.addEventListener("click", () => {
				if (window.confirm(`Delete custom preset "${preset.name}"?`)) {
					CustomPresetManager.deletePreset(preset.id);
					this._renderList();
					this._doc.notifier.changed();
				}
			});

			const row = div({
				style: "display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; border-bottom: 1px solid var(--ui-widget-border, #333);"
			},
				div({style: "display: flex; align-items: center; overflow: hidden; max-width: 220px;"},
					typeBadge, nameSpan, instCountText
				),
				div({style: "display: flex; align-items: center;"}, loadBtn, renameBtn, deleteBtn)
			);

			this._presetListContainer.appendChild(row);
		}
	}

	private _exportJson = (): void => {
		const json = CustomPresetManager.exportPresetsJson();
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(json).then(() => {
				window.alert("Custom presets exported and copied to clipboard!");
			}).catch(() => {
				window.prompt("Custom presets JSON:", json);
			});
		} else {
			window.prompt("Custom presets JSON:", json);
		}
	}

	private _importJson = (): void => {
		const inputJson = window.prompt("Paste custom presets JSON:");
		if (inputJson != null && inputJson.trim() !== "") {
			const count = CustomPresetManager.importPresetsJson(inputJson);
			if (count > 0) {
				window.alert(`Successfully imported ${count} custom preset(s)!`);
				this._renderList();
				this._doc.notifier.changed();
			} else {
				window.alert("Failed to import presets. Please verify the JSON format.");
			}
		}
	}

	private _close = (): void => {
		this._doc.undo();
	}

	public cleanUp = (): void => {
		this._closeButton.removeEventListener("click", this._close);
		this._cancelButton.removeEventListener("click", this._close);
		this._exportButton.removeEventListener("click", this._exportJson);
		this._importButton.removeEventListener("click", this._importJson);
	}
}
