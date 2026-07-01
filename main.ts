import { App, Editor, MarkdownView, Notice, parseYaml, Plugin, requestUrl, arrayBufferToBase64, base64ToArrayBuffer, MarkdownRenderer, FuzzySuggestModal, TFile, type MarkdownFileInfo, MarkdownRenderChild } from "obsidian";
// eslint-disable-next-line obsidianmd/hardcoded-config-path -- This is not actually used. used as an pseudo name.
const DEFAULT_OBSIDIAN_DIR = ".obsidian";
// Util functions
async function getFiles(
	app: App,
	path: string,
	ignoreList: string[],
	filter: RegExp[]
) {
	const w = await app.vault.adapter.list(path);
	let files = [
		...w.files
			.filter((e) => !ignoreList.some((ee) => e.endsWith(ee)))
			.filter((e) => !filter || filter.some((ee) => e.match(ee))),
	];
	L1: for (const v of w.folders) {
		for (const ignore of ignoreList) {
			if (v.endsWith(ignore)) {
				continue L1;
			}
		}
		// files = files.concat([v]);
		files = files.concat(await getFiles(app, v, ignoreList, filter));
	}
	return files;
}
async function getDirectories(app: App, path: string, ignoreList: string[]) {
	const w = await app.vault.adapter.list(path);
	let dirs: string[] = [];
	L1: for (const v of w.folders) {
		for (const ignore of ignoreList) {
			if (v.endsWith(ignore)) {
				continue L1;
			}
		}
		dirs = dirs.concat([v]);
		dirs = dirs.concat(await getDirectories(app, v, ignoreList));
	}
	return dirs;
}

function isPlainText(filename: string): boolean {
	if (filename.endsWith(".md")) return true;
	if (filename.endsWith(".txt")) return true;
	if (filename.endsWith(".svg")) return true;
	if (filename.endsWith(".html")) return true;
	if (filename.endsWith(".csv")) return true;
	if (filename.endsWith(".css")) return true;
	if (filename.endsWith(".js")) return true;
	if (filename.endsWith(".json")) return true;
	if (filename.endsWith(".xml")) return true;
	if (filename.endsWith(".ts")) return true;
	if (filename.endsWith(".canvas")) return true;

	return false;
}

async function ensureDirectory(app: App, fullpath: string) {
	const pathElements = fullpath.split("/");
	pathElements.pop();
	let c = "";
	for (const v of pathElements) {
		c += v;
		try {
			await app.vault.createFolder(c);
		} catch (ex) {
			// basically skip exceptions.
			if (ex instanceof Error && ex.message == "Folder already exists.") {
				// especially this message is.
			} else {
				new Notice("Folder Create Error");
			}
		}
		c += "/";
	}
}

