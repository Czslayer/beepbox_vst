// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {SongDocument} from "./SongDocument.js";
import {Config} from "../synth/synth.js";
import {HTML} from "imperative-html/dist/esm/elements-strict.js";

const ABSOLUTE_PITCH_NAMES: string[] = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export class ChordDetector {
	public readonly container: HTMLDivElement;
	private readonly _channelHeaderSpan: HTMLSpanElement;
	private readonly _textSpan: HTMLSpanElement;
	private readonly _historyContainer: HTMLDivElement;
	private _lastText: string = "";
	private _lastChannel: number = -1;
	private _lastPart: number = -1;
	private _channelHistories: Map<number, string[]> = new Map();
	private _animationFrameId: number | null = null;

	constructor(private _doc: SongDocument) {
		this._channelHeaderSpan = HTML.span({style: "color: #88bbff; font-weight: 600; margin-right: 4px;"}, "🎹 Ch 1:");
		this._textSpan = HTML.span({style: "font-weight: bold; color: #ffffff;"}, "No Chord");
		this._historyContainer = HTML.div({
			style: `
				display: flex;
				flex-direction: column;
				gap: 2px;
				margin-top: 4px;
				padding-top: 4px;
				border-top: 1px solid rgba(255, 255, 255, 0.15);
				font-size: 10px;
			`
		});

		this.container = HTML.div({
			class: "chord-detector-badge",
			style: `
				position: absolute;
				top: 4px;
				left: 6px;
				z-index: 25;
				background: rgba(18, 18, 26, 0.92);
				border: 1px solid rgba(255, 255, 255, 0.2);
				border-radius: 5px;
				padding: 4px 8px;
				font-size: 11px;
				font-family: monospace, sans-serif;
				color: #88bbff;
				pointer-events: none;
				box-shadow: 0 2px 6px rgba(0,0,0,0.4);
				display: flex;
				flex-direction: column;
				white-space: nowrap;
				min-width: 130px;
				max-width: 180px;
			`
		},
			HTML.div({style: "display: flex; align-items: center;"},
				this._channelHeaderSpan,
				this._textSpan
			),
			this._historyContainer
		);

		this._renderHistory();
		this._doc.notifier.watch(this._update);
		this._animate();
	}

	private _animate = (): void => {
		if (this._doc.synth.playing) {
			this._update();
		}
		this._animationFrameId = window.requestAnimationFrame(this._animate);
	}

	public update(): void {
		this._update();
	}

	private _update = (): void => {
		const currentChannel = this._doc.channel;
		if (this._lastChannel !== currentChannel) {
			this._lastChannel = currentChannel;
			this._lastText = "";
			this._lastPart = -1;
			this._renderHistory();
		}

		const isNoise = this._doc.song ? this._doc.song.getChannelIsNoise(currentChannel) : false;
		const channel = this._doc.song ? this._doc.song.channels[currentChannel] : null;
		const chName = channel && channel.name ? ` (${channel.name})` : "";
		const headerText = isNoise 
			? `🥁 Ch ${currentChannel + 1}${chName}:` 
			: `🎹 Ch ${currentChannel + 1}${chName}:`;
		if (this._channelHeaderSpan.textContent !== headerText) {
			this._channelHeaderSpan.textContent = headerText;
		}

		if (isNoise) {
			if (this._textSpan.textContent !== "Rhythm") {
				this._textSpan.textContent = "Rhythm";
			}
			return;
		}

		if (this._doc.synth.playing && this._doc.song) {
			const partsPerBar = this._doc.song.beatsPerBar * Config.partsPerBeat;
			const currentPart = Math.floor(this._doc.synth.playhead * partsPerBar);
			if (currentPart === this._lastPart) {
				return;
			}
			this._lastPart = currentPart;
		}

		const chordName = this._detectCurrentChannelChord(currentChannel);
		if (chordName !== this._lastText) {
			this._lastText = chordName;
			this._textSpan.textContent = chordName;

			if (chordName !== "No Chord") {
				let history = this._channelHistories.get(currentChannel);
				if (!history) {
					history = [];
					this._channelHistories.set(currentChannel, history);
				}
				if (history.length === 0 || history[history.length - 1] !== chordName) {
					history.push(chordName);
					if (history.length > 5) {
						history.shift();
					}
					this._renderHistory();
				}
			}
		}
	}

	private _getHistoryForCurrentChannel(): string[] {
		return this._channelHistories.get(this._doc.channel) || [];
	}

	private _renderHistory(): void {
		while (this._historyContainer.firstChild) {
			this._historyContainer.removeChild(this._historyContainer.firstChild);
		}

		const history = this._getHistoryForCurrentChannel();
		const currentChan = this._doc.song ? this._doc.song.channels[this._doc.channel] : null;
		const chName = currentChan && currentChan.name ? ` (${currentChan.name})` : "";
		const header = HTML.div({
			style: "color: #88aaee; font-weight: 600; font-size: 9px; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;"
		}, `Ch ${this._doc.channel + 1}${chName} Progression:`);
		this._historyContainer.appendChild(header);

		if (history.length === 0) {
			this._historyContainer.appendChild(
				HTML.div({style: "color: rgba(255, 255, 255, 0.4); font-size: 9px; italic;"}, "(play notes to log)")
			);
			return;
		}

		for (let i = 0; i < history.length; i++) {
			const isLatest = i === history.length - 1;
			const row = HTML.div({
				style: `
					display: flex;
					align-items: center;
					padding: 1px 4px;
					border-radius: 3px;
					background: ${isLatest ? "rgba(136, 187, 255, 0.22)" : "rgba(255, 255, 255, 0.05)"};
					color: ${isLatest ? "#ffffff" : "#bbbbdd"};
					font-weight: ${isLatest ? "bold" : "normal"};
					font-size: 10px;
				`
			},
				HTML.span({style: "opacity: 0.6; margin-right: 5px; font-size: 9px; font-weight: normal;"}, `${i + 1}.`),
				HTML.span({style: "flex-grow: 1; overflow: hidden; text-overflow: ellipsis;"}, history[i])
			);
			this._historyContainer.appendChild(row);
		}
	}

	private _detectCurrentChannelChord(channelIndex: number): string {
		const song = this._doc.song;
		if (!song) return "No Chord";

		const activePitches: number[] = [];

		// Determine current part/tick
		const partsPerBeat = Config.partsPerBeat;
		const partsPerBar = song.beatsPerBar * partsPerBeat;
		let currentPart = 0;

		if (this._doc.synth.playing) {
			currentPart = Math.floor(this._doc.synth.playhead * partsPerBar);
		} else {
			currentPart = this._doc.bar * partsPerBar;
		}

		const currentBar = Math.floor(currentPart / partsPerBar);
		const partInBar = currentPart % partsPerBar;

		// Collect pitches ONLY from this channel
		const pattern = song.getPattern(channelIndex, currentBar);
		if (pattern != null) {
			for (const note of pattern.notes) {
				if (note.start <= partInBar && note.end > partInBar) {
					for (const pitch of note.pitches) {
						activePitches.push(pitch);
					}
				}
			}
		}

		// Also check live input pitches if live input channel is this channel
		if (this._doc.synth.liveInputChannel === channelIndex && this._doc.synth.liveInputPitches && this._doc.synth.liveInputPitches.length > 0) {
			for (const p of this._doc.synth.liveInputPitches) {
				activePitches.push(p);
			}
		}

		// Fallback when stopped and no active note at exact part: check current pattern notes for this channel
		if (activePitches.length === 0 && !this._doc.synth.playing && this._doc.channel === channelIndex) {
			const pattern = this._doc.getCurrentPattern();
			if (pattern != null) {
				for (const note of pattern.notes) {
					if (note.start === 0 || pattern.notes.length <= 4) {
						for (const pitch of note.pitches) {
							activePitches.push(pitch);
						}
					}
				}
			}
		}

		if (activePitches.length === 0) {
			return "No Chord";
		}

		activePitches.sort((a, b) => a - b);

		const basePitch = Config.keys[song.key]?.basePitch ?? 12;
		const pitchClasses: number[] = [];
		for (const p of activePitches) {
			const absPitch = basePitch + p;
			const pc = ((absPitch % 12) + 12) % 12;
			if (pitchClasses.indexOf(pc) === -1) {
				pitchClasses.push(pc);
			}
		}

		const lowestPitch = activePitches[0];
		const bassPc = (((basePitch + lowestPitch) % 12) + 12) % 12;

		const pitchNames = ChordDetector.getKeyPitchNames(song.key);

		return ChordDetector.identifyChord(pitchClasses, bassPc, pitchNames);
	}

	public static getKeyPitchNames(keyIndex: number): string[] {
		// Key indices that conventionally prefer flats (e.g. Eb, F, Ab, Bb)
		const useFlats = (keyIndex === 3 || keyIndex === 5 || keyIndex === 8 || keyIndex === 10);
		if (useFlats) {
			return ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
		}
		return ABSOLUTE_PITCH_NAMES;
	}

	public static identifyChord(pitchClasses: number[], bassPc: number, pitchNames: string[]): string {
		if (pitchClasses.length === 0) return "No Chord";
		if (pitchClasses.length === 1) return `${pitchNames[pitchClasses[0]]} Note`;

		let bestMatch: {root: number; name: string; score: number} | null = null;

		for (const rootPc of pitchClasses) {
			const relativeSet = new Set<number>();
			for (const pc of pitchClasses) {
				relativeSet.add((pc - rootPc + 12) % 12);
			}

			const chordType = ChordDetector.getChordType(relativeSet);
			if (chordType != null) {
				const score = chordType.priority + (rootPc === bassPc ? 10 : 0);
				if (bestMatch == null || score > bestMatch.score) {
					bestMatch = {root: rootPc, name: chordType.name, score};
				}
			}
		}

		if (bestMatch == null) {
			if (pitchClasses.length === 2) {
				const interval = (pitchClasses[1] - pitchClasses[0] + 12) % 12;
				const rootName = pitchNames[pitchClasses[0]];
				if (interval === 7) return `${rootName}5`;
				if (interval === 4) return `${rootName} Maj3`;
				if (interval === 3) return `${rootName} Min3`;
				if (interval === 5) return `${rootName} 4th`;
				if (interval === 6) return `${rootName} Tritone`;
				return `${pitchNames[pitchClasses[0]]}+${pitchNames[pitchClasses[1]]}`;
			}
			return `${pitchNames[bassPc]} (Cluster)`;
		}

		const rootName = pitchNames[bestMatch.root];
		let chordLabel = `${rootName} ${bestMatch.name}`.trim();

		if (bestMatch.root !== bassPc) {
			chordLabel += `/${pitchNames[bassPc]}`;
		}

		return chordLabel;
	}

	private static getChordType(set: Set<number>): {name: string; priority: number} | null {
		const has = (n: number) => set.has(n);
		const size = set.size;

		if (has(0) && has(4) && has(7) && size === 3) return {name: "Major", priority: 100};
		if (has(0) && has(3) && has(7) && size === 3) return {name: "Minor", priority: 100};
		if (has(0) && has(3) && has(6) && size === 3) return {name: "Diminished", priority: 95};
		if (has(0) && has(4) && has(8) && size === 3) return {name: "Augmented", priority: 95};
		if (has(0) && has(5) && has(7) && size === 3) return {name: "sus4", priority: 90};
		if (has(0) && has(2) && has(7) && size === 3) return {name: "sus2", priority: 90};
		if (has(0) && has(7) && size === 2) return {name: "5", priority: 80};

		if (has(0) && has(4) && has(7) && has(10)) return {name: "7", priority: 110};
		if (has(0) && has(4) && has(7) && has(11)) return {name: "maj7", priority: 110};
		if (has(0) && has(3) && has(7) && has(10)) return {name: "m7", priority: 110};
		if (has(0) && has(3) && has(7) && has(11)) return {name: "m(maj7)", priority: 105};
		if (has(0) && has(3) && has(6) && has(10)) return {name: "m7♭5", priority: 105};
		if (has(0) && has(3) && has(6) && has(9)) return {name: "dim7", priority: 105};
		if (has(0) && has(4) && has(8) && has(11)) return {name: "aug(maj7)", priority: 100};
		if (has(0) && has(4) && has(7) && has(9)) return {name: "6", priority: 100};
		if (has(0) && has(3) && has(7) && has(9)) return {name: "m6", priority: 100};
		if (has(0) && has(2) && has(4) && has(7)) return {name: "add9", priority: 100};
		if (has(0) && has(2) && has(3) && has(7)) return {name: "m(add9)", priority: 100};

		if (has(0) && has(2) && has(4) && has(7) && has(11)) return {name: "maj9", priority: 120};
		if (has(0) && has(2) && has(4) && has(7) && has(10)) return {name: "9", priority: 120};
		if (has(0) && has(2) && has(3) && has(7) && has(10)) return {name: "m9", priority: 120};

		if (has(0) && has(4) && !has(7)) return {name: "Major (no 5th)", priority: 70};
		if (has(0) && has(3) && !has(7)) return {name: "Minor (no 5th)", priority: 70};

		return null;
	}

	public cleanUp(): void {
		if (this._animationFrameId != null) {
			window.cancelAnimationFrame(this._animationFrameId);
		}
	}
}
