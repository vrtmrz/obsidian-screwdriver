import type { Stat } from "obsidian";

/** Direct children returned by a root-bound Vault directory adapter. */
export interface VaultDirectoryListing {
	readonly files: readonly string[];
	readonly folders: readonly string[];
}

/** Directory-read capability used by ScrewDriver's target discovery and dump workflow. */
export interface VaultDirectoryReadAccess {
	list(path: string): Promise<VaultDirectoryListing>;
}

/** Binary-read capability used while capturing a file for a ScrewDriver dump. */
export interface VaultBinaryReadAccess {
	readBinary(path: string): Promise<ArrayBuffer>;
}

/** Metadata capability used while capturing a file for a ScrewDriver dump. */
export interface VaultMetadataReadAccess {
	stat(path: string): Promise<Stat | null>;
}

/** Minimal root-bound Vault capability required to capture one dump file. */
export interface VaultDumpFileReadAccess extends VaultBinaryReadAccess, VaultMetadataReadAccess {}

export interface VaultDumpFile {
	readonly data: ArrayBuffer;
	readonly stat: Stat;
}

/** Lists matching files recursively without entering ignored folders. */
export async function listVaultFilesRecursively(
	vault: VaultDirectoryReadAccess,
	path: string,
	ignoreList: readonly string[],
	filter: readonly RegExp[] | null,
): Promise<string[]> {
	const listing = await vault.list(path);
	let files = listing.files
		.filter((file) => !ignoreList.some((ignored) => file.endsWith(ignored)))
		.filter((file) => filter === null || filter.some((pattern) => file.match(pattern)));

	for (const folder of listing.folders) {
		if (ignoreList.some((ignored) => folder.endsWith(ignored))) continue;
		files = files.concat(await listVaultFilesRecursively(vault, folder, ignoreList, filter));
	}
	return files;
}

/** Lists folders recursively without entering ignored folders. */
export async function listVaultDirectoriesRecursively(
	vault: VaultDirectoryReadAccess,
	path: string,
	ignoreList: readonly string[],
): Promise<string[]> {
	const listing = await vault.list(path);
	let directories: string[] = [];
	for (const folder of listing.folders) {
		if (ignoreList.some((ignored) => folder.endsWith(ignored))) continue;
		directories = directories.concat(folder);
		directories = directories.concat(await listVaultDirectoriesRecursively(vault, folder, ignoreList));
	}
	return directories;
}

/** Reads one dump file while preserving ScrewDriver's existing read-then-stat order. */
export async function readVaultFileForDump(
	vault: VaultDumpFileReadAccess,
	path: string,
): Promise<VaultDumpFile | null> {
	const data = await vault.readBinary(path);
	const stat = await vault.stat(path);
	return stat === null ? null : { data, stat };
}
