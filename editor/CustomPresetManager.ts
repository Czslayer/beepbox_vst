// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

export interface CustomPreset {
	id: string;
	name: string;
	isNoise: boolean;
	instruments: any[]; // Array of 1 to 4 instrument JSON objects
	created: number;
}

const LOCAL_STORAGE_KEY = "beepbox_custom_channel_presets";

export class CustomPresetManager {
	public static getAllPresets(): CustomPreset[] {
		try {
			const json = localStorage.getItem(LOCAL_STORAGE_KEY);
			if (json != null) {
				const data = JSON.parse(json);
				if (Array.isArray(data)) {
					return data;
				}
			}
		} catch (e) {
			console.error("Failed to load custom channel presets:", e);
		}
		return [];
	}

	public static getPresetsForChannel(isNoise: boolean): CustomPreset[] {
		return CustomPresetManager.getAllPresets().filter(p => p.isNoise === isNoise);
	}

	public static getPresetById(id: string): CustomPreset | null {
		const all = CustomPresetManager.getAllPresets();
		return all.find(p => p.id === id) || null;
	}

	public static savePreset(name: string, isNoise: boolean, instruments: any[]): CustomPreset {
		const all = CustomPresetManager.getAllPresets();
		const limitedInstruments = instruments.slice(0, 4); // Max 4 simultaneous instruments per channel preset
		const newPreset: CustomPreset = {
			id: "cp_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
			name: name.trim() || "Untitled Custom Preset",
			isNoise,
			instruments: limitedInstruments,
			created: Date.now()
		};
		all.push(newPreset);
		CustomPresetManager._persist(all);
		return newPreset;
	}

	public static deletePreset(id: string): boolean {
		const all = CustomPresetManager.getAllPresets();
		const filtered = all.filter(p => p.id !== id);
		if (filtered.length !== all.length) {
			CustomPresetManager._persist(filtered);
			return true;
		}
		return false;
	}

	public static renamePreset(id: string, newName: string): boolean {
		const all = CustomPresetManager.getAllPresets();
		const preset = all.find(p => p.id === id);
		if (preset != null) {
			preset.name = newName.trim() || preset.name;
			CustomPresetManager._persist(all);
			return true;
		}
		return false;
	}

	public static exportPresetsJson(): string {
		return JSON.stringify(CustomPresetManager.getAllPresets(), null, 2);
	}

	public static importPresetsJson(jsonString: string): number {
		try {
			const imported = JSON.parse(jsonString);
			if (!Array.isArray(imported)) return 0;
			const all = CustomPresetManager.getAllPresets();
			let addedCount = 0;
			for (const p of imported) {
				if (p && p.name && Array.isArray(p.instruments)) {
					all.push({
						id: "cp_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
						name: String(p.name).trim(),
						isNoise: Boolean(p.isNoise),
						instruments: p.instruments.slice(0, 4),
						created: p.created || Date.now()
					});
					addedCount++;
				}
			}
			if (addedCount > 0) {
				CustomPresetManager._persist(all);
			}
			return addedCount;
		} catch (e) {
			console.error("Failed to import presets:", e);
			return 0;
		}
	}

	private static _persist(presets: CustomPreset[]): void {
		try {
			localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(presets));
		} catch (e) {
			console.error("Failed to save custom presets to localStorage:", e);
		}
	}
}
