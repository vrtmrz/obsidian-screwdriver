import type {
	VaultFrontmatterAccess,
} from "@vrtmrz/obsidian-plugin-kit/vault";

/** Frontmatter capability required by ScrewDriver note workflows. */
export type ScrewDriverFrontmatterAccess = Pick<
	VaultFrontmatterAccess,
	"updateFrontmatter"
>;

function appendUnique(current: unknown, additions: readonly string[]): unknown[] {
	return [...new Set([...((current ?? []) as unknown[]), ...additions])];
}

/** Adds one export target and its optional filters to an existing note. */
export async function addExportTarget(
	frontmatter: ScrewDriverFrontmatterAccess,
	notePath: string,
	target: string,
	filters: readonly string[],
): Promise<void> {
	await frontmatter.updateFrontmatter(notePath, (value) => {
		value.targets = appendUnique(value.targets, [target]);
		if (filters.length > 0) {
			value.filters = appendUnique(value.filters, filters);
		}
	});
}

/** Initialises missing local-export properties without replacing existing values. */
export async function initialiseLocalExportNote(
	frontmatter: ScrewDriverFrontmatterAccess,
	notePath: string,
): Promise<void> {
	await frontmatter.updateFrontmatter(notePath, (value) => {
		value.targets = value.targets ?? [];
		value.ignores = value.ignores ?? ["/node_modules", "/.git"];
		value.filters = value.filters ?? [];
		value.comment = value.comment ?? "Use 'Add folder to this export note' to add targets";
		value.tags = value.tags ?? [];
		value.adjustObsidianDir = value.adjustObsidianDir ?? true;
		value.skipNewFile = value.skipNewFile ?? false;
		value.skipOldFile = value.skipOldFile ?? false;
	});
}

/** Initialises missing remote-fetch properties without replacing existing values. */
export async function initialiseRemoteFetchNote(
	frontmatter: ScrewDriverFrontmatterAccess,
	notePath: string,
): Promise<void> {
	await frontmatter.updateFrontmatter(notePath, (value) => {
		value.urls = value.urls ?? [];
		value.authorization = value.authorization ?? "";
		value.tags = value.tags ?? [];
		value.header_json = value.header_json ?? "";
		value.skipNewFile = value.skipNewFile ?? false;
		value.skipOldFile = value.skipOldFile ?? false;
	});
}
