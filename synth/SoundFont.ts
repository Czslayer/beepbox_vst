// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

export interface SF2Gen {
	operator: number;
	amount: number;
}

export interface SF2Zone {
	generators: Map<number, number>;
	sampleID?: number;
	instrumentID?: number;
	keyRangeMin?: number;
	keyRangeMax?: number;
	velRangeMin?: number;
	velRangeMax?: number;
}

export interface SF2Sample {
	name: string;
	start: number;
	end: number;
	startLoop: number;
	endLoop: number;
	sampleRate: number;
	originalPitch: number;
	pitchCorrection: number;
	sampleLink: number;
	sampleType: number;
	data?: Float32Array;
}

export interface SF2Instrument {
	name: string;
	zones: SF2Zone[];
}

export interface ResolvedSampleZone {
	sample: SF2Sample;
	rootKey: number;
	fineTune: number;
	scaleTuning: number;
	startLoop: number;
	endLoop: number;
	sampleModes: number;
	attackSec: number;
	holdSec: number;
	decaySec: number;
	sustainLevel: number;
	releaseSec: number;
	filterCutoffHz: number;
	filterResonanceDb: number;
	pan: number;
}

export class SoundFontPreset {
	public name: string = "";
	public preset: number = 0;
	public bank: number = 0;
	public isDrum: boolean = false;
	public zones: SF2Zone[] = [];
	public soundFont: SoundFont;

	constructor(soundFont: SoundFont) {
		this.soundFont = soundFont;
	}

	public getDisplayName(): string {
		const bankStr: string = this.bank.toString().padStart(3, "0");
		const progStr: string = this.preset.toString().padStart(3, "0");
		return `[${bankStr}:${progStr}] ${this.name}`;
	}

