// SPDX-License-Identifier: EPL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    cp,
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const tools = join(root, ".tools");

async function fixture(t) {
    await mkdir(tools, { recursive: true });
    const directory = await mkdtemp(join(tools, "install-test-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    return directory;
}

function install(directory) {
    return spawnSync(
        process.execPath,
        ["scripts/install.mjs", "--extensions-dir", directory],
        {
            cwd: root,
            encoding: "utf8",
            timeout: 30_000,
        },
    );
}

function assertSuccess(result) {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
}

test("installs the built grammar, queries, licence and buildable sources without touching other extensions", async (t) => {
    const directory = await fixture(t);
    const unrelated = join(directory, "installed/unrelated");
    await mkdir(unrelated, { recursive: true });
    await writeFile(join(unrelated, "keep.txt"), "user extension");
    assertSuccess(install(directory));
    const installed = join(directory, "installed/nusmv-local");
    for (const file of [
        "extension.toml",
        "languages/nusmv/highlights.scm",
        "grammars/nusmv.wasm",
        "tree-sitter-nusmv/grammar.js",
        "tree-sitter-nusmv/src/parser.c",
        "LICENSE",
        "NOTICE",
    ]) {
        assert.deepEqual(
            await readFile(join(installed, file)),
            await readFile(join(root, file)),
        );
    }
    assert.equal(
        await readFile(join(unrelated, "keep.txt"), "utf8"),
        "user extension",
    );
    assert.deepEqual((await readdir(directory)).sort(), ["installed"]);
    assert.equal((await readdir(installed)).includes("node_modules"), false);
});

test("replaces only its previous bundle and cleans temporary backups", async (t) => {
    const directory = await fixture(t);
    assertSuccess(install(directory));
    const installed = join(directory, "installed/nusmv-local");
    await writeFile(join(installed, "stale.txt"), "old bundle");
    assertSuccess(install(directory));
    await assert.rejects(lstat(join(installed, "stale.txt")), {
        code: "ENOENT",
    });
    assert.deepEqual(await readdir(directory), ["installed"]);
});

test("refuses to replace a foreign extension manifest", async (t) => {
    const directory = await fixture(t);
    const destination = join(directory, "installed/nusmv-local");
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, "extension.toml"), 'id = "not-ours"\n');
    const result = install(directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refusing foreign/);
    assert.equal(
        await readFile(join(destination, "extension.toml"), "utf8"),
        'id = "not-ours"\n',
    );
    assert.deepEqual(await readdir(directory), ["installed"]);
});

test("refuses to replace or traverse an existing dev-extension symlink", async (t) => {
    const directory = await fixture(t);
    const target = join(directory, "dev-source");
    await mkdir(target);
    await cp(join(root, "extension.toml"), join(target, "extension.toml"));
    await mkdir(join(directory, "installed"));
    const destination = join(directory, "installed/nusmv-local");
    await symlink(target, destination, "dir");
    const result = install(directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refusing non-directory or symlink/);
    assert.equal((await lstat(destination)).isSymbolicLink(), true);
    assert.deepEqual(
        await readFile(join(target, "extension.toml")),
        await readFile(join(root, "extension.toml")),
    );
});
