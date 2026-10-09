// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {Config} from "../synth/SynthConfig.js";
import {HTML} from "imperative-html/dist/esm/elements-strict.js";
import {SongDocument} from "./SongDocument.js";
import {Prompt} from "./Prompt.js";
import {ChangeTempo, ChangeTempoForBar, ChangeResetBarTempos} from "./changes.js";

const {button, div, h2, input, span} = HTML;

export class TempoPrompt implements Prompt {
	private readonly _songTempoInput: HTMLInputElement = input({
		type: "number",
		min: Config.tempoMin.toString(),
		max: Config.tempoMax.toString(),
		value: this._doc.song.tempo.toString(),
		style: "width: 70px; margin-left: 6px; padding: 4px; font-size: 12px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
	});

	private readonly _startBarInput: HTMLInputElement = input({
		type: "number",
		min: "1",
		max: this._doc.song.barCount.toString(),
		value: "1",
		style: "width: 55px; padding: 4px; font-size: 11px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
	});

	private readonly _endBarInput: HTMLInputElement = input({
		type: "number",
		min: "1",
		max: this._doc.song.barCount.toString(),
		value: "4",
		style: "width: 55px; padding: 4px; font-size: 11px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
	});

	private readonly _barTempoInput: HTMLInputElement = input({
		type: "number",
		min: Config.tempoMin.toString(),
		max: Config.tempoMax.toString(),
		value: this._doc.song.tempo.toString(),
		style: "width: 65px; padding: 4px; font-size: 11px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px;"
	});

	private readonly _applyBarTempoBtn: HTMLButtonElement = button({
		class: "okayButton",
		style: "padding: 3px 8px; font-size: 11px; margin-left: 6px; background: #4a6fa5;"
	}, "+ Set Bar Tempo");

	private readonly _resetBarTemposBtn: HTMLButtonElement = button({
		class: "cancelButton",
		style: "padding: 3px 8px; font-size: 11px; margin-left: 6px; background: #884444;"
	}, "Reset Bar Tempos");

	private readonly _activeTemposList: HTMLDivElement = div({
		style: "margin: 6px 0; max-height: 80px; overflow-y: auto; padding: 6px; background: rgba(0,0,0,0.2); border-radius: 4px; font-size: 11px; color: #bbbbdd;"
	});

	private readonly _cancelButton: HTMLButtonElement = button({class: "cancelButton"}, "Cancel");
	private readonly _okayButton: HTMLButtonElement = button({class: "okayButton"}, "OK");

	public readonly container: HTMLDivElement = div({class: "prompt noSelection", style: "width: 320px; text-align: left;"},
		h2({style: "text-align: center; margin-bottom: 8px; color: #88bbff;"}, "⏱️ Song & Bar Tempo Settings"),
		
		div({style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding: 6px; background: rgba(0,0,0,0.2); border-radius: 4px;"},
			span({style: "font-size: 11px; font-weight: bold;"}, "Base Song Tempo (BPM):"),
			this._songTempoInput
		),

		div({style: "font-size: 11px; font-weight: bold; color: #88bbff; margin-bottom: 4px;"}, "⚡ Dynamic Tempo Changes Per Bar:"),
		div({style: "display: flex; align-items: center; gap: 4px; margin-bottom: 6px; font-size: 11px;"},
			span("Bars:"),
			this._startBarInput,
			span("to"),
			this._endBarInput,
			span("BPM:"),
			this._barTempoInput
		),
		div({style: "display: flex; justify-content: flex-end; margin-bottom: 8px;"},
			this._resetBarTemposBtn,
			this._applyBarTempoBtn
		),

		div({style: "font-size: 10px; font-weight: bold; color: #aaaabb; margin-top: 4px;"}, "Active Bar Tempo Overrides:"),
		this._activeTemposList,

		div({style: "display: flex; flex-direction: row-reverse; justify-content: space-between; margin-top: 12px;"},
			this._okayButton,
			this._cancelButton
		)
	);

	constructor(private _doc: SongDocument) {
		this._renderActiveTempos();

		this._applyBarTempoBtn.addEventListener("click", this._onApplyBarTempo);
		this._resetBarTemposBtn.addEventListener("click", this._onResetBarTempos);
		this._okayButton.addEventListener("click", this._saveAndClose);
		this._cancelButton.addEventListener("click", this._close);
		this.container.addEventListener("keydown", this._whenKeyPressed);
	}

	private _close = (): void => {
		this._doc.undo();
	}

	public cleanUp = (): void => {
		this._applyBarTempoBtn.removeEventListener("click", this._onApplyBarTempo);
		this._resetBarTemposBtn.removeEventListener("click", this._onResetBarTempos);
		this._okayButton.removeEventListener("click", this._saveAndClose);
		this._cancelButton.removeEventListener("click", this._close);
		this.container.removeEventListener("keydown", this._whenKeyPressed);
	}

	private _whenKeyPressed = (event: KeyboardEvent): void => {
		if (event.keyCode === 27) { // ESC
			this._close();
		} else if (event.keyCode === 13) { // Enter
			this._saveAndClose();
		}
	}

	private _renderActiveTempos(): void {
		while (this._activeTemposList.firstChild) this._activeTemposList.removeChild(this._activeTemposList.firstChild);

		const song = this._doc.song;
		if (!song.barTempos || song.barTempos.length === 0) {
			this._activeTemposList.textContent = "No per-bar tempo overrides set. Entire song plays at Base Tempo.";
			return;
		}

		let hasAny = false;
		for (let b = 0; b < song.barCount; b++) {
			const barBpm = song.barTempos[b];
			if (barBpm && barBpm !== song.tempo) {
				hasAny = true;
				const row = div({style: "display: flex; justify-content: space-between; margin: 2px 0;"},
					span(`Bar ${b + 1}:`),
					span({style: "color: #88ffbb; font-weight: bold;"}, `${barBpm} BPM`)
				);
				this._activeTemposList.appendChild(row);
			}
		}

		if (!hasAny) {
			this._activeTemposList.textContent = "All bars match Base Tempo.";
		}
	}

	private _onApplyBarTempo = (): void => {
		const startBar = Math.max(0, parseInt(this._startBarInput.value) - 1);
		const endBar = Math.min(this._doc.song.barCount - 1, parseInt(this._endBarInput.value) - 1);
		const newBpm = parseInt(this._barTempoInput.value);

		if (!isNaN(startBar) && !isNaN(endBar) && !isNaN(newBpm) && startBar <= endBar) {
			this._doc.record(new ChangeTempoForBar(this._doc, startBar, endBar, newBpm));
			this._renderActiveTempos();
		}
	}

	private _onResetBarTempos = (): void => {
		this._doc.record(new ChangeResetBarTempos(this._doc));
		this._renderActiveTempos();
	}

	private _saveAndClose = (): void => {
		const newBaseBpm = parseInt(this._songTempoInput.value);
		if (!isNaN(newBaseBpm) && newBaseBpm !== this._doc.song.tempo) {
			this._doc.record(new ChangeTempo(this._doc, this._doc.song.tempo, newBaseBpm));
		}
		this._doc.prompt = null;
		this._doc.notifier.changed();
	}
}
