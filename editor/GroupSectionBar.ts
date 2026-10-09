// Copyright (c) John Nesky and contributing authors, distributed under the MIT license, see accompanying the LICENSE.md file.

import {SongDocument} from "./SongDocument.js";
import {SectionManager} from "./SectionManager.js";
import {ColorConfig} from "./ColorConfig.js";
import {HTML} from "imperative-html/dist/esm/elements-strict.js";

const {div, button, span} = HTML;

export class GroupSectionBar {
	public readonly headerContainer: HTMLDivElement;
	public readonly trackContainer: HTMLDivElement;
	private _renderedBarWidth: number = -1;
	private _renderedBarCount: number = -1;
	private _renderedSectionsJson: string = "";
	private _renderedMovementsJson: string = "";

	constructor(private _doc: SongDocument) {
		const addPartBtn = button({
			type: "button",
			title: "Mark a Song Part / Movement with description (🎭)",
			style: `
				height: 16px;
				background: rgba(212, 175, 55, 0.4);
				border: 1px solid rgba(255, 215, 0, 0.6);
				border-radius: 2px;
				color: #ffd700;
				font-size: 9px;
				font-weight: bold;
				cursor: pointer;
				padding: 0 4px;
				display: flex;
				align-items: center;
			`
		}, "🎭 Part");

		const addMainBtn = button({
			type: "button",
			title: "Group highlighted bars into a Main Section (Level 1)",
			style: `
				height: 16px;
				background: rgba(74, 111, 165, 0.4);
				border: 1px solid rgba(136, 187, 255, 0.5);
				border-radius: 2px;
				color: #88bbff;
				font-size: 9px;
				font-weight: bold;
				cursor: pointer;
				padding: 0 4px;
				display: flex;
				align-items: center;
			`
		}, "+ Main");

		const addSubBtn = button({
			type: "button",
			title: "Group highlighted bars into a Sub-Section (Level 2)",
			style: `
				height: 16px;
				background: rgba(44, 139, 165, 0.4);
				border: 1px solid rgba(100, 200, 255, 0.5);
				border-radius: 2px;
				color: #77ddff;
				font-size: 9px;
				font-weight: bold;
				cursor: pointer;
				padding: 0 4px;
				display: flex;
				align-items: center;
			`
		}, "+ Sub");

		const addSub2Btn = button({
			type: "button",
			title: "Group highlighted bars into a Sub-Sub-Section (Level 3)",
			style: `
				height: 16px;
				background: rgba(42, 165, 165, 0.4);
				border: 1px solid rgba(100, 235, 235, 0.5);
				border-radius: 2px;
				color: #77ffee;
				font-size: 9px;
				font-weight: bold;
				cursor: pointer;
				padding: 0 4px;
				display: flex;
				align-items: center;
			`
		}, "+ Sub2");

		const aiBtn = button({
			type: "button",
			title: "AI Generate or Auto-Section Song Structure using Gemini",
			style: `
				width: 100%;
				height: 16px;
				margin-top: 1px;
				background: linear-gradient(135deg, rgba(136, 91, 165, 0.5), rgba(74, 111, 165, 0.5));
				border: 1px solid rgba(187, 136, 255, 0.6);
				border-radius: 2px;
				color: #eeddff;
				font-size: 9px;
				font-weight: bold;
				cursor: pointer;
				padding: 0;
				display: flex;
				align-items: center;
				justify-content: center;
			`
		}, "✨ AI Section Tool");

		addPartBtn.addEventListener("click", () => this._doc.openPrompt("markMovement"));
		addMainBtn.addEventListener("click", () => SectionManager.autoGroupSelection(this._doc, 1));
		addSubBtn.addEventListener("click", () => SectionManager.autoGroupSelection(this._doc, 2));
		addSub2Btn.addEventListener("click", () => SectionManager.autoGroupSelection(this._doc, 3));
		aiBtn.addEventListener("click", () => this._doc.openPrompt("aiAutoSection"));

		this.headerContainer = div({
			style: `
				width: 110px;
				height: 82px;
				display: flex;
				flex-direction: column;
				justify-content: space-between;
				padding: 2px;
				box-sizing: border-box;
				background: ${ColorConfig.editorBackground};
				border-bottom: 1px solid rgba(255, 255, 255, 0.15);
			`
		},
			div({style: "display: flex; justify-content: space-between; align-items: center;"},
				span({style: "font-size: 8px; color: #ffd700; font-weight: bold;"}, "PART"),
				addPartBtn
			),
			div({style: "display: flex; justify-content: space-between; align-items: center; margin-top: 1px;"},
				span({style: "font-size: 8px; color: #88bbff; font-weight: bold;"}, "L1"),
				addMainBtn
			),
			div({style: "display: flex; justify-content: space-between; align-items: center; margin-top: 1px;"},
				span({style: "font-size: 8px; color: #77ddff; font-weight: bold;"}, "L2"),
				addSubBtn
			),
			div({style: "display: flex; justify-content: space-between; align-items: center; margin-top: 1px;"},
				span({style: "font-size: 8px; color: #77ffee; font-weight: bold;"}, "L3"),
				addSub2Btn
			),
			aiBtn
		);

		this.trackContainer = div({
			class: "groupSectionBarTrack",
			style: `
				height: 82px;
				position: relative;
				background: rgba(0, 0, 0, 0.35);
				border-bottom: 1px solid rgba(255, 255, 255, 0.15);
				box-sizing: border-box;
				user-select: none;
				overflow: hidden;
			`
		});

		this._doc.notifier.watch(this.render);
	}

