import type { UiInteractions } from "@vrtmrz/obsidian-plugin-kit/ui";

export const TARGET_DIRECTORY_INTERACTION_ID = "add-target-directory";
export const INCLUDE_PLUGIN_DATA_INTERACTION_ID = "include-plugin-data";

/** Selects one export target, or returns `null` when there is no target or the dialog is dismissed. */
export async function chooseTargetDirectory(
	ui: UiInteractions,
	directories: readonly string[],
): Promise<string | null> {
	if (directories.length === 0) return null;
	return await ui.pickOne(
		{
			items: directories,
			getText: (directory) => directory,
			placeholder: "Select target directory",
		},
		TARGET_DIRECTORY_INTERACTION_ID,
	);
}

/** Returns whether plug-in data should be included; dismissal follows the safe exclude path. */
export async function shouldIncludePluginData(ui: UiInteractions): Promise<boolean> {
	const action = await ui.confirmAction(
		{
			title: "Include plug-in data?",
			message: "Include the plug-in's `data.json` file in this export note?",
			actions: ["include", "exclude"] as const,
			labels: { include: "Include", exclude: "Exclude" },
			defaultAction: "exclude",
		},
		INCLUDE_PLUGIN_DATA_INTERACTION_ID,
	);
	return action === "include";
}
