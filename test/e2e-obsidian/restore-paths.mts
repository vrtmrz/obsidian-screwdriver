import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { withObsidianPage } from "@vrtmrz/obsidian-test-session";
import {
	EXPORT_NOTE_PATH,
	SCREWDRIVER_PLUGIN_ID,
	startScrewDriverTestSession,
	stopScrewDriverTestSession,
	type ScrewDriverTestSession,
} from "./harness.mts";

const RESTORE_COMMAND_ID = `${SCREWDRIVER_PLUGIN_ID}:screwdriver-restore`;
const SAFE_PATH = "Restored/nested/safe.txt";
const SIBLING_PATH = "Restored/nested/sibling.txt";
const BINARY_PATH = "Restored/nested/bytes.bin";
const SKIPPED_PATH = "Restored/existing.txt";
const BINARY_CONTENT = new Uint8Array([0, 1, 2, 255]);

function escapeFilename(vaultPath: string): string {
	return `screwdriver-escape-${basename(vaultPath)}.txt`;
}

function restoreNote(unsafePath: string): string {
	return `---
adjustObsidianDir: true
skipNewFile: false
skipOldFile: true
---

\`\`\`screwdriver:${unsafePath}:plain:0
unsafe content
\`\`\`

\`\`\`screwdriver:${SAFE_PATH}:plain:0
safe content
\`\`\`

\`\`\`screwdriver:${SIBLING_PATH}:plain:0
sibling content
\`\`\`

\`\`\`screwdriver:${BINARY_PATH}:bin:0
AAEC/w==
\`\`\`

\`\`\`screwdriver:${SKIPPED_PATH}:plain:0
replacement content
\`\`\`
`;
}

async function verifyRestorePathBoundary(testSession: ScrewDriverTestSession): Promise<void> {
	const unsafePath = `../${escapeFilename(testSession.vault.path)}`;
	const outsidePath = join(dirname(testSession.vault.path), escapeFilename(testSession.vault.path));
	try {
		await withObsidianPage(testSession.session.remoteDebuggingPort, async (page) => {
			await page.evaluate(
				async ({ commandId, notePath }) => {
					const obsidianApp = (
						globalThis as typeof globalThis & {
							app?: {
								commands?: { executeCommandById(commandId: string): boolean };
								vault?: { getAbstractFileByPath(path: string): unknown };
								workspace?: { getLeaf(): { openFile(file: unknown): Promise<void> } };
							};
						}
					).app;
					if (!obsidianApp?.commands || !obsidianApp.vault || !obsidianApp.workspace) {
						throw new Error("Obsidian application APIs are unavailable");
					}
					const note = obsidianApp.vault.getAbstractFileByPath(notePath);
					if (!note) throw new Error(`Restore note is unavailable: ${notePath}`);
					await obsidianApp.workspace.getLeaf().openFile(note);
					if (!obsidianApp.commands.executeCommandById(commandId)) {
						throw new Error(`ScrewDriver command was not executed: ${commandId}`);
					}
				},
				{ commandId: RESTORE_COMMAND_ID, notePath: EXPORT_NOTE_PATH },
			);

			await page.locator(".notice").filter({ hasText: "Skipped unsafe restore path" }).waitFor({
				state: "visible",
				timeout: 10_000,
			});
			await page.waitForFunction(
				async (safePath) => {
					const obsidianApp = (
						globalThis as typeof globalThis & {
							app?: {
								vault?: {
									adapter?: { exists(path: string): Promise<boolean> };
								};
							};
						}
					).app;
					return await obsidianApp?.vault?.adapter?.exists(safePath) === true;
				},
				SAFE_PATH,
				{ timeout: 10_000 },
			);
		});

		const safeContent = await readFile(join(testSession.vault.path, SAFE_PATH), "utf8");
		if (safeContent !== "safe content") {
			throw new Error(`Unexpected restored content: ${JSON.stringify(safeContent)}`);
		}
		const siblingContent = await readFile(join(testSession.vault.path, SIBLING_PATH), "utf8");
		if (siblingContent !== "sibling content") {
			throw new Error(`Unexpected sibling content: ${JSON.stringify(siblingContent)}`);
		}
		const binaryContent = await readFile(join(testSession.vault.path, BINARY_PATH));
		if (!binaryContent.equals(BINARY_CONTENT)) {
			throw new Error(`Unexpected binary content: ${binaryContent.toString("hex")}`);
		}
		const skippedContent = await readFile(join(testSession.vault.path, SKIPPED_PATH), "utf8");
		if (skippedContent !== "existing content") {
			throw new Error(`Existing file was overwritten: ${JSON.stringify(skippedContent)}`);
		}
		try {
			await access(outsidePath);
			throw new Error(`Unsafe restore escaped the Vault: ${outsidePath}`);
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
			throw error;
		}
	} finally {
		await rm(outsidePath, { force: true });
	}
}

async function main(): Promise<void> {
	let testSession: ScrewDriverTestSession | undefined;
	try {
		testSession = await startScrewDriverTestSession({
			prepareVault: async (vault) => {
				const unsafePath = `../${escapeFilename(vault.path)}`;
				await mkdir(join(vault.path, "Restored"), { recursive: true });
				await writeFile(join(vault.path, SKIPPED_PATH), "existing content", "utf8");
				await writeFile(join(vault.path, EXPORT_NOTE_PATH), restoreNote(unsafePath), "utf8");
			},
		});
		await verifyRestorePathBoundary(testSession);
		console.log("ScrewDriver text, binary, skip, and traversal restore checks passed in real Obsidian");
	} finally {
		if (testSession) await stopScrewDriverTestSession(testSession);
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.stack : error);
	process.exit(1);
});
