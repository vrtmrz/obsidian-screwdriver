# Developer guide

## Setup and checks

Install the locked dependencies and run the repository gate:

```bash
npm ci
npm run check
npm run build
```

Pull requests and pushes to `main` run the same clean installation, repository check, production build, and local-only E2E script typecheck on GitHub Actions. CI does not download or launch Obsidian. Real Obsidian remains an explicit local validation because repeatedly acquiring and launching the desktop application is inappropriate for the default remote gate without a separate review of distribution traffic, caching, and runner support.

## UI boundary

The plug-in owns one `UiInteractions` capability for its lifetime:

```ts
this.ui = createObsidianUi(this.app);
```

`ui-workflow.ts` accepts that capability instead of constructing Obsidian modals. The target-directory selector and plug-in-data confirmation use stable interaction IDs and keep visible labels separate from returned action identifiers.

Application-flow tests use the App-free harness from Fancy Kit:

```ts
const harness = createUiTestHarness([
	{ kind: "confirmAction", interactionId: "include-plugin-data", value: "include" },
]);
```

Scripted responses are instance-scoped. Call `assertDone()` so an expected interaction that did not occur fails the test. Closing the plug-in-data confirmation follows the safe exclude path.

## Fancy Kit dependencies

The Fancy Kit packages and `octagonal-wheels` are pinned to exact npm versions so the tested dependency set remains reproducible. Review and update the four versions together when adopting a newer contract. The restore path boundary currently consumes the path contract introduced in `octagonal-wheels@0.1.48`.

The App-free tests verify workflow policy and the UI transcript. They do not replace real Obsidian coverage for modal rendering, keyboard handling, focus, or theme behaviour.

The local-only real-Obsidian scenario installs the production build into an isolated vault, selects an actual plug-in directory, confirms inclusion of plug-in data, and verifies the resulting note properties. It does not configure a scripted UI driver:

```bash
npm run check:e2e:obsidian
npm run test:e2e:obsidian:add-target
npm run test:e2e:obsidian:restore-paths
```

Real-Obsidian E2E is currently validated on Linux only and is not part of the default CI gate.

## Vault read boundary

`vault-read.ts` defines the narrow, ScrewDriver-owned capabilities used by target discovery and dump capture: direct-child listing, binary reads, and metadata reads. The production composition supplies `app.vault.adapter`, which is already bound to the active Vault root. All paths passed to these helpers remain Vault-relative; the helpers do not select or discover a root.

The App-free tests use structural fakes to verify recursive listing results, ignored-subtree behaviour, exact binary data, missing metadata, and deterministic adapter operation counts. These types are an internal consumer pilot, not a neutral Fancy Kit storage API.

Restore writes and directory creation use the separate, operation-specific boundary described below. Neither boundary is a neutral Fancy Kit storage API.

## Vault restore boundary

`vault-restore.ts` separates ScrewDriver's overwrite policy from the concrete Obsidian Vault operations. `restoreVaultFile` accepts only metadata, parent-directory preparation, text upsert, and binary upsert capabilities. The production adapter is created once for each restore command and remains bound to the active Vault root.

The adapter checks and creates each successful parent folder once during that command. It confirms folder state structurally instead of matching an English Obsidian error message, and a folder-creation failure stops the affected write. App-free tests preserve the existing modification-time comparisons, including the historical overwrite behaviour for an invalid stored timestamp, and verify operation order, exact binary data, and failure propagation.

These capabilities remain ScrewDriver-owned. In particular, writes are create-or-overwrite operations, the modification-time check is best-effort rather than atomic, and OW path validation provides lexical safety rather than symbolic-link containment. Compare these semantics with another concrete consumer before extracting a neutral storage contract.

## Restore path boundary

Paths parsed from fenced block headers are untrusted input. `restore-path.ts` uses `octagonal-wheels/path` to accept only canonical portable relative paths before any Vault adapter `stat`, directory creation, or write operation.

With `adjustObsidianDir` enabled, a validated `.obsidian/` suffix is resolved below the trusted `vault.configDir`. Other paths remain Vault-relative. Unsafe input is skipped rather than normalised; this prevents absolute paths, parent traversal, backslash variants, empty components, control characters, and portable-invalid names from changing meaning on another platform.

The App-free suite owns the path policy contract. The local real-Obsidian restore scenario verifies that a safe block is written inside the isolated Vault while an unsafe sibling traversal is not written outside it.
