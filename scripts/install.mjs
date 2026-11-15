// SPDX-License-Identifier: EPL-1.0
import {
    cp,
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    rename,
    rm,
    rmdir,
} from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { projectRoot, reportError } from "./common.mjs";

const extensionId = "nusmv-local";
const usage =
    "Usage: node scripts/install.mjs [--extensions-dir PATH]\nPATH is Zed's extensions directory, containing installed/ (not installed/ itself).";

function options() {
    let extensionsDirectory;
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--help" || arg === "-h") {
            console.log(usage);
            return;
        }
        let value;
        if (arg === "--extensions-dir") {
            value = args[++index];
        } else if (arg.startsWith("--extensions-dir=")) {
            value = arg.slice("--extensions-dir=".length);
        } else {
            throw new Error(`Unknown argument: ${arg}\n${usage}`);
        }
        if (
            !value ||
            value.startsWith("--") ||
            extensionsDirectory !== undefined
        ) {
            throw new Error(
                `Provide --extensions-dir exactly once with a non-empty path.\n${usage}`,
            );
        }
        extensionsDirectory = resolve(value);
    }
    if (extensionsDirectory) return extensionsDirectory;
    if (process.platform === "darwin") {
        return join(homedir(), "Library/Application Support/Zed/extensions");
    }
    if (process.platform === "linux") {
        const dataHome = process.env.XDG_DATA_HOME;
        if (dataHome && !isAbsolute(dataHome)) {
            throw new Error(
                "XDG_DATA_HOME must be absolute. Correct it or use --extensions-dir PATH.",
            );
        }
        return join(
            dataHome || join(homedir(), ".local/share"),
            "zed/extensions",
        );
    }
    throw new Error(
        "Default installation supports macOS and Linux. Use --extensions-dir PATH to select a custom Zed extensions directory.",
    );
}

async function statIfPresent(path) {
    return lstat(path).catch((error) => {
        if (error.code !== "ENOENT") throw error;
    });
}

async function requireDirectory(path) {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`Refusing non-directory or symlink: ${path}`);
    }
}

async function requireManifest(directory) {
    const manifest = join(directory, "extension.toml");
    const stat = await lstat(manifest);
    if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`Refusing non-file or symlink manifest: ${manifest}`);
    }
    const text = (await readFile(manifest, "utf8")).replace(/^\uFEFF/, "");
    // The identity belongs to the root table, not a nested grammar or language table.
    const rootTable = text.split(/^\s*\[/m, 1)[0];
    const declarations = [...rootTable.matchAll(/^\s*id\s*=/gm)];
    const ids = [
        ...rootTable.matchAll(
            /^\s*id\s*=\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)')\s*(?:#.*)?$/gm,
        ),
    ];
    if (
        declarations.length !== 1 ||
        ids.length !== 1 ||
        (ids[0][1] ?? ids[0][2]) !== extensionId
    ) {
        throw new Error(
            `Refusing foreign or unrecognised extension manifest at ${manifest}; expected id = "${extensionId}".`,
        );
    }
}

async function existingInstallation(destination) {
    const stat = await statIfPresent(destination);
    if (!stat) return false;
    await requireDirectory(destination);
    await requireManifest(destination);
    return true;
}

async function copySource(relative, bundle, { optional = false } = {}) {
    const source = join(projectRoot, relative);
    if (optional && !(await statIfPresent(source))) return;
    await mkdir(resolve(bundle, relative, ".."), { recursive: true });
    await cp(source, join(bundle, relative), {
        recursive: true,
        force: false,
        errorOnExist: true,
        filter: async (path) => {
            const stat = await lstat(path);
            if (
                stat.isSymbolicLink() ||
                (!stat.isFile() && !stat.isDirectory())
            ) {
                throw new Error(
                    `Refusing symlink or special file in extension bundle: ${path}`,
                );
            }
            return true;
        },
    });
}

async function main() {
    const extensionsDirectory = options();
    if (!extensionsDirectory) return;
    await requireManifest(projectRoot);
    for (const relative of [
        "grammars/nusmv.wasm",
        "tree-sitter-nusmv/grammar.js",
        "tree-sitter-nusmv/src/parser.c",
        "tree-sitter-nusmv/src/tree_sitter/parser.h",
    ]) {
        const stat = await statIfPresent(join(projectRoot, relative));
        if (!stat?.isFile() || stat.isSymbolicLink()) {
            throw new Error(
                `Missing regular build input ${relative}. Run bun run build before bun run install:zed.`,
            );
        }
    }

    await mkdir(extensionsDirectory, { recursive: true });
    const installed = join(extensionsDirectory, "installed");
    await mkdir(installed, { recursive: true });
    await requireDirectory(installed);
    const destination = join(installed, extensionId);
    const lock = join(extensionsDirectory, `.${extensionId}-install.lock`);
    try {
        await mkdir(lock);
    } catch (cause) {
        if (cause.code !== "EEXIST") throw cause;
        throw new Error(
            `Installer lock exists at ${lock}. Wait for the other installer; remove this lock only if no installer is running.`,
            { cause },
        );
    }

    let staging;
    let backup;
    let keepBackup = false;
    try {
        await existingInstallation(destination);
        // Neither incomplete stages nor backups are visible to Zed's installed/ watcher.
        staging = await mkdtemp(
            join(extensionsDirectory, `.${extensionId}-stage-`),
        );
        const bundle = join(staging, "bundle");
        await mkdir(bundle);
        for (const relative of [
            "extension.toml",
            "languages",
            "grammars/nusmv.wasm",
            "LICENSE",
            "NOTICE",
            "README.md",
            "tree-sitter-nusmv/grammar.js",
            "tree-sitter-nusmv/src",
            "package.json",
            "bun.lock",
            "scripts/common.mjs",
            "scripts/setup-wasi.mjs",
            "scripts/build.mjs",
            "scripts/install.mjs",
        ]) {
            await copySource(relative, bundle);
        }
        await copySource("tree-sitter-nusmv/tree-sitter.json", bundle, {
            optional: true,
        });
        await requireManifest(bundle);

        // Recheck after staging; never move or remove an unrecognised installation.
        if (await existingInstallation(destination)) {
            backup = await mkdtemp(
                join(extensionsDirectory, `.${extensionId}-backup-`),
            );
            await rename(destination, join(backup, "bundle"));
            keepBackup = true;
        }
        try {
            if (keepBackup) {
                await requireDirectory(join(backup, "bundle"));
                await requireManifest(join(backup, "bundle"));
            }
            await rename(bundle, destination);
        } catch (cause) {
            if (keepBackup) {
                try {
                    await rename(join(backup, "bundle"), destination);
                    keepBackup = false;
                } catch (rollbackError) {
                    throw new Error(
                        `Installation failed and could not restore the previous bundle. It is preserved at ${join(backup, "bundle")}. ${rollbackError.message}`,
                        { cause },
                    );
                }
            }
            throw cause;
        }
        keepBackup = false;
        console.log(
            `Installed ${extensionId} at ${destination}.\nReload Zed extensions, then reopen a .smv file or select the NuSMV language.`,
        );
    } finally {
        try {
            if (staging) await rm(staging, { recursive: true, force: true });
            if (backup && !keepBackup)
                await rm(backup, { recursive: true, force: true });
        } finally {
            await rmdir(lock);
        }
    }
}

main().catch(reportError);
