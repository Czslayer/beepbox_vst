// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {HTML} from "imperative-html/dist/esm/elements-strict.js";
import {SongDocument} from "./SongDocument.js";
import {Prompt} from "./Prompt.js";
import {SectionManager} from "./SectionManager.js";

const {button, div, label, h2, input} = HTML;

export class MovementPrompt implements Prompt {
	private readonly _nameInput: HTMLInputElement = input({
		type: "text",
		value: "Part 1: Overture",
		style: "width: 100%; box-sizing: border-box; margin-top: 4px; padding: 4px; font-size: 11px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 3px;"
	});

	private readonly _descriptionInput: HTMLInputElement = input({
		type: "text",
		value: "Fast tempo upbeat synth melody with driving arpeggios",
		placeholder: "e.g. Melodic interlude transitioning from minor to major key",
		style: "width: 100%; box-sizing: border-box; margin-top: 4px; padding: 4px; font-size: 11px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 3px;"
	});

	private readonly _startBarStepper: HTMLInputElement = input({
		type: "number",
		min: "1",
		style: "width: 4em; margin-left: 6px; padding: 2px; font-size: 11px;"
	});

	private readonly _endBarStepper: HTMLInputElement = input({
		type: "number",
		min: "1",
		style: "width: 4em; margin-left: 6px; padding: 2px; font-size: 11px;"
	});

	private readonly _cancelButton: HTMLButtonElement = button({class: "cancelButton"}, "Cancel");
	private readonly _okayButton: HTMLButtonElement = button({
		class: "okayButton",
		style: "width: 45%; font-weight: bold; cursor: pointer;"
	}, "Add Part");

	public readonly container: HTMLDivElement = div({class: "prompt noSelection", style: "width: 300px; text-align: left;"},
		h2({style: "text-align: center; margin-bottom: 8px; color: #ffd700;"}, "🎭 Mark Song Part / Movement"),
		div({style: "font-size: 11px; color: #bbbbdd; margin-bottom: 10px; line-height: 1.3;"},
			"Mark macro parts/movements with descriptions to guide AI auto-sectioning & arrangement analysis."
		),
		label({style: "display: block; font-size: 11px; font-weight: bold; margin-top: 6px;"},
			"Part / Movement Name:",
			this._nameInput,
		),
		label({style: "display: block; font-size: 11px; font-weight: bold; margin-top: 8px;"},
			"Part Description & Musical Context:",
			this._descriptionInput,
		),
		div({style: "display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 11px; font-weight: bold;"},
			label({style: "display: flex; align-items: center;"},
				"Start Bar:",
				this._startBarStepper
			),
			label({style: "display: flex; align-items: center;"},
				"End Bar:",
				this._endBarStepper
			)
		),
		div({style: "display: flex; flex-direction: row-reverse; justify-content: space-between; margin-top: 12px;"},
			this._okayButton,
			this._cancelButton,
		)
	);

	constructor(private _doc: SongDocument) {
		const selStart = this._doc.selection.boxSelectionBar;
		const selWidth = this._doc.selection.boxSelectionWidth;
		const selEnd = Math.max(selStart, selStart + selWidth - 1);

		this._startBarStepper.value = String(selStart + 1);
		this._endBarStepper.value = String(selEnd + 1);

		this._startBarStepper.max = String(this._doc.song.barCount);
		this._endBarStepper.max = String(this._doc.song.barCount);

		const movementCount = SectionManager.getMovements().length;
		const defaultNames = ["Part 1: Overture", "Part 2: Development", "Part 3: Recapitulation & Finale"];
		this._nameInput.value = movementCount < defaultNames.length ? defaultNames[movementCount] : `Part ${movementCount + 1}`;

		this._okayButton.addEventListener("click", this._save);
		this._cancelButton.addEventListener("click", this._close);
		this.container.addEventListener("keydown", this._whenKeyPressed);
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
		if (event.keyCode === 27) { // ESC
			this._close();
		} else if (event.keyCode === 13) { // Enter
			this._save();
		}
	}

	private _save = (): void => {
		const sBar = Math.max(0, Math.min(this._doc.song.barCount - 1, Number(this._startBarStepper.value) - 1));
		const eBar = Math.max(sBar, Math.min(this._doc.song.barCount - 1, Number(this._endBarStepper.value) - 1));

		const name = this._nameInput.value.trim() || `Part ${SectionManager.getMovements().length + 1}`;
		const desc = this._descriptionInput.value.trim() || "User-marked movement description";

		SectionManager.addMovement(sBar, eBar, name, desc);
		this._doc.prompt = null;
		this._doc.notifier.changed();
	}
}