export default class ScrewDriverPlugin extends Plugin {
	onload() {
		void this.loadSettings();
		this.addCommand({
			id: "screwdriver-add-target-dir",
			name: "Add folder to this export note",
			editorCallback: async (_editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				const list = await getDirectories(
					this.app,
					this.app.vault.configDir,
					["node_modules", ".git"]
				);
				const selected = await askSelectString(this.app, "Select target directory", list);

				if (selected) {
					let filters = [] as string[];
					if (selected.indexOf("plugins") !== -1) {
						if (await askSelectString(this.app, "Do you want to include plug-in data?", ["yes", "no"]) == "yes") {
							filters = ["main\\.js$", "manifest\\.json$", "styles\\.css$", "data\\.json$"];
						} else {
							filters = ["main\\.js$", "manifest\\.json$", "styles\\.css$"];
						}
					} else if (selected.indexOf("themes") !== -1) {
						filters = ["manifest\\.json$", "theme\\.css$"];
					} else if (selected.indexOf("snippets") !== -1) {
						filters = (await getFiles(this.app, selected, [], [/\.css$/])).map(e => e.substring(selected.length).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$");
					}
					if (!(view.file instanceof TFile)) {
						new Notice("Current file is not a valid file.");
						return;
					}
					void this.app.fileManager.processFrontMatter(view.file, fm => {
						fm.targets = [...new Set([...fm.targets ?? [], selected])];
						if (filters.length > 0) {
							fm.filters = [...new Set([...(fm.filters ?? []), ...filters])]
						}
					})
				}
			}
		});
		this.addCommand({
			id: "screwdriver-create-template-dump",
			name: "Create local export note",
			editorCallback: (_editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				if (!(view.file instanceof TFile)) {
					new Notice("Current file is not a valid file.");
					return;
				}
				void this.app.fileManager.processFrontMatter(view.file, fn => {
					fn.targets = fn.targets ?? [];
					fn.ignores = fn.ignores ?? ["/node_modules", "/.git"];
					fn.filters = fn.filters ?? [];
					fn.comment = fn.comment ?? "Use 'Add folder to this export note' to add targets";
					fn.tags = fn.tags ?? [];
					fn.adjustObsidianDir = fn.adjustObsidianDir ?? true;
					fn.skipNewFile = fn.skipNewFile ?? false;
					fn.skipOldFile = fn.skipOldFile ?? false;
				});
			},
		});
		this.addCommand({
			id: "screwdriver-create-template-fetch",
			name: "Create remote fetch note",
			editorCallback: (_editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				if (!(view.file instanceof TFile)) {
					new Notice("Current file is not a valid file.");
					return;
				}
				void this.app.fileManager.processFrontMatter(view.file, fn => {
					fn.urls = fn.urls ?? [];
					fn.authorization = fn.authorization ?? "";
					fn.tags = fn.tags ?? [];
					fn.header_json = fn.header_json ?? "";
					fn.skipNewFile = fn.skipNewFile ?? false;
					fn.skipOldFile = fn.skipOldFile ?? false;
				});
			},
		})
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "screwdriver-dump",
			name: "Export files into this note",
			editorCallback: async (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				if (!("data" in view) || typeof view.data !== "string") {
					new Notice("Current file is not a valid file.");
					return;
				}
				const data = view.data;
				const bodyStartIndex = data.indexOf("\n---");
				if (!data.startsWith("---") || bodyStartIndex === -1) {
					new Notice("Frontmatter was not found.");
				}
				//
				const yaml = data.substring(3, bodyStartIndex);
				const yamlData = parseYaml(yaml);
				let newData = "---" + yaml + "\n---\n\n";
				const target = yamlData.target ?? "";
				let targets = (yamlData.targets ?? []) as string[];
				if (target) targets = [...targets, target];
				const adjustObsidianDir = yamlData.adjustObsidianDir ?? true;
				targets = targets.map(e => e.trim()).filter(e => e != "");
				const ignoresSrc = yamlData.ignores;
				const ignores: string[] = Array.isArray(ignoresSrc)
					? ignoresSrc
					: (ignoresSrc + "").split(",");
				const filterSrc = yamlData.filters;
				const filters = !filterSrc
					? null
					: filterSrc.map((e: string) => new RegExp(e));

				const urls = (yamlData.urls ?? "");
				if (targets.length == 0 && urls == "") {
					new Notice("Target folders or urls are not specified.");
					return;
				}
				for (const url of urls) {
					try {
						let fileDat = "";
						let bin = false;
						const w = await requestUrl(url);
						const filename = new URL(url).pathname.split("/").last();
						const dt = w.arrayBuffer;
						try {
							const text = new TextDecoder("utf-8", { fatal: true }).decode(dt);
							fileDat = text;
							fileDat = fileDat.replace(/\\/g, "\\\\");
							fileDat = fileDat.replace(/`/g, "\\`");
						} catch {
							fileDat = arrayBufferToBase64(dt);
							bin = true;
						}
						newData += "\n";
						newData += `# ${url} \n`;
						newData += `- Fetched :${new Date().toLocaleString()} \n`;
						newData += "\n```screwdriver:" + filename + (bin ? ":bin" : "") + "\n";
						newData += fileDat + "";
						newData += "\n```";
					} catch (ex) {
						new Notice(`Error on fetching ${url}\n${ex instanceof Error ? ex.message : String(ex)}`);
					}
				}

				for (const target of targets) {
					const files = await getFiles(
						this.app,
						target,
						ignores,
						filters
					);
					for (const file of files) {
						let fileDat = "";
						let bin = false;
						const dt = await this.app.vault.adapter.readBinary(file);
						const stat = await this.app.vault.adapter.stat(file);
						if (stat == null) {
							new Notice(`File can not be accessed: ${file}`);
							continue;
						}
						try {
							const text = new TextDecoder("utf-8", { fatal: true }).decode(dt);
							fileDat = text;
							fileDat = fileDat.replace(/\\/g, "\\\\");
							fileDat = fileDat.replace(/`/g, "\\`");
						} catch {
							fileDat = arrayBufferToBase64(dt);
							bin = true;
						}
						newData += "\n";
						newData += `# ${file} \n`;
						newData += `- Created :${new Date(
							stat.ctime
						).toLocaleString()} \n`;
						newData += `- Modified:${new Date(
							stat.mtime
						).toLocaleString()} \n`;
						const writeFileName = (adjustObsidianDir && file.startsWith(this.app.vault.configDir))
							? DEFAULT_OBSIDIAN_DIR + file.substring(this.app.vault.configDir.length) : file;
						newData += "\n```screwdriver:" + writeFileName + ":" + (bin ? "bin" : "plain") + ":" + stat.mtime + "\n";
						newData += fileDat + "";
						newData += "\n```";
						new Notice(`File:${file} has been stored into the active file.`);
					}
				}
				editor.setValue(newData);
			},
		});
		this.registerMarkdownCodeBlockProcessor("screwdriver", (source, el, ctx) => {
			const sourcePath = ctx.sourcePath;
			const si = ctx.getSectionInfo(el);
			if (si) {
				const fxx = si.text.split("\n")[si.lineStart];
				const filename = `${fxx}:::`.split(":")[1];
				const rSource = `${"```\n"}${source}${"\n```"}`;
				const renderSource = `> [!screwdriver]- ${filename}\n${rSource.replace(/^/mg, "> ")}`;
				const fx = el.createDiv({ text: "", cls: ["screwdriver-display"] });
				const component = new MarkdownRenderChild(fx);
				ctx.addChild(component);
				void MarkdownRenderer.render(this.app, renderSource, fx, sourcePath, component).then(() => {
					;
					el.replaceWith(fx);
				});
			}
		});
		this.addCommand({
			id: "screwdriver-restore",
			name: "Restore files from this note",
			editorCallback: async (_editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				if (!("data" in view) || typeof view.data !== "string") {
					new Notice("Current file is not a valid file.");
					return;
				}

				const data = view.data;
				if (data.startsWith("---")) {
					const bodyStartIndex = data.indexOf("\n---");
					const yaml = data.substring(3, bodyStartIndex);
					const yamlData = parseYaml(yaml);
					const adjustObsidianDir = yamlData.adjustObsidianDir ?? true;
					const skipNewFile = yamlData.skipNewFile ?? false;
					const skipOldFile = yamlData.skipOldFile ?? false;
					if (bodyStartIndex !== -1) {
						const preBlocks = data
							.substring(bodyStartIndex)
							.matchAll(/^```(?:screwdriver:|)([\s\S]*?)\n([\s\S]*?)^```/gm);
						for (const preBlock of preBlocks) {
							const [, filenameSrc, data] = preBlock;
							const [filenameData, dataType, mtimeStr] = `${filenameSrc}:`.split(":");
							const filename =
								(adjustObsidianDir && filenameData.startsWith(DEFAULT_OBSIDIAN_DIR + "/"))
									? filenameData.replace(DEFAULT_OBSIDIAN_DIR, this.app.vault.configDir)
									: filenameData;

							let saveData = data;
							try {
								const mtime = parseInt(mtimeStr);
								const stat = await this.app.vault.adapter.stat(filename);
								if (stat !== null) {
									if (skipOldFile && mtime < stat.mtime) {
										new Notice(`File:${filename} is already up to date.`);
										continue;
									}
									if (skipNewFile && mtime >= stat.mtime) {
										new Notice(`File:${filename} already exists.`);
										continue;
									}
								}
								if ((isPlainText(filename) && dataType != "bin") || dataType == "plain") {
									saveData = saveData.replace(/\\`/g, "`");
									saveData = saveData.replace(/\\\\/g, "\\");
									saveData = saveData.substring(
										0,
										saveData.lastIndexOf("\n")
									);
									await ensureDirectory(this.app, filename);
									await this.app.vault.adapter.write(
										filename,
										saveData
									);
								} else {
									saveData = saveData.substring(
										0,
										saveData.lastIndexOf("\n")
									);
									const saveDataArrayBuffer =
										base64ToArrayBuffer(saveData);
									await ensureDirectory(this.app, filename);
									await this.app.vault.adapter.writeBinary(
										filename,
										saveDataArrayBuffer
									);
								}
								new Notice(
									`File:${filename} has been wrote to your device.`
								);
							} catch {
								new Notice(`Failed to write ${filename}`);
							}
						}
						return;
					}
				}
				new Notice("Frontmatter was not found.");
			},
		});
	}

	onunload() { }

	async loadSettings() { }

	async saveSettings() { }
}


export class PopoverSelectString extends FuzzySuggestModal<string> {
	app: App;
	callback?: ((e: string) => void) = () => { };
	getItemsFun: () => string[] = () => {
		return ["yes", "no"];

	}

	constructor(app: App, note: string, placeholder: string | null, getItemsFun: () => string[], callback: (e: string) => void) {
		super(app);
		this.app = app;
		this.setPlaceholder((placeholder ?? "y/n) ") + note);
		if (getItemsFun) this.getItemsFun = getItemsFun;
		this.callback = callback;
	}

	getItems(): string[] {
		return this.getItemsFun();
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string, _evt: MouseEvent | KeyboardEvent): void {
		// debugger;
		if (this.callback) {
			this.callback(item);
			this.callback = undefined;
		}
	}
	onClose(): void {
		// eslint-disable-next-line obsidianmd/prefer-window-timers
		activeWindow.setTimeout(() => {
			if (this.callback != undefined) {
				this.callback("");
			}
		}, 100);
	}
}

export const askSelectString = (app: App, message: string, items: string[]): Promise<string> => {
	const getItemsFun = () => items;
	return new Promise((res) => {
		const popover = new PopoverSelectString(app, message, "", getItemsFun, (result) => res(result));
		popover.open();
	});
};