	public render = (): void => {
		const barWidth = this._doc.getBarWidth();
		const barCount = this._doc.song.barCount;
		const sections = SectionManager.getSections();
		const movements = SectionManager.getMovements();

		const sectionsJson = JSON.stringify(sections);
		const movementsJson = JSON.stringify(movements);

		const totalWidth = barWidth * barCount;
		this.trackContainer.style.width = totalWidth + "px";

		if (
			this._renderedBarWidth === barWidth &&
			this._renderedBarCount === barCount &&
			this._renderedSectionsJson === sectionsJson &&
			this._renderedMovementsJson === movementsJson
		) {
			return;
		}

		this._renderedBarWidth = barWidth;
		this._renderedBarCount = barCount;
		this._renderedSectionsJson = sectionsJson;
		this._renderedMovementsJson = movementsJson;

		while (this.trackContainer.firstChild) {
			this.trackContainer.removeChild(this.trackContainer.firstChild);
		}

		// Draw horizontal guidelines
		const rowGuide0 = div({style: "position: absolute; top: 20px; left: 0; width: 100%; height: 1px; background: rgba(255, 215, 0, 0.2); pointer-events: none;"});
		const rowGuide1 = div({style: "position: absolute; top: 40px; left: 0; width: 100%; height: 1px; background: rgba(255, 255, 255, 0.08); pointer-events: none;"});
		const rowGuide2 = div({style: "position: absolute; top: 60px; left: 0; width: 100%; height: 1px; background: rgba(255, 255, 255, 0.08); pointer-events: none;"});
		this.trackContainer.appendChild(rowGuide0);
		this.trackContainer.appendChild(rowGuide1);
		this.trackContainer.appendChild(rowGuide2);

		// 1. Render Movement / Part Markers on Row 0 (top)
		for (const mov of movements) {
			const left = mov.startBar * barWidth;
			const width = (mov.endBar - mov.startBar + 1) * barWidth - 2;

			const movBlock = div({
				style: `
					position: absolute;
					left: ${left + 1}px;
					width: ${Math.max(4, width)}px;
					top: 1px;
					height: 18px;
					background: rgba(212, 175, 55, 0.25);
					border: 1px solid #ffd700;
					border-radius: 3px;
					box-sizing: border-box;
					display: flex;
					align-items: center;
					justify-content: space-between;
					padding: 0 4px;
					color: #ffe875;
					font-size: 9px;
					font-weight: bold;
					font-family: sans-serif;
					cursor: pointer;
					overflow: hidden;
					white-space: nowrap;
					box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
					z-index: 12;
				`
			});

			const labelSpan = span({
				title: `🎭 ${mov.name}: "${mov.description}" (Bars ${mov.startBar + 1}-${mov.endBar + 1}) - Double-click to edit`,
				style: `
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					flex-grow: 1;
					margin-right: 2px;
				`
			}, `🎭 ${mov.name}: ${mov.description}`);

			const removeBtn = button({
				type: "button",
				title: "Remove movement marker",
				style: `
					background: none;
					border: none;
					color: rgba(255, 235, 120, 0.8);
					font-size: 11px;
					font-weight: bold;
					cursor: pointer;
					padding: 0 1px;
					line-height: 1;
					display: flex;
					align-items: center;
				`
			}, "×");

			removeBtn.addEventListener("click", (e: MouseEvent) => {
				e.stopPropagation();
				SectionManager.removeMovement(mov.id);
				this._doc.notifier.changed();
			});

			movBlock.appendChild(labelSpan);
			movBlock.appendChild(removeBtn);

			movBlock.addEventListener("click", () => {
				this._doc.selection.setTrackSelection(
					mov.startBar,
					mov.endBar,
					0,
					this._doc.song.getChannelCount() - 1
				);
				this._doc.selection.selectionUpdated();
			});

			labelSpan.addEventListener("dblclick", (e: MouseEvent) => {
				e.stopPropagation();
				this._doc.openPrompt("markMovement");
			});

			this.trackContainer.appendChild(movBlock);
		}

		// 2. Render Sections on Rows 1, 2, and 3
		for (const section of sections) {
			const level = section.level || 1;
			const left = section.startBar * barWidth;
			const width = (section.endBar - section.startBar + 1) * barWidth - 2;

			const topOffset = level === 1 ? 21 : level === 2 ? 41 : 61;
			const rowHeight = 18;

			const sectionBlock = div({
				style: `
					position: absolute;
					left: ${left + 1}px;
					width: ${Math.max(4, width)}px;
					top: ${topOffset}px;
					height: ${rowHeight}px;
					background: ${section.color}44;
					border: 1px solid ${section.color};
					border-radius: 3px;
					box-sizing: border-box;
					display: flex;
					align-items: center;
					justify-content: space-between;
					padding: 0 4px;
					color: #ffffff;
					font-size: ${level === 1 ? "10px" : "9px"};
					font-weight: bold;
					font-family: sans-serif;
					cursor: pointer;
					overflow: hidden;
					white-space: nowrap;
					box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
					z-index: ${10 - level};
				`
			});

			const labelSpan = span({
				title: `L${level} ${section.name} (Bars ${section.startBar + 1}-${section.endBar + 1}) - Double-click to rename`,
				style: `
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					flex-grow: 1;
					margin-right: 2px;
				`
			}, `${section.name}`);

			const removeBtn = button({
				type: "button",
				title: "Remove section group",
				style: `
					background: none;
					border: none;
					color: rgba(255, 255, 255, 0.7);
					font-size: 11px;
					font-weight: bold;
					cursor: pointer;
					padding: 0 1px;
					line-height: 1;
					display: flex;
					align-items: center;
				`
			}, "×");

			removeBtn.addEventListener("click", (e: MouseEvent) => {
				e.stopPropagation();
				SectionManager.removeSection(section.id);
				this._doc.notifier.changed();
			});

			sectionBlock.appendChild(labelSpan);
			sectionBlock.appendChild(removeBtn);

			sectionBlock.addEventListener("click", () => {
				this._doc.selection.setTrackSelection(
					section.startBar,
					section.endBar,
					0,
					this._doc.song.getChannelCount() - 1
				);
				this._doc.selection.selectionUpdated();
			});

			labelSpan.addEventListener("dblclick", (e: MouseEvent) => {
				e.stopPropagation();
				const currentName = section.name;
				const newName = prompt(`Rename L${level} Section:`, currentName);
				if (newName != null && newName.trim().length > 0) {
					section.name = newName.trim();
					this._doc.notifier.changed();
				}
			});

			this.trackContainer.appendChild(sectionBlock);
		}
	}
}
