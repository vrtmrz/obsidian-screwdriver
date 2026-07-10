import { createUiTestHarness } from "@vrtmrz/obsidian-plugin-kit/testing";
import { describe, expect, it } from "vitest";
import {
	chooseTargetDirectory,
	INCLUDE_PLUGIN_DATA_INTERACTION_ID,
	shouldIncludePluginData,
	TARGET_DIRECTORY_INTERACTION_ID,
} from "../ui-workflow";

describe("ScrewDriver UI workflow", () => {
	it("selects one target directory through a stable interaction", async () => {
		// eslint-disable-next-line obsidianmd/hardcoded-config-path -- Fixture models ScrewDriver's portable pseudo config path.
		const directories = [".obsidian/plugins/alpha", ".obsidian/themes/beta"];
		const harness = createUiTestHarness([
			{
				kind: "pickOne",
				interactionId: TARGET_DIRECTORY_INTERACTION_ID,
				value: directories[1],
			},
		]);

		await expect(chooseTargetDirectory(harness.ui, directories)).resolves.toBe(directories[1]);
		expect(harness.transcript).toEqual([
			{
				kind: "pickOne",
				interactionId: TARGET_DIRECTORY_INTERACTION_ID,
				options: expect.objectContaining({
					items: directories,
					placeholder: "Select target directory",
				}),
			},
		]);
		harness.assertDone();
	});

	it("does not request a selection when no directories are available", async () => {
		const harness = createUiTestHarness([]);

		await expect(chooseTargetDirectory(harness.ui, [])).resolves.toBeNull();
		expect(harness.transcript).toEqual([]);
		harness.assertDone();
	});

	it("includes plug-in data only when the include action is selected", async () => {
		const harness = createUiTestHarness([
			{
				kind: "confirmAction",
				interactionId: INCLUDE_PLUGIN_DATA_INTERACTION_ID,
				value: "include",
			},
		]);

		await expect(shouldIncludePluginData(harness.ui)).resolves.toBe(true);
		expect(harness.transcript[0]).toEqual({
			kind: "confirmAction",
			interactionId: INCLUDE_PLUGIN_DATA_INTERACTION_ID,
			options: expect.objectContaining({
				actions: ["include", "exclude"],
				defaultAction: "exclude",
			}),
		});
		harness.assertDone();
	});

	it.each(["exclude", null] as const)("uses the safe exclude path for %s", async (value) => {
		const harness = createUiTestHarness([
			{
				kind: "confirmAction",
				interactionId: INCLUDE_PLUGIN_DATA_INTERACTION_ID,
				value,
			},
		]);

		await expect(shouldIncludePluginData(harness.ui)).resolves.toBe(false);
		harness.assertDone();
	});
});
