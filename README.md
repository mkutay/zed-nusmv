# NuSMV for Zed (local extension)

Local NuSMV language support for `.smv` files in Zed, using a Tree-sitter grammar
and Zed language configuration. This is a syntax-support extension, not a port of
the upstream VS Code extension's language server.

**Not included:** an LSP, semantic analysis or model validation, a NuSMV runner,
or the NuSMV executable. Run NuSMV separately when you need model checking.

## Features

- Case-sensitive section, type, built-in and CTL/LTL operator highlighting.
- Module names, parameters, variable declarations, DEFINE names, enum members,
  constants, named specifications, integer/word literals, `--` line comments,
    and `/-- ... --/` multiline comments.
- Matching parentheses, brackets, braces and `case`/`esac`; comment toggling,
  two-space indentation, and an outline of modules, declarations and named specs.
- Structural highlighting rather than line-based declaration guesses: a `case`
  condition is not mistaken for a variable declaration.

The grammar is based on upstream's NuSMV subset, with additional support for
array definitions, parameterised range bounds, word-literal digit separators,
and multiline comments. It does not implement the complete PSL or nuXmv languages.
References are not resolved across declarations; for example, a use of a DEFINE
name is not semantically recoloured as a function. Strings are not supported.
Use a current Zed release supporting Tree-sitter ABI 15.

## Build and install

Run these commands from this directory, using Node.js 22 or newer and bun:

```sh
bun ci
bun run setup:wasi
bun run build
bun run test
bun run install:zed
```

- `bun ci` installs the locked development dependencies, including the local
  Tree-sitter CLI. It requires access to bun and any dependency download hosts.
- `bun run setup:wasi` downloads **wasi-sdk 34.0** from the official
  `WebAssembly/wasi-sdk` GitHub release. It supports macOS and Linux on arm64 and
  x86_64, and requires `curl` and `tar` on `PATH`. Downloads have retries and
  timeouts; the platform-specific pinned SHA-256 is checked **before** extraction.
  The SDK and temporary downloads stay under `.tools/` in this checkout.
- `bun run build` regenerates the parser with the local Tree-sitter CLI, using
  **ABI 15**, then compiles `grammars/nusmv.wasm` with WASI clang. It neither
  downloads tools nor installs anything into your home or Zed data directories.
- `bun run test` loads the actual WASM parser to check syntax, highlight captures,
  all Zed queries, recovery after incomplete declarations, and local installation.
- `bun run install:zed` installs the already-built bundle. It does not build or
  download anything. Installation is deliberately **not** an bun `install`
  lifecycle hook; `bun ci` alone does not install the extension into Zed.

To use an existing compatible wasi-sdk instead of downloading one, set
`WASI_SDK_PATH` to the SDK root (the directory containing `bin/clang`):

```sh
export WASI_SDK_PATH=/absolute/path/to/wasi-sdk
bun run setup:wasi
bun run build
```

With `WASI_SDK_PATH` set, setup only checks for an executable `bin/clang` and skips
the download. You are responsible for that SDK's version and integrity; use
34.0 for reproducible builds. Without the override, setup reuses only its own
marked SDK for the current host and refuses to overwrite an unrecognised
`.tools/wasi-sdk` path.

For parser generation without Wasm compilation, use `bun run generate`; generation
runs `tree-sitter generate --abi 15` in `tree-sitter-nusmv/`.

### Where installation goes

The extension ID is `nusmv-local`. Default destinations are:

