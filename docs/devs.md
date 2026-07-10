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

Until Fancy Kit is published to npm, its packages are pinned to immutable tarballs from one GitHub prerelease. Update the UI interactions and Obsidian plug-in kit URLs together when a migration needs a newer preview.

The App-free tests verify workflow policy and the UI transcript. They do not replace real Obsidian coverage for modal rendering, keyboard handling, focus, or theme behaviour.

The local-only real-Obsidian scenario installs the production build into an isolated vault, selects an actual plug-in directory, confirms inclusion of plug-in data, and verifies the resulting note properties. It does not configure a scripted UI driver:

```bash
npm run check:e2e:obsidian
npm run test:e2e:obsidian:add-target
```

Real-Obsidian E2E is currently validated on Linux only and is not part of the default CI gate.
