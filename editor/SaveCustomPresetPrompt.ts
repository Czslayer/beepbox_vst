// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {HTML} from "imperative-html/dist/esm/elements-strict.js";
import {SongDocument} from "./SongDocument.js";
import {Prompt} from "./Prompt.js";
import {CustomPresetManager} from "./CustomPresetManager.js";
import {Channel, Instrument, Config} from "../synth/synth.js";
import {ColorConfig} from "./ColorConfig.js";

const {button, div, span, h2, input, p} = HTML;

export class SaveCustomPresetPrompt implements Prompt {
	private readonly _nameInput: HTMLInputElement = input({style: "width: 100%; margin: 0.5em 0; padding: 4px 8px;", type: "text", placeholder: "Preset Name"});
	private readonly _cancelButton: HTMLButtonElement = button({class: "cancelButton"});
	private readonly _okayButton: HTMLButtonElement = button({class: "okayButton", style: "width: 45%;"}, "Save Preset");

	public readonly container: HTMLDivElement;

	constructor(private _doc: SongDocument) {
		const channel: Channel = this._doc.song.channels[this._doc.channel];
		const isNoise: boolean = this._doc.song.getChannelIsNoise(this._doc.channel);
		const instrumentCount: number = Math.min(4, channel.instruments.length); // Max 4 simultaneous instruments per preset in each channel
		
		const instrumentNames: string[] = [];
		for (let i = 0; i < instrumentCount; i++) {
			const inst: Instrument = channel.instruments[i];
			instrumentNames.push(Config.instrumentTypeNames[inst.type] || "Instrument " + (i + 1));
		}

		const defaultName = "Custom " + (isNoise ? "Drum" : "Pitch") + " (" + instrumentCount + " Inst)";
		this._nameInput.value = defaultName;

		this.container = div({class: "prompt noSelection", style: "width: 320px;"},
			h2("Save Channel Preset"),
			p({style: `font-size: smaller; color: ${ColorConfig.secondaryText}; margin: 0.5em 0;`},
				"Saves all " + instrumentCount + " instrument(s) in this channel as a reusable custom preset (max 4 simultaneous instruments)."
			),
			div({style: `font-size: 11px; color: ${ColorConfig.secondaryText}; margin-bottom: 0.5em;`},
				"Channel Type: " + (isNoise ? "Noise / Drum" : "Pitched") + " • Included: " + instrumentNames.join(", ")
			),
			div({style: "margin: 0.5em 0;"},
				span({style: "font-weight: bold; font-size: 12px;"}, "Preset Name:"),
				this._nameInput
			),
			div({style: "display: flex; flex-direction: row-reverse; justify-content: space-between; margin-top: 1em;"},
				this._okayButton
			),
			this._cancelButton
		);

		this._okayButton.addEventListener("click", this._save);
		this._cancelButton.addEventListener("click", this._close);
		this.container.addEventListener("keydown", this._whenKeyPressed);

		setTimeout(() => {
			this._nameInput.select();
			this._nameInput.focus();
		});
	}

	private _close = (): void => {
		this._doc.undo();
	}

	public cleanUp = (): void => {
		this._okayButton.removeEventListener("click", this._save);
		this._cancelButton.removeEventListener("click", this._close);
		this.container.removeEventListener("keydown", this._whenKeyPressed);
	}

	private _whenKeyPressed = (event: KeyboardEvent): void => {
		if ((<Element> event.target).tagName !== "BUTTON" && event.keyCode === 13) { // Enter
			this._save();
		}
	}

	private _save = (): void => {
		const name = this._nameInput.value.trim() || "Untitled Custom Preset";
		const channel: Channel = this._doc.song.channels[this._doc.channel];
		const isNoise: boolean = this._doc.song.getChannelIsNoise(this._doc.channel);
		const instrumentCount: number = Math.min(4, channel.instruments.length);

		const instJsonArray: any[] = [];
		for (let i = 0; i < instrumentCount; i++) {
			instJsonArray.push(channel.instruments[i].toJsonObject());
		}

		CustomPresetManager.savePreset(name, isNoise, instJsonArray);
		this._doc.prompt = null;
		this._doc.notifier.changed();
	}
}