| Platform | Installed bundle |
| --- | --- |
| macOS | `~/Library/Application Support/Zed/extensions/installed/nusmv-local` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/zed/extensions/installed/nusmv-local` |

On Linux, a set `XDG_DATA_HOME` must be an absolute path. To target Zed Preview,
a custom Zed data location, or an isolated integration-test directory:

```sh
bun run install:zed -- --extensions-dir /absolute/path/to/zed/extensions
```

`--extensions-dir` names the **extensions directory containing `installed/`**,
not `installed/` itself. A relative path is resolved against your current working
directory. The installer only replaces `installed/nusmv-local`, and refuses an
existing symlink, a non-directory, a missing/invalid manifest, or a manifest with
a different root `id`. It never removes other extensions.

The complete bundle is staged beside `installed/`, on the same filesystem. When
updating, the old bundle is moved to a private backup outside `installed/` before
the complete stage is renamed into place. A failed replacement restores the old
bundle where possible; if restoration fails, the error gives the preserved
backup path. Successful installs remove only their own temporary stage/backup.
An installer lock prevents simultaneous runs. If a process is forcibly killed,
inspect its reported lock and any `.nusmv-local-stage-*` or
`.nusmv-local-backup-*` directories before manually recovering them; do not
remove a lock while another installer is running.

After installation, use Zed's **Reload Extensions** command (or restart Zed),
then reopen a `.smv` file. If needed, select **NuSMV** from the language selector.
Re-run the build, tests, and installer after changing grammar or language files.

### Why not “Install Dev Extension”?

There is no published Tree-sitter NuSMV grammar repository yet. The
`[grammars.nusmv]` entry in `extension.toml` intentionally has empty `repository`
and `rev` values to register the locally prebuilt runtime grammar. Zed's
**Install Dev Extension** flow, which fetches/builds grammar repositories, is
**not supported until the grammar is published**. Use the local prebuilt-bundle
installer above instead; the empty values are not a repository URL to fill in
with an invented location.

### Troubleshooting

- **Missing CLI or compiler:** run `bun ci` and `bun run setup:wasi`, or correct
  `WASI_SDK_PATH`. The build uses `node_modules/.bin/tree-sitter`, not a globally
  installed CLI, Docker, or Emscripten.
- **Download/hash failure:** setup leaves no extracted SDK on a checksum failure
  and cleans its temporary download. Check your network/proxy and retry. Do not
  bypass the checksum. An unrecognised existing SDK must be moved aside manually
  or selected explicitly with `WASI_SDK_PATH`.
- **Refused installation:** inspect the existing `nusmv-local` path and its
  manifest. Move it aside yourself if it is not this extension; the installer
  intentionally does not force-delete it.
- **No highlighting:** confirm the bundle contains `grammars/nusmv.wasm`, reload
  extensions, select NuSMV, and inspect Zed's log for grammar/query load errors.

## Source, attribution, and licence

This extension and its new Tree-sitter/Zed adaptation are distributed under the
**Eclipse Public License 1.0 (EPL-1.0)**; see [LICENSE](LICENSE) and [NOTICE](NOTICE).

The upstream language reference is **Liam Walsh's
[vscode-nusmv](https://github.com/LiamWalsh98/vscode-nusmv)**, version **0.10.0**,
at commit **`f1fa0cbea4ee70388b8caa36ef39790f6e00e185`**, also EPL-1.0. Relevant
upstream sources include the
[Langium grammar](https://github.com/LiamWalsh98/vscode-nusmv/blob/f1fa0cbea4ee70388b8caa36ef39790f6e00e185/langium-nusmv/src/language/nusmv.langium)
and language/syntax configuration. This is a new Tree-sitter/Zed adaptation,
not a claim that upstream provides a public Tree-sitter grammar or endorses this
extension. The adaptation was generated via OpenAI for the workspace owner;
no personal author name is asserted for the workspace owner.

`LICENSE` is the actual upstream
[licence text](https://github.com/LiamWalsh98/vscode-nusmv/blob/f1fa0cbea4ee70388b8caa36ef39790f6e00e185/langium-nusmv/LICENSE.txt),
retrieved from that pinned commit without modification.

The installed bundle includes `LICENSE`, `NOTICE`, this README, the grammar's
`grammar.js` and generated `src/` (including parser C source and headers), plus
the package manifests and build scripts. These are the grammar source and build
inputs accompanying `grammars/nusmv.wasm`, not just a binary-only distribution.
Development tests and downloaded build tools are not part of that bundle. If you
redistribute a built bundle, retain the notices and make the corresponding EPL
source available under EPL-1.0; do not distribute only the Wasm file. The SDK and
bun dependencies retain their own respective licences and are not relicensed by
this extension.
