import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	createTemporaryVault,
	discoverObsidianCli,
	requireObsidianBinary,
	startObsidianPluginSession,
	type ObsidianPluginSession,
	type TemporaryVault,
} from "@vrtmrz/obsidian-test-session";

export const SCREWDRIVER_PLUGIN_ID = "obsidian-screwdriver";
export const EXPORT_NOTE_PATH = "Export.md";

export interface ScrewDriverTestSession {
	readonly session: ObsidianPluginSession;
	readonly vault: TemporaryVault;
}

export interface StartScrewDriverTestSessionOptions {
	readonly prepareVault?: (vault: TemporaryVault) => Promise<void>;
}

export async function startScrewDriverTestSession(
	options: StartScrewDriverTestSessionOptions = {},
): Promise<ScrewDriverTestSession> {
	const cli = discoverObsidianCli();
	if (!cli.binary) throw new Error(`Could not find obsidian-cli. Checked: ${cli.checked.join(", ")}`);
	const vault = await createTemporaryVault({
		prefix: "screwdriver-e2e-",
		pluginIds: [SCREWDRIVER_PLUGIN_ID],
		idPrefix: "screwdriver-e2e",
	});
	try {
		await writeFile(join(vault.path, EXPORT_NOTE_PATH), "---\ntargets: []\nfilters: []\n---\n", "utf8");
		await options.prepareVault?.(vault);
		const session = await startObsidianPluginSession({
			binary: requireObsidianBinary(),
			cliBinary: cli.binary,
			vault,
			pluginId: SCREWDRIVER_PLUGIN_ID,
			artifactRoot: resolve("."),
			startupGraceMs: Number(process.env.E2E_OBSIDIAN_STARTUP_GRACE_MS ?? 1_000),
		});
		return { session, vault };
	} catch (error) {
		await vault.dispose();
		throw error;
	}
}

export async function stopScrewDriverTestSession(testSession: ScrewDriverTestSession): Promise<void> {
	await testSession.session.app.stop();
	await testSession.vault.dispose();
}