	public findSampleZone(midiPitch: number, velocity: number = 100): ResolvedSampleZone | null {
		const sf = this.soundFont;
		if (!sf || sf.samples.length === 0) return null;

		let matchedSample: SF2Sample | null = null;
		let combinedGens: Map<number, number> = new Map();

		// Iterate preset zones
		for (const pZone of this.zones) {
			const pKeyMin = pZone.keyRangeMin ?? 0;
			const pKeyMax = pZone.keyRangeMax ?? 127;
			const pVelMin = pZone.velRangeMin ?? 0;
			const pVelMax = pZone.velRangeMax ?? 127;

			if (midiPitch < pKeyMin || midiPitch > pKeyMax) continue;
			if (velocity < pVelMin || velocity > pVelMax) continue;

			const instId = pZone.instrumentID ?? pZone.generators.get(41);
			if (instId === undefined || instId < 0 || instId >= sf.instruments.length) continue;

			const inst = sf.instruments[instId];
			let instGlobalGens: Map<number, number> = new Map();

			for (const iZone of inst.zones) {
				const sId = iZone.sampleID ?? iZone.generators.get(53);
				if (sId === undefined) {
					// Instrument global zone
					instGlobalGens = iZone.generators;
					continue;
				}

				const iKeyMin = iZone.keyRangeMin ?? 0;
				const iKeyMax = iZone.keyRangeMax ?? 127;
				const iVelMin = iZone.velRangeMin ?? 0;
				const iVelMax = iZone.velRangeMax ?? 127;

				if (midiPitch < iKeyMin || midiPitch > iKeyMax) continue;
				if (velocity < iVelMin || velocity > iVelMax) continue;

				if (sId >= 0 && sId < sf.samples.length) {
					matchedSample = sf.samples[sId];

					// Merge generators: preset zone -> inst global -> inst zone
					for (const [k, v] of pZone.generators) combinedGens.set(k, v);
					for (const [k, v] of instGlobalGens) combinedGens.set(k, v);
					for (const [k, v] of iZone.generators) combinedGens.set(k, v);
					break;
				}
			}

			if (matchedSample != null) break;
		}

		// Fallback: pick closest sample
		if (matchedSample == null) {
			const fallback = this.getPrimarySampleAndZone();
			matchedSample = fallback.sample;
			if (fallback.zone) combinedGens = fallback.zone.generators;
		}

		if (matchedSample == null || !matchedSample.data || matchedSample.data.length === 0) return null;

		// Generator values
		const rootKeyGen = combinedGens.get(58); // overridingRootKey
		const rootKey = (rootKeyGen !== undefined && rootKeyGen >= 0 && rootKeyGen <= 127) ? rootKeyGen : (matchedSample.originalPitch ?? 60);
		const fineTuneGen = combinedGens.get(52) ?? 0; // fineTune (cents)
		const coarseTuneGen = combinedGens.get(51) ?? 0; // coarseTune (semitones)
		const fineTune = fineTuneGen + coarseTuneGen * 100 + (matchedSample.pitchCorrection ?? 0);
		const scaleTuning = combinedGens.get(56) ?? 100; // scaleTuning in cents/key

		// Sample mode & loops
		const sampleModes = combinedGens.get(54) ?? 0;
		const startLoopOffset = (combinedGens.get(2) ?? 0) + ((combinedGens.get(45) ?? 0) << 15);
		const endLoopOffset = (combinedGens.get(3) ?? 0) + ((combinedGens.get(50) ?? 0) << 15);
		const startLoop = Math.max(0, matchedSample.startLoop - matchedSample.start + startLoopOffset);
		const endLoop = Math.max(startLoop + 16, Math.min(matchedSample.data.length, matchedSample.endLoop - matchedSample.start + endLoopOffset));

		// Volume Envelope (gen 34=attack, 35=hold, 36=decay, 37=sustain, 38=release)
		const attackTc = combinedGens.get(34) ?? -12000;
		const holdTc = combinedGens.get(35) ?? -12000;
		const decayTc = combinedGens.get(36) ?? -12000;
		const sustainCb = combinedGens.get(37) ?? 0; // centibels attenuation
		const releaseTc = combinedGens.get(38) ?? -12000;

		const attackSec = attackTc <= -11900 ? 0.002 : Math.max(0.001, Math.min(10.0, Math.pow(2.0, attackTc / 1200.0)));
		const holdSec = holdTc <= -11900 ? 0.0 : Math.max(0.0, Math.min(10.0, Math.pow(2.0, holdTc / 1200.0)));
		const decaySec = decayTc <= -11900 ? 0.2 : Math.max(0.01, Math.min(20.0, Math.pow(2.0, decayTc / 1200.0)));
		const sustainLevel = Math.max(0.0, Math.min(1.0, Math.pow(10.0, -sustainCb / 200.0)));
		const releaseSec = releaseTc <= -11900 ? 0.15 : Math.max(0.01, Math.min(20.0, Math.pow(2.0, releaseTc / 1200.0)));

		// Filter (gen 8=initialFilterFc, 9=initialFilterQ)
		const filterFcCents = combinedGens.get(8) ?? 13500;
		const filterCutoffHz = Math.max(20.0, Math.min(20000.0, 8.176 * Math.pow(2.0, filterFcCents / 1200.0)));
		const filterResonanceDb = (combinedGens.get(9) ?? 0) / 10.0;

		// Pan (gen 17: -500 to +500)
		const panVal = (combinedGens.get(17) ?? 0) / 500.0;

		return {
			sample: matchedSample,
			rootKey,
			fineTune,
			scaleTuning,
			startLoop,
			endLoop,
			sampleModes,
			attackSec,
			holdSec,
			decaySec,
			sustainLevel,
			releaseSec,
			filterCutoffHz,
			filterResonanceDb,
			pan: panVal,
		};
	}

