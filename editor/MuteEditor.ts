// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {SongDocument} from "./SongDocument.js";
import {HTML} from "imperative-html/dist/esm/elements-strict.js";
import {ColorConfig} from "./ColorConfig.js";
import {ChannelRow} from "./ChannelRow.js";
import {ChangeChannelName} from "./changes.js";

export class MuteEditor {
	private _cornerFiller: HTMLDivElement = HTML.div({style: `background: ${ColorConfig.editorBackground}; position: sticky; bottom: 0; left: 0; width: 110px; height: 30px;`});
	
	public readonly container: HTMLElement = HTML.div({class: "muteEditor"});
	
	private readonly _buttons: HTMLButtonElement[] = [];
	
	constructor(private _doc: SongDocument) {
		this.container.addEventListener("click", this._onClick);
		this.container.addEventListener("dblclick", this._onDblClick);
		this.container.addEventListener("contextmenu", this._onContextMenu);
	}
	
	private _onClick = (event: MouseEvent): void => {
		const index = this._buttons.indexOf(<HTMLButtonElement> event.target);
		if (index == -1) return;
		this._doc.song.channels[index].muted = !this._doc.song.channels[index].muted;
		this._doc.notifier.changed();
	}

	private _onDblClick = (event: MouseEvent): void => {
		const index = this._buttons.indexOf(<HTMLButtonElement> event.target);
		if (index == -1) return;
		this._renameChannel(index);
	}

	private _onContextMenu = (event: MouseEvent): void => {
		const index = this._buttons.indexOf(<HTMLButtonElement> event.target);
		if (index == -1) return;
		event.preventDefault();
		this._renameChannel(index);
	}

	private _renameChannel(index: number): void {
		const currentName = this._doc.song.channels[index].name || "";
		const defaultPrompt = currentName || (index === 0 ? "Lead / Pad" : index === 1 ? "Organ / Chords" : index === 2 ? "Bass / Fretless Bass" : `Channel ${index + 1}`);
		const newName = prompt(`Rename Channel ${index + 1}:`, defaultPrompt);
		if (newName != null) {
			this._doc.record(new ChangeChannelName(this._doc, index, newName.trim()));
		}
	}
	
	public render(): void {
		if (!this._doc.prefs.enableChannelMuting) return;
		
		if (this._buttons.length != this._doc.song.getChannelCount()) {
			for (let y: number = this._buttons.length; y < this._doc.song.getChannelCount(); y++) {
				const muteButton: HTMLButtonElement = HTML.button({
					class: "mute-button",
					title: "Click to Mute, Double-click / Right-click to Rename Channel",
					style: `
						height: ${ChannelRow.patternHeight - 4}px;
						margin: 2px;
						font-size: 10px;
						font-weight: bold;
						text-align: left;
						padding: 0 6px;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
						cursor: pointer;
					`
				});
				this.container.appendChild(muteButton);
				this._buttons[y] = muteButton;
			}
			for (let y: number = this._doc.song.getChannelCount(); y < this._buttons.length; y++) {
				this.container.removeChild(this._buttons[y]);
			}
			this._buttons.length = this._doc.song.getChannelCount();
			
			// Always put this at the bottom, below all the other buttons, to cover up the loop editor when scrolling.
			this.container.appendChild(this._cornerFiller);
		}
		
		for (let y: number = 0; y < this._doc.song.getChannelCount(); y++) {
			const channel = this._doc.song.channels[y];
			const isNoise = this._doc.song.getChannelIsNoise(y);
			const prefix = isNoise ? `🥁 Ch${y + 1}` : `🎹 Ch${y + 1}`;
			const labelText = channel.name ? `${prefix}: ${channel.name}` : `${prefix}`;
			
			this._buttons[y].textContent = labelText;
			this._buttons[y].title = `${labelText} - Click to Mute, Double-click to Rename`;

			if (channel.muted) {
				this._buttons[y].classList.add("muted");
			} else {
				this._buttons[y].classList.remove("muted");
			}
		}
	}
}
