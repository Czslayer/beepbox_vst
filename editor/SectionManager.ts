// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {SongDocument} from "./SongDocument.js";

export interface SongSection {
	id: string;
	startBar: number;
	endBar: number; // inclusive
	name: string;
	color: string;
	level: number; // 1 = Main Section, 2 = Sub Section, 3 = Sub-Sub Section
}

export interface SongMovement {
	id: string;
	startBar: number;
	endBar: number; // inclusive
	name: string;
	description: string;
	color: string;
}

const SECTION_COLORS_LEVEL1 = [
	"#4a6fa5",
	"#4a9b81",
	"#885ba5",
	"#a55b4a",
	"#a5884a",
	"#5a85a5",
	"#a54a78",
];

const SECTION_COLORS_LEVEL2 = [
	"#2c8ba5",
	"#2ca57b",
	"#8c3ca5",
	"#a53c52",
	"#a57b2c",
	"#2a72a5",
];

const SECTION_COLORS_LEVEL3 = [
	"#2aa5a5",
	"#2aa55b",
	"#9b2aa5",
	"#a52a6a",
	"#a58b2a",
	"#2a8ba5",
];

const MOVEMENT_COLORS = [
	"#d4af37", // Gold
	"#c07037", // Bronze
	"#50a588", // Emerald
	"#5570a5", // Sapphire
	"#a55590", // Amethyst
];

export class SectionManager {
	private static _sections: SongSection[] = [];
	private static _movements: SongMovement[] = [];

	public static getSections(): SongSection[] {
		return SectionManager._sections;
	}

	public static getSectionsByLevel(level: number): SongSection[] {
		return SectionManager._sections.filter(s => (s.level || 1) === level);
	}

	public static getMovements(): SongMovement[] {
		return SectionManager._movements;
	}

	public static addMovement(startBar: number, endBar: number, name?: string, description?: string): SongMovement {
		const sBar = Math.min(startBar, endBar);
		const eBar = Math.max(startBar, endBar);

		// Remove any overlapping movement
		SectionManager._movements = SectionManager._movements.filter(m => (m.endBar < sBar || m.startBar > eBar));

		const id = "mov_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
		const defaultName = name || ("Part " + (SectionManager._movements.length + 1));
		const defaultDesc = description || "User-marked movement description";
		const color = MOVEMENT_COLORS[SectionManager._movements.length % MOVEMENT_COLORS.length];

		const newMovement: SongMovement = {
			id,
			startBar: sBar,
			endBar: eBar,
			name: defaultName,
			description: defaultDesc,
			color
		};

		SectionManager._movements.push(newMovement);
		SectionManager._movements.sort((a, b) => a.startBar - b.startBar);
		return newMovement;
	}

	public static autoGroupMovement(doc: SongDocument): SongMovement | null {
		const startBar = doc.selection.boxSelectionBar;
		const width = doc.selection.boxSelectionWidth;
		const endBar = Math.max(startBar, startBar + width - 1);

		const partNames = ["Part 1", "Part 2", "Part 3", "Movement I", "Movement II", "Act I", "Act II"];
		const count = SectionManager._movements.length;
		const autoName = count < partNames.length ? partNames[count] : `Part ${count + 1}`;
		const autoDesc = "Fast tempo synth overture & melodic phrasing";

		const movement = SectionManager.addMovement(startBar, endBar, autoName, autoDesc);
		doc.notifier.changed();
		return movement;
	}

	public static removeMovement(id: string): void {
		SectionManager._movements = SectionManager._movements.filter(m => m.id !== id);
	}

	public static clearMovements(): void {
		SectionManager._movements = [];
	}

	public static addSection(startBar: number, endBar: number, name?: string, level: number = 1, customColor?: string): SongSection {
		const sBar = Math.min(startBar, endBar);
		const eBar = Math.max(startBar, endBar);
		const secLevel = Math.max(1, Math.min(3, level));

		SectionManager._sections = SectionManager._sections.filter(s => {
			const sLvl = s.level || 1;
			if (sLvl !== secLevel) return true;
			return (s.endBar < sBar || s.startBar > eBar);
		});

		const id = "sec_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
		const levelPrefix = secLevel === 2 ? "Sub " : secLevel === 3 ? "Sub-Sub " : "";
		const levelSections = SectionManager.getSectionsByLevel(secLevel);
		const defaultName = name || (`${levelPrefix}Section ` + (levelSections.length + 1));

		const palette = secLevel === 2 ? SECTION_COLORS_LEVEL2 : secLevel === 3 ? SECTION_COLORS_LEVEL3 : SECTION_COLORS_LEVEL1;
		const color = customColor || palette[levelSections.length % palette.length];

		const newSection: SongSection = {
			id,
			startBar: sBar,
			endBar: eBar,
			name: defaultName,
			color,
			level: secLevel
		};

		SectionManager._sections.push(newSection);
		SectionManager._sections.sort((a, b) => (a.level || 1) - (b.level || 1) || a.startBar - b.startBar);
		return newSection;
	}

	public static autoGroupSelection(doc: SongDocument, level: number = 1): SongSection | null {
		const startBar = doc.selection.boxSelectionBar;
		const width = doc.selection.boxSelectionWidth;
		const endBar = Math.max(startBar, startBar + width - 1);

		const sectionNamesLevel1 = ["Intro", "Verse 1", "Chorus 1", "Verse 2", "Chorus 2", "Bridge", "Outro"];
		const sectionNamesLevel2 = ["Section A", "Section B", "Build", "Drop", "Transition", "Break"];
		const sectionNamesLevel3 = ["Phrase A", "Phrase B", "Motif 1", "Motif 2", "Fill", "Riff"];

		const secLevel = Math.max(1, Math.min(3, level));
		const count = SectionManager.getSectionsByLevel(secLevel).length;
		const nameList = secLevel === 2 ? sectionNamesLevel2 : secLevel === 3 ? sectionNamesLevel3 : sectionNamesLevel1;
		const autoName = count < nameList.length ? nameList[count] : `Section ${count + 1}`;

		const section = SectionManager.addSection(startBar, endBar, autoName, secLevel);
		doc.notifier.changed();
		return section;
	}

	public static removeSection(id: string): void {
		SectionManager._sections = SectionManager._sections.filter(s => s.id !== id);
	}

	public static clearSections(): void {
		SectionManager._sections = [];
	}

	public static getSectionForBar(bar: number, level: number = 1): SongSection | null {
		return SectionManager._sections.find(s => (s.level || 1) === level && bar >= s.startBar && bar <= s.endBar) || null;
	}
}
