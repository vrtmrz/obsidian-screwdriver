import { App, Editor, MarkdownView, Notice, parseYaml, Plugin } from "obsidian";

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

	return false;
}

function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
	return new Promise((res) => {
		const blob = new Blob([buffer], { type: "application/octet-binary" });
		const reader = new FileReader();
		reader.onload = function (evt) {
			const dataurl = evt.target.result.toString();
			res(dataurl.substr(dataurl.indexOf(",") + 1));
		};
		reader.readAsDataURL(blob);
	});
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	try {
		const binary_string = window.atob(base64);
		const len = binary_string.length;
		const bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binary_string.charCodeAt(i);
		}
		return bytes.buffer;
	} catch (ex) {
		try {
			return new Uint16Array(
				[].map.call(base64, function (c: string) {
					return c.charCodeAt(0);
				})
			).buffer;
		} catch (ex2) {
			return null;
		}
	}
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
			id: "screwdriver-create-template",
			name: "Create dump template",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const data = view.data;
				if (data.trim() != "") {
					new Notice(
						"Please clear the note once. This plugin write the template to this file"
					);
					return;
				}
				const list = await getDirectories(
					this.app,
					this.app.vault.configDir,
					["node_modules", ".git"]
				);
				const targets = list.map((e) => `# target: ${e}`).join("\n");
				editor.setValue(`---
# --- Select a directory to dump. ---
${targets}

# --- Prefixes to ignore. ---
ignores:
- /node_modules
- /.git

# --- Regular expressions for filtering files
filters:
# - \\.js
---

`);
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "screwdriver-dump",
			name: "Dump files",
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
				const ignoresSrc = yamlData.ignores;
				const ignores: string[] = Array.isArray(ignoresSrc)
					? ignoresSrc
					: (ignoresSrc + "").split(",");
				const filterSrc = yamlData.filters;
				const filters = !filterSrc
					? null
					: filterSrc.map((e: string) => new RegExp(e));
				if (target.trim() == "") {
					new Notice("Target folder not specified.");
					return;
				}
				const files = await getFiles(
					this.app,
					target,
					ignores,
					filters
				);
				for (const file of files) {
					let fileDat = "";
					const stat = await this.app.vault.adapter.stat(file);
					if (isPlainText(file)) {
						fileDat = await this.app.vault.adapter.read(file);
						fileDat = fileDat.replace(/\\/g, "\\\\");
						fileDat = fileDat.replace(/`/g, "\\`");
					} else {
						const dtSrc = await this.app.vault.adapter.readBinary(
							file
						);
						fileDat = await arrayBufferToBase64(dtSrc);
					}
					newData += "\n";
					newData += `# ${file} \n`;
					newData += `- Created :${new Date(
						stat.ctime
					).toLocaleString()} \n`;
					newData += `- Modified:${new Date(
						stat.mtime
					).toLocaleString()} \n`;
					newData += "\n```" + file + "\n";
					newData += fileDat + "";
					newData += "\n```";
				}

				editor.setValue(newData);
			},
		});
		this.addCommand({
			id: "screwdriver-restore",
			name: "Restore files",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const data = view.data;
				if (data.startsWith("---")) {
					const bodyStartIndex = data.indexOf("\n---");

					if (bodyStartIndex !== -1) {
						const preBlocks = data
							.substring(bodyStartIndex)
							.matchAll(/^```([\s\S]*?)\n([\s\S]*?)^```/gm);
						for (const preBlock of preBlocks) {
							const [, filename, data] = preBlock;
							let saveData = data;
							try {
								if (isPlainText(filename)) {
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
							} catch (ex) {
								new Notice(`Failed to write ${filename}`);
								console.log(ex);
							}
						}
						return;
					}
				}
				new Notice("Frontmatter was not found.");
			},
		});
	}

	onunload() {}

	async loadSettings() {}

	async saveSettings() {}
}
