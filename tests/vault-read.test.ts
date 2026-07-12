import type { Stat } from "obsidian";
import { describe, expect, it } from "vitest";
import {
	listVaultDirectoriesRecursively,
	listVaultFilesRecursively,
	readVaultFileForDump,
	type VaultDirectoryListing,
	type VaultDirectoryReadAccess,
	type VaultDumpFileReadAccess,
} from "../vault-read";

function createDirectoryAccess(listings: Readonly<Record<string, VaultDirectoryListing>>) {
	const transcript: string[] = [];
	const vault: VaultDirectoryReadAccess = {
		list(path) {
			transcript.push(path);
			const listing = listings[path];
			if (listing === undefined) throw new Error(`Unexpected directory read: ${path}`);
			return Promise.resolve(listing);
		},
	};
	return { transcript, vault };
}

describe("Vault read capabilities", () => {
	it("lists filtered files once per visited directory without scanning ignored folders", async () => {
		const access = createDirectoryAccess({
			".config": {
				files: [".config/app.json", ".config/workspace"],
				folders: [".config/plugins", ".config/node_modules"],
			},
			".config/plugins": {
				files: [".config/plugins/manifest.json", ".config/plugins/main.js"],
				folders: [".config/plugins/example"],
			},
			".config/plugins/example": {
				files: [".config/plugins/example/data.json", ".config/plugins/example/styles.css"],
				folders: [],
			},
		});

		await expect(listVaultFilesRecursively(
			access.vault,
			".config",
			["node_modules"],
			[/\.json$/],
		)).resolves.toEqual([
			".config/app.json",
			".config/plugins/manifest.json",
			".config/plugins/example/data.json",
		]);
		expect(access.transcript).toEqual([
			".config",
			".config/plugins",
			".config/plugins/example",
		]);
	});

	it("lists directories without entering ignored subtrees", async () => {
		const access = createDirectoryAccess({
			".config": {
				files: [],
				folders: [".config/plugins", ".config/.git"],
			},
			".config/plugins": {
				files: [],
				folders: [".config/plugins/example"],
			},
			".config/plugins/example": { files: [], folders: [] },
		});

		await expect(listVaultDirectoriesRecursively(
			access.vault,
			".config",
			[".git"],
		)).resolves.toEqual([
			".config/plugins",
			".config/plugins/example",
		]);
		expect(access.transcript).toEqual([
			".config",
			".config/plugins",
			".config/plugins/example",
		]);
	});

	it("lists every non-ignored file when no filter is configured", async () => {
		const access = createDirectoryAccess({
			Notes: {
				files: ["Notes/one.md", "Notes/two.bin", "Notes/generated.tmp"],
				folders: [],
			},
		});

		await expect(listVaultFilesRecursively(
			access.vault,
			"Notes",
			[".tmp"],
			null,
		)).resolves.toEqual([
			"Notes/one.md",
			"Notes/two.bin",
		]);
		expect(access.transcript).toEqual(["Notes"]);
	});

	it("captures exact binary data and metadata through a narrow capability", async () => {
		const transcript: string[] = [];
		const data = new Uint8Array([1, 2, 3]).buffer;
		const stat: Stat = { ctime: 10, mtime: 20, size: 3, type: "file" };
		const vault: VaultDumpFileReadAccess = {
			readBinary(path) {
				transcript.push(`readBinary:${path}`);
				return Promise.resolve(data);
			},
			stat(path) {
				transcript.push(`stat:${path}`);
				return Promise.resolve(stat);
			},
		};

		await expect(readVaultFileForDump(vault, "Assets/image.bin")).resolves.toEqual({ data, stat });
		expect(transcript).toEqual([
			"readBinary:Assets/image.bin",
			"stat:Assets/image.bin",
		]);
	});

	it("returns null when metadata disappears after the binary read", async () => {
		const transcript: string[] = [];
		const vault: VaultDumpFileReadAccess = {
			readBinary(path) {
				transcript.push(`readBinary:${path}`);
				return Promise.resolve(new ArrayBuffer(0));
			},
			stat(path) {
				transcript.push(`stat:${path}`);
				return Promise.resolve(null);
			},
		};

		await expect(readVaultFileForDump(vault, "removed.bin")).resolves.toBeNull();
		expect(transcript).toEqual([
			"readBinary:removed.bin",
			"stat:removed.bin",
		]);
	});
});
