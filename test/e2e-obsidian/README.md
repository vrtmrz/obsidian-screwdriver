# Real Obsidian E2E

This local-only suite installs the built ScrewDriver plug-in into an isolated vault and profile through `@vrtmrz/obsidian-test-session`. It is not part of the default CI gate.

The add-target scenario opens a real export note, selects the installed ScrewDriver directory through the Fancy Kit picker, confirms inclusion of plug-in data through the real Markdown dialog, and verifies the note properties written by ScrewDriver. It does not use scripted UI responses.

The suite is currently validated on Linux only. Set `OBSIDIAN_BINARY` and `OBSIDIAN_CLI` when the executables are outside the shared discovery paths.

```bash
npm run check:e2e:obsidian
npm run test:e2e:obsidian:add-target
```

Set `E2E_OBSIDIAN_KEEP_VAULT=true` to preserve the temporary vault and isolated application state for debugging.