	public getPrimarySampleAndZone(): {sample: SF2Sample | null, zone: SF2Zone | null} {
		if (this.soundFont.samples.length == 0) return {sample: null, zone: null};

		let bestSample: SF2Sample | null = null;
		let bestZone: SF2Zone | null = null;
		let minPitchDiff: number = 999;

		for (const pZone of this.zones) {
			const instId = pZone.instrumentID ?? pZone.generators.get(41);
			if (instId !== undefined && instId >= 0 && instId < this.soundFont.instruments.length) {
				const inst = this.soundFont.instruments[instId];
				for (const iZone of inst.zones) {
					const sId = iZone.sampleID ?? iZone.generators.get(53);
					if (sId !== undefined && sId >= 0 && sId < this.soundFont.samples.length) {
						const sample = this.soundFont.samples[sId];
						const rootKey = iZone.generators.get(58) ?? sample.originalPitch;
						const diff = Math.abs(rootKey - 60);
						if (diff < minPitchDiff) {
							minPitchDiff = diff;
							bestSample = sample;
							bestZone = iZone;
						}
					}
				}
			}
		}

		if (bestSample == null && this.soundFont.samples.length > 0) {
			bestSample = this.soundFont.samples[0];
		}

		return {sample: bestSample, zone: bestZone};
	}

	public toSoundFontInstrumentObject(): any {
		return {
			type: "soundfont",
			soundfontName: this.soundFont.name || "SoundFont",
			soundfontBank: this.bank,
			soundfontProgram: this.preset,
			soundfontIsDrum: this.isDrum || this.bank === 128,
			volume: 0,
			fadeInSeconds: 0,
			fadeOutTicks: -3,
			effects: ["reverb"],
			reverb: 25,
			envelopes: [],
		};
	}

	public toInstrumentObject(synthMode: string = "soundfont", isNoiseChannel: boolean = false): any {
		if (synthMode === "soundfont" || synthMode === "" || !synthMode) {
			const obj = this.toSoundFontInstrumentObject();
			if (isNoiseChannel) obj.soundfontIsDrum = true;
			return obj;
		}

		if (isNoiseChannel || this.isDrum || this.bank === 128) {
			return {
				type: "drumset",
				volume: 0,
				fadeInSeconds: 0,
				fadeOutTicks: -3,
				effects: ["reverb"],
				reverb: 25,
				envelopes: [],
				drumsetEnvelopes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				drumsetSpectrums: Array.from({length: 12}, () => new Array(30).fill(0)),
			};
		}

		return this.toSoundFontInstrumentObject();
	}
}

export class SoundFontRegistry {
	private static _soundFonts: SoundFont[] = [];
	private static _presetsByBankProg: Map<string, SoundFontPreset> = new Map();
	private static _presetsByName: Map<string, SoundFontPreset> = new Map();

	public static register(sf: SoundFont): void {
		if (!sf) return;
		const existingIdx = SoundFontRegistry._soundFonts.findIndex(s => s.name === sf.name);
		if (existingIdx !== -1) {
			SoundFontRegistry._soundFonts[existingIdx] = sf;
		} else {
			SoundFontRegistry._soundFonts.push(sf);
		}

		for (const preset of sf.presets) {
			const key = `${preset.bank}_${preset.preset}_${preset.isDrum ? "drum" : "pitch"}`;
			SoundFontRegistry._presetsByBankProg.set(key, preset);
			SoundFontRegistry._presetsByName.set(preset.name.toLowerCase(), preset);
			if (preset.soundFont && preset.soundFont.name) {
				SoundFontRegistry._presetsByName.set(`${preset.soundFont.name.toLowerCase()}:${preset.name.toLowerCase()}`, preset);
			}
		}
	}

	public static getSoundFonts(): SoundFont[] {
		return SoundFontRegistry._soundFonts;
	}

