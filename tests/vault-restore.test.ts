import type { Vault } from "obsidian";
import { describe, expect, it } from "vitest";
import {
	createObsidianVaultRestoreAccess,
	restoreVaultFile,
	type VaultRestoreAccess,
	type VaultRestoreRequest,
} from "../vault-restore";

function request(overrides: Partial<VaultRestoreRequest> = {}): VaultRestoreRequest {
	return {
		path: "folder/file.txt",
		createPayload: () => ({ kind: "text", data: "content" }),
		storedMtime: 20,
		skipOldFile: false,
		skipNewFile: false,
		...overrides,
	};
}

function createRestoreAccess(statMtime: number | null = null) {
	const transcript: string[] = [];
	const vault: VaultRestoreAccess = {
		stat(path) {
			transcript.push(`stat:${path}`);
			return Promise.resolve(statMtime === null ? null : { mtime: statMtime });
		},
		ensureParentDirectories(path) {
			transcript.push(`ensure:${path}`);
			return Promise.resolve();
		},
		writeText(path, data) {
			transcript.push(`writeText:${path}:${data}`);
			return Promise.resolve();
		},
		writeBinary(path, data) {
			transcript.push(`writeBinary:${path}:${Array.from(new Uint8Array(data)).join(",")}`);
			return Promise.resolve();
		},
	};
	return { transcript, vault };
}

describe("restoreVaultFile", () => {
	it("writes a missing text file after ensuring its parent", async () => {
		const access = createRestoreAccess();
		await expect(restoreVaultFile(access.vault, request())).resolves.toBe("written");
		expect(access.transcript).toEqual([
			"stat:folder/file.txt",
			"ensure:folder/file.txt",
			"writeText:folder/file.txt:content",
		]);
	});

	it("forwards the exact binary view", async () => {
		const access = createRestoreAccess();
		const allocation = new Uint8Array([9, 1, 2, 3, 9]);
		const data = allocation.buffer.slice(1, 4);
		await restoreVaultFile(access.vault, request({
			path: "folder/file.bin",
			createPayload: () => ({ kind: "binary", data }),
		}));
		expect(access.transcript).toEqual([
			"stat:folder/file.bin",
			"ensure:folder/file.bin",
			"writeBinary:folder/file.bin:1,2,3",
		]);
	});

	it.each([
		{ storedMtime: 19, currentMtime: 20, expected: "skipped-up-to-date" as const },
		{ storedMtime: 20, currentMtime: 20, expected: "skipped-existing" as const },
		{ storedMtime: 21, currentMtime: 20, expected: "skipped-existing" as const },
	])("preserves the skip boundary for $storedMtime against $currentMtime", async ({
		storedMtime,
		currentMtime,
		expected,
	}) => {
		const access = createRestoreAccess(currentMtime);
		await expect(restoreVaultFile(access.vault, request({
			storedMtime,
			skipOldFile: true,
			skipNewFile: true,
		}))).resolves.toBe(expected);
		expect(access.transcript).toEqual(["stat:folder/file.txt"]);
	});

	it("does not decode payload for a skipped file", async () => {
		const access = createRestoreAccess(20);
		let payloadCreated = false;
		await expect(restoreVaultFile(access.vault, request({
			storedMtime: 19,
			skipOldFile: true,
			createPayload() {
				payloadCreated = true;
				throw new Error("payload should not be created");
			},
		}))).resolves.toBe("skipped-up-to-date");
		expect(payloadCreated).toBe(false);
	});

	it("does not prepare directories when payload decoding fails", async () => {
		const access = createRestoreAccess();
		await expect(restoreVaultFile(access.vault, request({
			createPayload() {
				throw new Error("decode failed");
			},
		}))).rejects.toThrow("decode failed");
		expect(access.transcript).toEqual(["stat:folder/file.txt"]);
	});

	it.each([
		{ storedMtime: 20, currentMtime: 20, skipOldFile: true, skipNewFile: false },
		{ storedMtime: 19, currentMtime: 20, skipOldFile: false, skipNewFile: true },
	])("writes across the non-skipping boundary %#", async ({
		storedMtime,
		currentMtime,
		skipOldFile,
		skipNewFile,
	}) => {
		const access = createRestoreAccess(currentMtime);
		await expect(restoreVaultFile(access.vault, request({
			storedMtime,
			skipOldFile,
			skipNewFile,
		}))).resolves.toBe("written");
		expect(access.transcript).toHaveLength(3);
	});

	it("preserves overwrite behaviour for an invalid stored modification time", async () => {
		const access = createRestoreAccess(20);
		await expect(restoreVaultFile(access.vault, request({
			storedMtime: Number.NaN,
			skipOldFile: true,
			skipNewFile: true,
		}))).resolves.toBe("written");
		expect(access.transcript).toHaveLength(3);
	});

	it("does not continue after parent preparation fails", async () => {
		const access = createRestoreAccess();
		access.vault.ensureParentDirectories = () => Promise.reject(new Error("mkdir failed"));
		await expect(restoreVaultFile(access.vault, request())).rejects.toThrow("mkdir failed");
		expect(access.transcript).toEqual(["stat:folder/file.txt"]);
	});

	it("propagates write failures", async () => {
		const access = createRestoreAccess();
		access.vault.writeText = () => Promise.reject(new Error("write failed"));
		await expect(restoreVaultFile(access.vault, request())).rejects.toThrow("write failed");
		expect(access.transcript).toEqual([
			"stat:folder/file.txt",
			"ensure:folder/file.txt",
		]);
	});
});

