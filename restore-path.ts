import { parseSafeRelativePath, resolvePathWithinRoot } from "octagonal-wheels/path";

// eslint-disable-next-line obsidianmd/hardcoded-config-path -- Portable pseudo root stored in ScrewDriver notes, not the active Vault configuration path.
export const PORTABLE_OBSIDIAN_CONFIG_DIR = ".obsidian";

/** Inputs used to validate and resolve one path stored in a ScrewDriver block. */
export interface ResolveRestorePathOptions {
	/** Untrusted path parsed from the block header. */
	readonly storedPath: string;
	/** Trusted configuration directory reported by the active Vault. */
	readonly configDir: string;
	/** Whether the portable `.obsidian/` pseudo root should map to {@link configDir}. */
	readonly adjustObsidianDir: boolean;
}

/**
 * Validates a stored path and resolves it to the Vault adapter namespace.
 *
 * @throws `UnsafePathError` when the path is not a canonical portable relative path.
 */
export function resolveRestorePath(options: ResolveRestorePathOptions): string {
	const safeStoredPath = parseSafeRelativePath(options.storedPath);
	const portablePrefix = `${PORTABLE_OBSIDIAN_CONFIG_DIR}/`;
	if (options.adjustObsidianDir && safeStoredPath.startsWith(portablePrefix)) {
		return resolvePathWithinRoot(
			options.configDir,
			safeStoredPath.substring(portablePrefix.length),
		);
	}
	return safeStoredPath;
}
