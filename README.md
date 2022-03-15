## Screwdriver

The plugin for picking and putting hidden files.

You can dump your files which stored in the specified directory, or put dumped files into any path under your vault.

### How to use

#### Install
Install this plugin via [BRAT](https://github.com/TfTHacker/obsidian42-brat).


#### Prepare a file that to saving dump.

As like this:

```md
---
# --- Select a directory to dump. ---
target: .obsidian/snippets

# --- Prefixes to ignore. ---
ignores:
- /node_modules
- /.git

# --- Regular expressions to filter files
filters:
# - \.js
---

```
Don't worry. You can make this file by `Ctrl+P` -> `Screwdriver: Create dump template` in an empty file.
All you have to do is pick the target directory.

#### Dump

`Ctrl+P` -> `Dump files` to dump files to note.

```md
---
# --- Select a directory to dump. ---
target: .obsidian/snippets

# --- Prefixes to ignore. ---
ignores:
- /node_modules
- /.git

# --- Regular expressions to filter files
filters:
# - \.js
---

# .obsidian/snippets/fonts_jp.css
- Created :2021/4/01 04:11:10
- Modified:2022/1/10 06:34:03

```.obsidian/snippets/fonts_jp.css
:root {
    --default-font: -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji;
    --editor-font: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
    --override-font: "HackGen35";

    ：
    ：
```

Note: Dumped files can be modifiable by editing the doc.

#### Restore
`Ctrl+P` -> `Restore files` to restore files into your storage.

Note: Wrote as the filename following ```

If you're using [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) or [remotely-save](https://github.com/fyears/remotely-save), it could be useful to synchronize your configuration between devices.