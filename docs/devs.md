# Developer guide

## Setup and checks

Install the locked dependencies and run the repository gate:

```bash
npm ci
npm run check
npm run build
```

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

## Fancy Kit preview

Until Fancy Kit is published to npm, its packages are pinned to immutable tarballs from one GitHub prerelease. Update all Fancy Kit package URLs used by the plug-in together when a migration needs a newer preview. The restore path boundary currently consumes the OW prerelease from the same preview tag.

The App-free tests verify workflow policy and the UI transcript. They do not replace real Obsidian coverage for modal rendering, keyboard handling, focus, or theme behaviour.

The local-only real-Obsidian scenario installs the production build into an isolated vault, selects an actual plug-in directory, confirms inclusion of plug-in data, and verifies the resulting note properties. It does not configure a scripted UI driver:

```bash
npm run check:e2e:obsidian
npm run test:e2e:obsidian:add-target
npm run test:e2e:obsidian:restore-paths
```

Real-Obsidian E2E is currently validated on Linux only and is not part of the default CI gate.

## Restore path boundary

Paths parsed from fenced block headers are untrusted input. `restore-path.ts` uses `octagonal-wheels/path` to accept only canonical portable relative paths before any Vault adapter `stat`, directory creation, or write operation.

With `adjustObsidianDir` enabled, a validated `.obsidian/` suffix is resolved below the trusted `vault.configDir`. Other paths remain Vault-relative. Unsafe input is skipped rather than normalised; this prevents absolute paths, parent traversal, backslash variants, empty components, control characters, and portable-invalid names from changing meaning on another platform.

The App-free suite owns the path policy contract. The local real-Obsidian restore scenario verifies that a safe block is written inside the isolated Vault while an unsafe sibling traversal is not written outside it.
