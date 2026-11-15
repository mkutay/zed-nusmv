// SPDX-License-Identifier: EPL-1.0
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { projectRoot, reportError, requireSdk, run } from "./common.mjs";

async function main() {
    const clang = await requireSdk();
    const treeSitter = join(projectRoot, "node_modules/.bin/tree-sitter");
    try {
        await access(treeSitter, constants.X_OK);
    } catch (cause) {
        throw new Error(
            "Local Tree-sitter CLI is missing. Run bun ci before building.",
            { cause },
        );
    }

    const grammar = join(projectRoot, "tree-sitter-nusmv");
    run(treeSitter, ["generate", "--abi", "15"], { cwd: grammar });

    const grammars = join(projectRoot, "grammars");
    await mkdir(grammars, { recursive: true });
    const temporary = await mkdtemp(join(grammars, ".nusmv-build-"));
    try {
        const output = join(temporary, "nusmv.wasm");
        run(
            clang,
            [
                // The generated parser needs no libc. SDK 34 otherwise adds a libc.so
                // dependency, which Tree-sitter's WASM loaders do not supply.
                "-fPIC",
                "-shared",
                "-Os",
                "-nostdlib",
                "-Wl,--no-entry",
                "-Wl,--export=tree_sitter_nusmv",
                "-Wl,--max-memory=4294967296",
                "-I",
                "src",
                "src/parser.c",
                "-o",
                output,
            ],
            { cwd: grammar },
        );
        const destination = join(grammars, "nusmv.wasm");
        await rename(output, destination);
        console.log(`Built ${destination} (Tree-sitter ABI 15).`);
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}

main().catch(reportError);