describe("createObsidianVaultRestoreAccess", () => {
	it("ensures shared nested parents once and root-level files without directory work", async () => {
		const transcript: string[] = [];
		const folders = new Set<string>();
		const vault = {
			adapter: {
				stat(path: string) {
					transcript.push(`stat:${path}`);
					return Promise.resolve(folders.has(path)
						? { ctime: 0, mtime: 0, size: 0, type: "folder" as const }
						: null);
				},
				write(path: string) {
					transcript.push(`write:${path}`);
					return Promise.resolve();
				},
				writeBinary() {
					return Promise.resolve();
				},
			},
			createFolder(path: string) {
				transcript.push(`mkdir:${path}`);
				folders.add(path);
				return Promise.resolve({});
			},
		} as unknown as Vault;
		const access = createObsidianVaultRestoreAccess(vault);

		await access.ensureParentDirectories("one/two/a.txt");
		await access.ensureParentDirectories("one/two/b.txt");
		await access.ensureParentDirectories("root.txt");

		expect(transcript).toEqual([
			"stat:one",
			"mkdir:one",
			"stat:one/two",
			"mkdir:one/two",
		]);
	});

	it("accepts a folder created concurrently without inspecting error text", async () => {
		let statCalls = 0;
		const vault = {
			adapter: {
				stat() {
					statCalls += 1;
					return Promise.resolve(statCalls === 1
						? null
						: { ctime: 0, mtime: 0, size: 0, type: "folder" as const });
				},
				write() { return Promise.resolve(); },
				writeBinary() { return Promise.resolve(); },
			},
			createFolder() { return Promise.reject(new Error("localised concurrent error")); },
		} as unknown as Vault;

		await expect(createObsidianVaultRestoreAccess(vault)
			.ensureParentDirectories("folder/file.txt")).resolves.toBeUndefined();
	});

	it("rejects a parent occupied by a file", async () => {
		const vault = {
			adapter: {
				stat() {
					return Promise.resolve({ ctime: 0, mtime: 0, size: 1, type: "file" as const });
				},
				write() { return Promise.resolve(); },
				writeBinary() { return Promise.resolve(); },
			},
			createFolder() { return Promise.resolve({}); },
		} as unknown as Vault;

		await expect(createObsidianVaultRestoreAccess(vault)
			.ensureParentDirectories("folder/file.txt"))
			.rejects.toThrow("Restore parent is not a folder: folder");
	});
});
