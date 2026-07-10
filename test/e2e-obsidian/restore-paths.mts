import { access, readFile, rm, writeFile } from "node:fs/promises";
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
const SAFE_PATH = "Restored/safe.txt";

function escapeFilename(vaultPath: string): string {
	return `screwdriver-escape-${basename(vaultPath)}.txt`;
}

function restoreNote(unsafePath: string): string {
	return `---
adjustObsidianDir: true
skipNewFile: false
skipOldFile: false
---

\`\`\`screwdriver:${unsafePath}:plain:0
unsafe content
\`\`\`

\`\`\`screwdriver:${SAFE_PATH}:plain:0
safe content
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
				await writeFile(join(vault.path, EXPORT_NOTE_PATH), restoreNote(unsafePath), "utf8");
			},
		});
		await verifyRestorePathBoundary(testSession);
		console.log("ScrewDriver safe restore and traversal rejection passed in real Obsidian");
	} finally {
		if (testSession) await stopScrewDriverTestSession(testSession);
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.stack : error);
	process.exit(1);
});