	public static getPreset(bank: number, program: number, isDrum: boolean = false): SoundFontPreset | null {
		const key = `${bank}_${program}_${isDrum ? "drum" : "pitch"}`;
		const direct = SoundFontRegistry._presetsByBankProg.get(key);
		if (direct) return direct;

		// Fallback without drum tag
		for (const p of SoundFontRegistry._presetsByBankProg.values()) {
			if (p.bank === bank && p.preset === program) return p;
		}

		// Fallback by program only if bank 0
		for (const p of SoundFontRegistry._presetsByBankProg.values()) {
			if (p.preset === program && p.isDrum === isDrum) return p;
		}

		// Fallback to first available preset
		const all = Array.from(SoundFontRegistry._presetsByBankProg.values());
		return all.length > 0 ? all[0] : null;
	}

	public static getPresetByName(name: string): SoundFontPreset | null {
		if (!name) return null;
		const lower = name.toLowerCase().trim();
		if (SoundFontRegistry._presetsByName.has(lower)) {
			return SoundFontRegistry._presetsByName.get(lower)!;
		}
		for (const [k, v] of SoundFontRegistry._presetsByName.entries()) {
			if (k.includes(lower) || lower.includes(k)) return v;
		}
		return null;
	}

	public static clear(): void {
		SoundFontRegistry._soundFonts = [];
		SoundFontRegistry._presetsByBankProg.clear();
		SoundFontRegistry._presetsByName.clear();
	}
}

export class SoundFont {
	public name: string = "";
	public author: string = "";
	public copyright: string = "";
	public date: string = "";
	public comments: string = "";
	public tools: string = "";
	public presets: SoundFontPreset[] = [];
	public instruments: SF2Instrument[] = [];
	public samples: SF2Sample[] = [];

