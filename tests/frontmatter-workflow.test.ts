import { createVaultFrontmatterTestHarness } from "@vrtmrz/obsidian-plugin-kit/testing";
import { describe, expect, it } from "vitest";
import {
	addExportTarget,
	initialiseLocalExportNote,
	initialiseRemoteFetchNote,
} from "../frontmatter-workflow";

describe("ScrewDriver frontmatter workflows", () => {
	it("adds a target and filters once through the shared capability", async () => {
		const harness = createVaultFrontmatterTestHarness({
			files: {
				"Export.md": {
					targets: ["existing", "selected"],
					filters: ["main\\.js$"],
				},
			},
		});

		await addExportTarget(
			harness.vault,
			"Export.md",
			"selected",
			["main\\.js$", "manifest\\.json$"],
		);

		expect(harness.transcript).toEqual([
			{
				kind: "updateFrontmatter",
				path: "Export.md",
				before: {
					targets: ["existing", "selected"],
					filters: ["main\\.js$"],
				},
				after: {
					targets: ["existing", "selected"],
					filters: ["main\\.js$", "manifest\\.json$"],
				},
			},
		]);
	});

	it("leaves filters untouched when the selected target has none", async () => {
		const harness = createVaultFrontmatterTestHarness({
			files: { "Export.md": { filters: ["existing"] } },
		});

		await addExportTarget(harness.vault, "Export.md", "Notes", []);

		expect(harness.getFrontmatter("Export.md")).toEqual({
			filters: ["existing"],
			targets: ["Notes"],
		});
	});

	it("initialises only missing local-export properties", async () => {
		const harness = createVaultFrontmatterTestHarness({
			files: {
				"Export.md": {
					targets: ["existing"],
					comment: "Keep this comment",
					adjustObsidianDir: false,
				},
			},
		});

		await initialiseLocalExportNote(harness.vault, "Export.md");

		expect(harness.getFrontmatter("Export.md")).toEqual({
			targets: ["existing"],
			ignores: ["/node_modules", "/.git"],
			filters: [],
			comment: "Keep this comment",
			tags: [],
			adjustObsidianDir: false,
			skipNewFile: false,
			skipOldFile: false,
		});
	});

	it("initialises only missing remote-fetch properties", async () => {
		const harness = createVaultFrontmatterTestHarness({
			files: {
				"Fetch.md": {
					urls: ["https://example.com/archive.md"],
					authorization: "existing",
					skipOldFile: true,
				},
			},
		});

		await initialiseRemoteFetchNote(harness.vault, "Fetch.md");

		expect(harness.getFrontmatter("Fetch.md")).toEqual({
			urls: ["https://example.com/archive.md"],
			authorization: "existing",
			tags: [],
			header_json: "",
			skipNewFile: false,
			skipOldFile: true,
		});
	});
});
