// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {Config} from "../synth/SynthConfig.js";
import {HTML} from "imperative-html/dist/esm/elements-strict.js";
import {SongDocument} from "./SongDocument.js";
import {Prompt} from "./Prompt.js";
import {ChangeBeatsPerBar} from "./changes.js";
import {ColorConfig} from "./ColorConfig.js";

const {button, div, span, h2, input, br, select, option} = HTML;

export class BeatsPerBarPrompt implements Prompt {
	private readonly _beatsInput: HTMLInputElement = input({style: "width: 8em; margin-left: 0.5em;", type: "text"});
	private readonly _conversionStrategySelect: HTMLSelectElement = select({style: "width: 100%;"},
		option({value: "splice"}, "Splice beats at end of bars."),
		option({value: "stretch"}, "Stretch notes to fit in bars."),
		option({value: "overflow"}, "Overflow notes across bars."),
	);
	private readonly _cancelButton: HTMLButtonElement = button({class: "cancelButton"});
	private readonly _okayButton: HTMLButtonElement = button({class: "okayButton", style: "width:45%;"}, "Okay");
	
	public readonly container: HTMLDivElement = div({class: "prompt noSelection", style: "width: 280px;"},
		h2("Beats Per Bar & Time Signatures"),
		div({style: "display: flex; flex-direction: row; align-items: center; height: 2.5em; justify-content: flex-end;"},
			div({style: "text-align: right;"},
				"Beats pattern:",
				br(),
				span({style: `font-size: smaller; color: ${ColorConfig.secondaryText};`}, "EX: '4' or '4, 4, 9' (2 bars of 4, 1 bar of 9)"),
			),
			this._beatsInput,
		),
		div({style: "display: flex; flex-direction: row; align-items: center; height: 2em; justify-content: flex-end; margin-top: 0.5em;"},
			div({class: "selectContainer", style: "width: 100%;"}, this._conversionStrategySelect),
		),
		div({style: "display: flex; flex-direction: row-reverse; justify-content: space-between; margin-top: 0.5em;"},
			this._okayButton,
		),
		this._cancelButton,
	);
	
	constructor(private _doc: SongDocument) {
		if (this._doc.song.barBeats && this._doc.song.barBeats.length > 0) {
			this._beatsInput.value = this._doc.song.barBeats.join(", ");
		} else {
			this._beatsInput.value = this._doc.song.beatsPerBar + "";
		}
		
		const lastStrategy: string | null = window.localStorage.getItem("beatCountStrategy");
		if (lastStrategy != null) {
			this._conversionStrategySelect.value = lastStrategy;
		}
		
		this._beatsInput.select();
		setTimeout(()=>this._beatsInput.focus());
		
		this._okayButton.addEventListener("click", this._saveChanges);
		this._cancelButton.addEventListener("click", this._close);
		this.container.addEventListener("keydown", this._whenKeyPressed);
	}
	
	private _close = (): void => { 
		this._doc.undo();
	}
	
	public cleanUp = (): void => { 
		this._okayButton.removeEventListener("click", this._saveChanges);
		this._cancelButton.removeEventListener("click", this._close);
		this.container.removeEventListener("keydown", this._whenKeyPressed);
	}
	
	private _whenKeyPressed = (event: KeyboardEvent): void => {
		if ((<Element> event.target).tagName != "BUTTON" && event.keyCode == 13) { // Enter key
			this._saveChanges();
		}
	}
	
	private _saveChanges = (): void => {
		window.localStorage.setItem("beatCountStrategy", this._conversionStrategySelect.value);
		this._doc.prompt = null;
		const rawVal = this._beatsInput.value.trim();
		const parts = rawVal.split(/[\s,]+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x) && x >= Config.beatsPerBarMin && x <= Config.beatsPerBarMax);
		if (parts.length > 1) {
			this._doc.song.barBeats = parts;
			this._doc.record(new ChangeBeatsPerBar(this._doc, parts[0], this._conversionStrategySelect.value), true);
		} else {
			const singleVal = parts.length === 1 ? parts[0] : Math.floor(Math.max(Config.beatsPerBarMin, Math.min(Config.beatsPerBarMax, Number(rawVal) || 8)));
			this._doc.song.barBeats = [];
			this._doc.record(new ChangeBeatsPerBar(this._doc, singleVal, this._conversionStrategySelect.value), true);
		}
	}
}
