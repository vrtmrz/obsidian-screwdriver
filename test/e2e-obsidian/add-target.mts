import { withObsidianPage } from "@vrtmrz/obsidian-test-session";
import {
	EXPORT_NOTE_PATH,
	SCREWDRIVER_PLUGIN_ID,
	startScrewDriverTestSession,
	stopScrewDriverTestSession,
	type ScrewDriverTestSession,
} from "./harness.mts";

const ADD_TARGET_COMMAND_ID = `${SCREWDRIVER_PLUGIN_ID}:screwdriver-add-target-dir`;

async function verifyAddTargetWorkflow(testSession: ScrewDriverTestSession): Promise<void> {
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
				if (!note) throw new Error(`Export note is unavailable: ${notePath}`);
				await obsidianApp.workspace.getLeaf().openFile(note);
				if (!obsidianApp.commands.executeCommandById(commandId)) {
					throw new Error(`ScrewDriver command was not executed: ${commandId}`);
				}
			},
			{ commandId: ADD_TARGET_COMMAND_ID, notePath: EXPORT_NOTE_PATH },
		);

		const prompt = page.locator(".prompt").last();
		await prompt.waitFor({ state: "visible", timeout: 10_000 });
		const targetPath = `.obsidian/plugins/${SCREWDRIVER_PLUGIN_ID}`;
		const targetItem = prompt.locator(".suggestion-item").filter({ hasText: targetPath });
		await targetItem.waitFor();
		await targetItem.click();

		const confirmation = page.locator(".modal-container .modal").filter({ hasText: "Include plug-in data?" }).last();
		await confirmation.waitFor({ state: "visible", timeout: 10_000 });
		await confirmation.getByRole("button", { name: "Include", exact: true }).click();

		await page.waitForFunction(
			async ({ notePath, targetPath }) => {
				const obsidianApp = (
					globalThis as typeof globalThis & {
						app?: {
							vault?: {
								getAbstractFileByPath(path: string): unknown;
								read(file: unknown): Promise<string>;
							};
						};
					}
				).app;
				const vault = obsidianApp?.vault;
				const note = vault?.getAbstractFileByPath(notePath);
				if (!vault || !note) return false;
				const content = await vault.read(note);
				return content.includes(`- ${targetPath}`) && content.includes("data\\.json$");
			},
			{ notePath: EXPORT_NOTE_PATH, targetPath },
			{ timeout: 10_000 },
		);
	});
}

async function main(): Promise<void> {
	let testSession: ScrewDriverTestSession | undefined;
	try {
		testSession = await startScrewDriverTestSession();
		await verifyAddTargetWorkflow(testSession);
		console.log("ScrewDriver target selection and confirmation passed in real Obsidian");
	} finally {
		if (testSession) await stopScrewDriverTestSession(testSession);
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.stack : error);
	process.exit(1);
});
