import type { Vault } from "obsidian";

/** Metadata required by ScrewDriver's restore overwrite policy. */
export interface VaultRestoreStat {
	readonly mtime: number;
}

/** Root-bound operations required to restore one file into the active Vault. */
export interface VaultRestoreAccess {
	stat(path: string): Promise<VaultRestoreStat | null>;
	ensureParentDirectories(path: string): Promise<void>;
	writeText(path: string, data: string): Promise<void>;
	writeBinary(path: string, data: ArrayBuffer): Promise<void>;
}

export type VaultRestorePayload =
	| { readonly kind: "text"; readonly data: string }
	| { readonly kind: "binary"; readonly data: ArrayBuffer };

export interface VaultRestoreRequest {
	readonly path: string;
	readonly createPayload: () => VaultRestorePayload;
	readonly storedMtime: number;
	readonly skipOldFile: boolean;
	readonly skipNewFile: boolean;
}

export type VaultRestoreResult = "written" | "skipped-up-to-date" | "skipped-existing";

/** Applies ScrewDriver's best-effort overwrite policy and restores one file. */
export async function restoreVaultFile(
	vault: VaultRestoreAccess,
	request: VaultRestoreRequest,
): Promise<VaultRestoreResult> {
	const current = await vault.stat(request.path);
	if (current !== null) {
		if (request.skipOldFile && request.storedMtime < current.mtime) {
			return "skipped-up-to-date";
		}
		if (request.skipNewFile && request.storedMtime >= current.mtime) {
			return "skipped-existing";
		}
	}

	const payload = request.createPayload();
	await vault.ensureParentDirectories(request.path);
	if (payload.kind === "text") {
		await vault.writeText(request.path, payload.data);
	} else {
		await vault.writeBinary(request.path, payload.data);
	}
	return "written";
}

/**
 * Creates a restore adapter bound to one Obsidian Vault.
 *
 * The successful-directory cache is scoped to this adapter instance. Create one
 * adapter for each restore operation so sibling files reuse parent checks while
 * later operations still observe external Vault changes.
 */
export function createObsidianVaultRestoreAccess(vault: Vault): VaultRestoreAccess {
	const ensuredDirectories = new Set<string>();

	async function ensureDirectory(path: string): Promise<void> {
		if (ensuredDirectories.has(path)) return;

		const current = await vault.adapter.stat(path);
		if (current !== null) {
			if (current.type !== "folder") {
				throw new Error(`Restore parent is not a folder: ${path}`);
			}
			ensuredDirectories.add(path);
			return;
		}

		try {
			await vault.createFolder(path);
		} catch (error) {
			// A concurrent creator may have won after the metadata check. Confirm
			// the resulting state rather than depending on Obsidian's error text.
			const afterCreate = await vault.adapter.stat(path);
			if (afterCreate?.type !== "folder") throw error;
		}
		ensuredDirectories.add(path);
	}

	return {
		stat: (path) => vault.adapter.stat(path),
		async ensureParentDirectories(path) {
			const parts = path.split("/");
			parts.pop();
			let parent = "";
			for (const part of parts) {
				parent = parent === "" ? part : `${parent}/${part}`;
				await ensureDirectory(parent);
			}
		},
		writeText: (path, data) => vault.adapter.write(path, data),
		writeBinary: (path, data) => vault.adapter.writeBinary(path, data),
	};
}
