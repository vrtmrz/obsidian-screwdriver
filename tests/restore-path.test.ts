import { UnsafePathError } from "octagonal-wheels/path";
import { describe, expect, it } from "vitest";
import {
	PORTABLE_OBSIDIAN_CONFIG_DIR,
	resolveRestorePath,
} from "../restore-path";

describe("restore path resolution", () => {
	it("preserves a canonical Vault-relative path", () => {
		expect(resolveRestorePath({
			storedPath: "Attachments/image.png",
			configDir: ".config",
			adjustObsidianDir: true,
		})).toBe("Attachments/image.png");
	});

	it("maps the portable Obsidian pseudo root below the active configuration directory", () => {
		// eslint-disable-next-line obsidianmd/hardcoded-config-path -- Fixture exercises ScrewDriver's documented portable pseudo root.
		const storedPath = ".obsidian/plugins/example/main.js";
		expect(resolveRestorePath({
			storedPath,
			configDir: ".config",
			adjustObsidianDir: true,
		})).toBe(".config/plugins/example/main.js");
	});

	it("keeps the portable pseudo root literal when adjustment is disabled", () => {
		const storedPath = `${PORTABLE_OBSIDIAN_CONFIG_DIR}/snippets/example.css`;
		expect(resolveRestorePath({
			storedPath,
			configDir: ".config",
			adjustObsidianDir: false,
		})).toBe(storedPath);
	});

	it.each([
		"",
		"/tmp/escape.md",
		"C:/Windows/system.ini",
		"../escape.md",
		"folder/../escape.md",
		"folder\\escape.md",
		"folder//file.md",
		"folder/NUL.txt",
		`${PORTABLE_OBSIDIAN_CONFIG_DIR}/../escape.md`,
	])("rejects the unsafe or non-portable path %j", (storedPath) => {
		expect(() => resolveRestorePath({
			storedPath,
			configDir: ".config",
			adjustObsidianDir: true,
		})).toThrow(UnsafePathError);
	});

	it("does not treat a similar prefix as the portable pseudo root", () => {
		expect(resolveRestorePath({
			storedPath: `${PORTABLE_OBSIDIAN_CONFIG_DIR}-backup/plugins/example/main.js`,
			configDir: ".config",
			adjustObsidianDir: true,
		})).toBe(".obsidian-backup/plugins/example/main.js");
	});

	it("preserves the exact pseudo-root path to match the historical prefix contract", () => {
		expect(resolveRestorePath({
			storedPath: PORTABLE_OBSIDIAN_CONFIG_DIR,
			configDir: ".config",
			adjustObsidianDir: true,
		})).toBe(PORTABLE_OBSIDIAN_CONFIG_DIR);
	});
});
