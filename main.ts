import { createObsidianUi, type UiInteractions } from "@vrtmrz/obsidian-plugin-kit/ui";
import {
	createObsidianVaultFrontmatterAccess,
	type VaultFrontmatterAccess,
} from "@vrtmrz/obsidian-plugin-kit/vault";
import { UnsafePathError } from "octagonal-wheels/path";
import { Editor, MarkdownView, Notice, parseYaml, Plugin, requestUrl, arrayBufferToBase64, base64ToArrayBuffer, MarkdownRenderer, TFile, type MarkdownFileInfo, MarkdownRenderChild } from "obsidian";
import { PORTABLE_OBSIDIAN_CONFIG_DIR, resolveRestorePath } from "./restore-path";
import { chooseTargetDirectory, shouldIncludePluginData } from "./ui-workflow";
import { createObsidianVaultRestoreAccess, restoreVaultFile } from "./vault-restore";
import {
	addExportTarget,
	initialiseLocalExportNote,
	initialiseRemoteFetchNote,
} from "./frontmatter-workflow";
import {
	listVaultDirectoriesRecursively,
	listVaultFilesRecursively,
	readVaultFileForDump,
} from "./vault-read";

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

export default class ScrewDriverPlugin extends Plugin {
	ui!: UiInteractions;
	frontmatter!: VaultFrontmatterAccess;

	onload() {
		this.ui = createObsidianUi(this.app);
		this.frontmatter = createObsidianVaultFrontmatterAccess(this.app);
		void this.loadSettings();
		this.addCommand({
			id: "screwdriver-add-target-dir",
			name: "Add folder to this export note",
			editorCallback: async (_editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				const list = await listVaultDirectoriesRecursively(
					this.app.vault.adapter,
					this.app.vault.configDir,
					["node_modules", ".git"]
				);
				const selected = await chooseTargetDirectory(this.ui, list);

				if (selected) {
					let filters = [] as string[];
					if (selected.indexOf("plugins") !== -1) {
						if (await shouldIncludePluginData(this.ui)) {
							filters = ["main\\.js$", "manifest\\.json$", "styles\\.css$", "data\\.json$"];
						} else {
							filters = ["main\\.js$", "manifest\\.json$", "styles\\.css$"];
						}
					} else if (selected.indexOf("themes") !== -1) {
						filters = ["manifest\\.json$", "theme\\.css$"];
					} else if (selected.indexOf("snippets") !== -1) {
						filters = (await listVaultFilesRecursively(this.app.vault.adapter, selected, [], [/\.css$/])).map(e => e.substring(selected.length).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$");
					}
					if (!(view.file instanceof TFile)) {
						new Notice("Current file is not a valid file.");
						return;
					}
					await addExportTarget(this.frontmatter, view.file.path, selected, filters);
				}
			}
		});
		this.addCommand({
			id: "screwdriver-create-template-dump",
			name: "Create local export note",
			editorCallback: async (_editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				if (!(view.file instanceof TFile)) {
					new Notice("Current file is not a valid file.");
					return;
				}
				await initialiseLocalExportNote(this.frontmatter, view.file.path);
			},
		});
		this.addCommand({
			id: "screwdriver-create-template-fetch",
			name: "Create remote fetch note",
			editorCallback: async (_editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
				if (!(view.file instanceof TFile)) {
					new Notice("Current file is not a valid file.");
					return;
				}
				await initialiseRemoteFetchNote(this.frontmatter, view.file.path);
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
					const files = await listVaultFilesRecursively(
						this.app.vault.adapter,
						target,
						ignores,
						filters
					);
					for (const file of files) {
						let fileDat = "";
						let bin = false;
						const captured = await readVaultFileForDump(this.app.vault.adapter, file);
						if (captured === null) {
							new Notice(`File can not be accessed: ${file}`);
							continue;
						}
						const { data: dt, stat } = captured;
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
							? PORTABLE_OBSIDIAN_CONFIG_DIR + file.substring(this.app.vault.configDir.length) : file;
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
				const restoreAccess = createObsidianVaultRestoreAccess(this.app.vault);
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
							let filename: string;
							try {
								filename = resolveRestorePath({
									storedPath: filenameData,
									configDir: this.app.vault.configDir,
									adjustObsidianDir,
								});
							} catch (error) {
								if (!(error instanceof UnsafePathError)) throw error;
								new Notice(`Skipped unsafe restore path ${JSON.stringify(error.input)} (${error.reason}).`);
								continue;
							}

							try {
								const mtime = parseInt(mtimeStr);
								const result = await restoreVaultFile(restoreAccess, {
									path: filename,
									createPayload() {
										let saveData = data;
										if ((isPlainText(filename) && dataType != "bin") || dataType == "plain") {
											saveData = saveData.replace(/\\`/g, "`");
											saveData = saveData.replace(/\\\\/g, "\\");
											saveData = saveData.substring(0, saveData.lastIndexOf("\n"));
											return { kind: "text", data: saveData };
										}
										saveData = saveData.substring(0, saveData.lastIndexOf("\n"));
										return { kind: "binary", data: base64ToArrayBuffer(saveData) };
									},
									storedMtime: mtime,
									skipOldFile,
									skipNewFile,
								});
								if (result === "skipped-up-to-date") {
									new Notice(`File:${filename} is already up to date.`);
									continue;
								}
								if (result === "skipped-existing") {
									new Notice(`File:${filename} already exists.`);
									continue;
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