	public static parse(buffer: ArrayBuffer, fileName: string = "SoundFont"): SoundFont {
		const sf: SoundFont = new SoundFont();
		sf.name = fileName.replace(/\.[^/.]+$/, "");

		const view: DataView = new DataView(buffer);
		let offset = 0;

		function readFourCC(): string {
			if (offset + 4 > buffer.byteLength) return "";
			let s = "";
			for (let i = 0; i < 4; i++) {
				s += String.fromCharCode(view.getUint8(offset + i));
			}
			offset += 4;
			return s;
		}

		function readUint32LE(): number {
			if (offset + 4 > buffer.byteLength) return 0;
			const v = view.getUint32(offset, true);
			offset += 4;
			return v;
		}

		function readUint16LE(): number {
			if (offset + 2 > buffer.byteLength) return 0;
			const v = view.getUint16(offset, true);
			offset += 2;
			return v;
		}

		function readInt16LE(): number {
			if (offset + 2 > buffer.byteLength) return 0;
			const v = view.getInt16(offset, true);
			offset += 2;
			return v;
		}

		function readString(length: number): string {
			let s = "";
			const end = Math.min(buffer.byteLength, offset + length);
			for (let i = offset; i < end; i++) {
				const code = view.getUint8(i);
				if (code === 0) break;
				s += String.fromCharCode(code);
			}
			offset += length;
			return s.trim();
		}

		// RIFF Header
		const riff = readFourCC();
		if (riff !== "RIFF") throw new Error("Not a valid RIFF file: " + riff);
		const fileSize = readUint32LE();
		const sfbk = readFourCC();
		if (sfbk !== "sfbk") throw new Error("Not a SoundFont bank: " + sfbk);

		let smplData: Int16Array | null = null;
		const rawPhdr: any[] = [];
		const rawPbag: any[] = [];
		const rawPgen: SF2Gen[] = [];
		const rawInst: any[] = [];
		const rawIbag: any[] = [];
		const rawIgen: SF2Gen[] = [];
		const rawShdr: SF2Sample[] = [];

		while (offset < buffer.byteLength && offset < fileSize + 8) {
			const list = readFourCC();
			if (list !== "LIST") {
				offset += 4;
				continue;
			}
			const listSize = readUint32LE();
			const listEnd = offset + listSize;
			const listType = readFourCC();

			if (listType === "INFO") {
				while (offset < listEnd) {
					const chunkId = readFourCC();
					const chunkSize = readUint32LE();
					const chunkEnd = offset + chunkSize;

					if (chunkId === "INAM") sf.name = readString(chunkSize);
					else if (chunkId === "IENG") sf.author = readString(chunkSize);
					else if (chunkId === "ICOP") sf.copyright = readString(chunkSize);
					else if (chunkId === "ICRD") sf.date = readString(chunkSize);
					else if (chunkId === "ICMT") sf.comments = readString(chunkSize);
					else if (chunkId === "ISFT") sf.tools = readString(chunkSize);

					offset = Math.min(listEnd, (chunkEnd + 1) & ~1);
				}
			} else if (listType === "sdta") {
				while (offset < listEnd) {
					const chunkId = readFourCC();
					const chunkSize = readUint32LE();
					const chunkEnd = offset + chunkSize;

					if (chunkId === "smpl") {
						const sampleCount = chunkSize / 2;
						smplData = new Int16Array(buffer, offset, sampleCount);
					}
					offset = Math.min(listEnd, (chunkEnd + 1) & ~1);
				}
			} else if (listType === "pdta") {
				while (offset < listEnd) {
					const chunkId = readFourCC();
					const chunkSize = readUint32LE();
					const chunkEnd = offset + chunkSize;

					if (chunkId === "phdr") {
						const count = chunkSize / 38;
						for (let i = 0; i < count; i++) {
							const name = readString(20);
							const preset = readUint16LE();
							const bank = readUint16LE();
							const bagNdx = readUint16LE();
							const library = readUint32LE();
							const genre = readUint32LE();
							const morphology = readUint32LE();
							rawPhdr.push({name, preset, bank, bagNdx, library, genre, morphology});
						}
					} else if (chunkId === "pbag") {
						const count = chunkSize / 4;
						for (let i = 0; i < count; i++) {
							const genNdx = readUint16LE();
							const modNdx = readUint16LE();
							rawPbag.push({genNdx, modNdx});
						}
					} else if (chunkId === "pgen") {
						const count = chunkSize / 4;
						for (let i = 0; i < count; i++) {
							const operator = readUint16LE();
							const amount = readInt16LE();
							rawPgen.push({operator, amount});
						}
					} else if (chunkId === "inst") {
						const count = chunkSize / 22;
						for (let i = 0; i < count; i++) {
							const name = readString(20);
							const bagNdx = readUint16LE();
							rawInst.push({name, bagNdx});
						}
					} else if (chunkId === "ibag") {
						const count = chunkSize / 4;
						for (let i = 0; i < count; i++) {
							const genNdx = readUint16LE();
							const modNdx = readUint16LE();
							rawIbag.push({genNdx, modNdx});
						}
					} else if (chunkId === "igen") {
						const count = chunkSize / 4;
						for (let i = 0; i < count; i++) {
							const operator = readUint16LE();
							const amount = readInt16LE();
							rawIgen.push({operator, amount});
						}
					} else if (chunkId === "shdr") {
						const count = chunkSize / 46;
						for (let i = 0; i < count; i++) {
							const name = readString(20);
							const start = readUint32LE();
							const end = readUint32LE();
							const startLoop = readUint32LE();
							const endLoop = readUint32LE();
							const sampleRate = readUint32LE();
							const originalPitch = view.getUint8(offset); offset += 1;
							const pitchCorrection = view.getInt8(offset); offset += 1;
							const sampleLink = readUint16LE();
							const sampleType = readUint16LE();
							rawShdr.push({name, start, end, startLoop, endLoop, sampleRate, originalPitch, pitchCorrection, sampleLink, sampleType});
						}
					}

					offset = Math.min(listEnd, (chunkEnd + 1) & ~1);
				}
			}

			offset = Math.min(buffer.byteLength, (listEnd + 1) & ~1);
		}

		// Convert raw sample PCM to Float32Array
		for (let s = 0; s < rawShdr.length - 1; s++) {
			const sh = rawShdr[s];
			if (smplData && sh.end > sh.start && sh.end <= smplData.length) {
				const len = sh.end - sh.start;
				const floatData = new Float32Array(len);
				for (let i = 0; i < len; i++) {
					floatData[i] = smplData[sh.start + i] / 32768.0;
				}
				sh.data = floatData;
			}
			sf.samples.push(sh);
		}

		// Build Instruments
		for (let i = 0; i < rawInst.length - 1; i++) {
			const instRecord = rawInst[i];
			const nextInstRecord = rawInst[i + 1];
			const startBag = instRecord.bagNdx;
			const endBag = nextInstRecord ? nextInstRecord.bagNdx : rawIbag.length - 1;
			const instObj: SF2Instrument = {name: instRecord.name, zones: []};

			for (let b = startBag; b < endBag; b++) {
				if (b >= rawIbag.length - 1) break;
				const bag = rawIbag[b];
				const nextBag = rawIbag[b + 1];
				const startGen = bag.genNdx;
				const endGen = nextBag ? nextBag.genNdx : rawIgen.length;
				const zone: SF2Zone = {generators: new Map()};

				for (let g = startGen; g < endGen; g++) {
					if (g >= rawIgen.length) break;
					const gen = rawIgen[g];
					zone.generators.set(gen.operator, gen.amount);

					if (gen.operator === 43) {
						const u = gen.amount & 0xffff;
						zone.keyRangeMin = u & 0xff;
						zone.keyRangeMax = (u >> 8) & 0xff;
					} else if (gen.operator === 44) {
						const u = gen.amount & 0xffff;
						zone.velRangeMin = u & 0xff;
						zone.velRangeMax = (u >> 8) & 0xff;
					} else if (gen.operator === 53) {
						zone.sampleID = gen.amount & 0xffff;
					}
				}
				instObj.zones.push(zone);
			}
			sf.instruments.push(instObj);
		}

		// Build Presets
		for (let p = 0; p < rawPhdr.length - 1; p++) {
			const pRecord = rawPhdr[p];
			const nextPRecord = rawPhdr[p + 1];
			const startBag = pRecord.bagNdx;
			const endBag = nextPRecord ? nextPRecord.bagNdx : rawPbag.length - 1;

			const preset = new SoundFontPreset(sf);
			preset.name = pRecord.name;
			preset.preset = pRecord.preset;
			preset.bank = pRecord.bank;
			preset.isDrum = (pRecord.bank === 128) || pRecord.name.toLowerCase().includes("drum") || pRecord.name.toLowerCase().includes("kit");

			for (let b = startBag; b < endBag; b++) {
				if (b >= rawPbag.length - 1) break;
				const bag = rawPbag[b];
				const nextBag = rawPbag[b + 1];
				const startGen = bag.genNdx;
				const endGen = nextBag ? nextBag.genNdx : rawPgen.length;
				const zone: SF2Zone = {generators: new Map()};

				for (let g = startGen; g < endGen; g++) {
					if (g >= rawPgen.length) break;
					const gen = rawPgen[g];
					zone.generators.set(gen.operator, gen.amount);

					if (gen.operator === 41) {
						zone.instrumentID = gen.amount & 0xffff;
					} else if (gen.operator === 43) {
						const u = gen.amount & 0xffff;
						zone.keyRangeMin = u & 0xff;
						zone.keyRangeMax = (u >> 8) & 0xff;
					} else if (gen.operator === 44) {
						const u = gen.amount & 0xffff;
						zone.velRangeMin = u & 0xff;
						zone.velRangeMax = (u >> 8) & 0xff;
					}
				}
				preset.zones.push(zone);
			}

			sf.presets.push(preset);
		}

		sf.presets.sort((a, b) => {
			if (a.bank !== b.bank) return a.bank - b.bank;
			return a.preset - b.preset;
		});

		// Register in global registry
		SoundFontRegistry.register(sf);

		return sf;
	}
}
