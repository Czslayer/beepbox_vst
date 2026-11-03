// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {SongDocument} from "./SongDocument.js";
import {RecoveredSong, RecoveredVersion, SongRecovery, versionToKey} from "./SongRecovery.js";
import {Prompt} from "./Prompt.js";
import {HTML} from "imperative-html/dist/esm/elements-strict.js";
import {ChangeSong} from "./changes.js";

const {button, div, h2, p, select, option, iframe} = HTML;

export class SongRecoveryPrompt implements Prompt {
	private readonly _songContainer: HTMLDivElement = div();
	private readonly _cancelButton: HTMLButtonElement = button({class: "cancelButton"});
	
	public readonly container: HTMLDivElement = div({class: "prompt", style: "width: 300px;"},
		h2("Song Recovery"),
		div({style: "max-height: 385px; overflow-y: auto;"},
			p("This is a TEMPORARY list of songs you have recently modified. Please keep your own backups of songs you care about!"),
			this._songContainer,
			p("(If \"Display Song Data in URL\" is enabled in your preferences, then you may also be able to find song versions in your browser history. However, song recovery won't work if you were browsing in private/incognito mode.)"),
		),
		this._cancelButton,
	);
	
	constructor(private _doc: SongDocument) {
		this._cancelButton.addEventListener("click", this._close);
		window.addEventListener("message", this._onMessage);
		
		const songs: RecoveredSong[] = SongRecovery.getAllRecoveredSongs();
		
		if (songs.length == 0) {
			this._songContainer.appendChild(p("There are no recovered songs available yet. Try making a song!"));
		}
		
		for (const song of songs) {
			const versionMenu: HTMLSelectElement = select({style: "width: 100%;"});
			
			for (const version of song.versions) {
				versionMenu.appendChild(option({value: version.time}, new Date(version.time).toLocaleString()));
			}
			
			const player: HTMLIFrameElement = iframe({style: "width: 100%; height: 60px; border: none; display: block;"});
			player.src = "player/#song=" + window.localStorage.getItem(versionToKey(song.versions[0]));
			
			const loadButton: HTMLButtonElement = button({style: "width: 100%; height: 26px; margin: 4px 0 8px 0; cursor: pointer;"}, "Load This Version");
			loadButton.addEventListener("click", () => {
				const version: RecoveredVersion = song.versions[versionMenu.selectedIndex];
				const songData: string | null = window.localStorage.getItem(versionToKey(version));
				if (songData) {
					this._loadSong(songData);
				}
			});

			const container: HTMLDivElement = div({style: "margin: 6px 0; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.15);"},
				div({class: "selectContainer", style: "width: 100%; margin: 2px 0;"}, versionMenu),
				player,
				loadButton
			);
			this._songContainer.appendChild(container);
			
			versionMenu.addEventListener("change", () => {
				const version: RecoveredVersion = song.versions[versionMenu.selectedIndex];
				player.contentWindow!.location.replace("player/#song=" + window.localStorage.getItem(versionToKey(version)));
				player.contentWindow!.dispatchEvent(new Event("hashchange"));
			});
		}
	}
	
	private _loadSong = (songData: string): void => {
		this._doc.prompt = null;
		this._doc.goBackToStart();
		this._doc.record(new ChangeSong(this._doc, songData));
	};

	private _onMessage = (event: MessageEvent): void => {
		if (event.data && event.data.type === "beepboxLoadSong" && typeof event.data.song === "string") {
			this._loadSong(event.data.song);
		}
	};

	private _close = (): void => { 
		this._doc.undo();
	};
	
	public cleanUp = (): void => { 
		this._cancelButton.removeEventListener("click", this._close);
		window.removeEventListener("message", this._onMessage);
	};
}
