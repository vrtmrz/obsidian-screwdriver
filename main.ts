import { App, Editor, MarkdownView, Notice, parseYaml, Plugin, requestUrl, arrayBufferToBase64, base64ToArrayBuffer, MarkdownRenderer, FuzzySuggestModal } from "obsidian";

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
			if (ex.message && ex.message == "Folder already exists.") {
				// especialy this message is.
			} else {
				new Notice("Folder Create Error");
				console.log(ex);
			}
		}
		c += "/";
	}
}

export default class ScrewDriverPlugin extends Plugin {
	async onload() {
		await this.loadSettings();
		this.addCommand({
			id: "screwdriver-add-target-dir",
			name: "Add target directory",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const list = await getDirectories(
					this.app,
					this.app.vault.configDir,
					["node_modules", ".git"]
				);
				const selected = await askSelectString(this.app, "Select target directory", list);

				if (selected) {
					let filters = [] as string[];
					if (selected.indexOf("plugins") !== -1) {
						if (await askSelectString(this.app, "Do you want to include plugin's data?", ["yes", "no"]) == "yes") {
							filters = ["main\\.js$", "manifest\\.json$", "styles\\.css$", "data\\.json$"];
						} else {
							filters = ["main\\.js$", "manifest\\.json$", "styles\\.css$"];
						}
					} else if (selected.indexOf("themes") !== -1) {
						filters = ["manifest\\.json$", "theme\\.css$"];
					} else if (selected.indexOf("snippets") !== -1) {
						filters = (await getFiles(this.app, selected, [], [/\.css$/])).map(e => e.substring(selected.length).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$");
					}
					this.app.fileManager.processFrontMatter(view.file, async fm => {
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
			name: "Create or add local file exporting template",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				this.app.fileManager.processFrontMatter(view.file, fn => {
					fn.targets = fn.targets ?? [];
					fn.ignores = fn.ignores ?? ["/node_modules", "/.git"];
					fn.filters = fn.filters ?? [];
					fn.comment = fn.comment ?? "'Add target directory' to add targets";
					fn.tags = fn.tags ?? [];
				});
			},
		});
		this.addCommand({
			id: "screwdriver-create-template-fetch",
			name: "Create or add remote file fetching template",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				this.app.fileManager.processFrontMatter(view.file, fn => {
					fn.urls = fn.urls ?? [];
					fn.authorization = fn.authorization ?? "";
					fn.tags = fn.tags ?? [];
					fn.header_json = fn.header_json ?? "";
				});
			},
		})
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "screwdriver-dump",
			name: "Export specified files and store into the active file",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
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
						} catch (ex2) {
							fileDat = await arrayBufferToBase64(dt);
							bin = true;
						}
						newData += "\n";
						newData += `# ${url} \n`;
						newData += `- Fetched :${new Date().toLocaleString()} \n`;
						newData += "\n```screwdriver:" + filename + (bin ? ":bin" : "") + "\n";
						newData += fileDat + "";
						newData += "\n```";
					} catch (ex) {
						new Notice(`Error on fetching ${url}\n${ex}`);
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
						try {
							const text = new TextDecoder("utf-8", { fatal: true }).decode(dt);
							fileDat = text;
							fileDat = fileDat.replace(/\\/g, "\\\\");
							fileDat = fileDat.replace(/`/g, "\\`");
						} catch (ex2) {
							fileDat = await arrayBufferToBase64(dt);
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
						newData += "\n```screwdriver:" + file + ":" + (bin ? "bin" : "plain") + "\n";
						newData += fileDat + "";
						newData += "\n```";

					}
				}
				editor.setValue(newData);
			},
		});
		this.registerMarkdownCodeBlockProcessor("screwdriver", (source, el, ctx) => {
			const sourcePath = ctx.sourcePath;
			const si = ctx.getSectionInfo(el);
			const fxx = si.text.split("\n")[si.lineStart];
			const filename = `${fxx}:::`.split(":")[1];
			const rSource = `${"```\n"}${source}${"\n```"}`;
			const renderSource = `> [!screwdriver]- ${filename}\n${rSource.replace(/^/mg, "> ")}`;
			const fx = el.createDiv({ text: "", cls: ["screwdriver-display"] });
			MarkdownRenderer.renderMarkdown(renderSource, fx, sourcePath, this)
			el.replaceWith(fx);
		});
		this.addCommand({
			id: "screwdriver-restore",
			name: "Restore exported files from the active file",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const data = view.data;
				if (data.startsWith("---")) {
					const bodyStartIndex = data.indexOf("\n---");

					if (bodyStartIndex !== -1) {
						const preBlocks = data
							.substring(bodyStartIndex)
							.matchAll(/^```(?:screwdriver:|)([\s\S]*?)\n([\s\S]*?)^```/gm);
						for (const preBlock of preBlocks) {
							const [, filenameSrc, data] = preBlock;
							const [filename, dataType] = `${filenameSrc}:`.split(":");
							let saveData = data;
							try {
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
								console.log(`File:${filename} has been wrote to your device.`)
							} catch (ex) {
								new Notice(`Failed to write ${filename}`);
								console.error(`Failed to write ${filename}`)
								console.log(ex);
							}
						}
						return;
					}
				}
				new Notice("Frontmatter was not found.");
				console.error("Frontmatter was not found")
			},
		});
	}

	onunload() { }

	async loadSettings() { }

	async saveSettings() { }
}


export class PopoverSelectString extends FuzzySuggestModal<string> {
	app: App;
	callback: (e: string) => void = () => { };
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

	onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
		// debugger;
		this.callback(item);
		this.callback = null;
	}
	onClose(): void {
		setTimeout(() => {
			if (this.callback != null) {
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
