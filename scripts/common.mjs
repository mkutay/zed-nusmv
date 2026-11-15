// SPDX-License-Identifier: EPL-1.0
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export function run(
    command,
    args,
    { cwd = projectRoot, timeout = 120_000 } = {},
) {
    const result = spawnSync(command, args, { cwd, stdio: "inherit", timeout });
    if (result.error) {
        throw new Error(`Could not run ${command}: ${result.error.message}`, {
            cause: result.error,
        });
    }
    if (result.status !== 0) {
        throw new Error(
            `${command} failed (${result.signal ?? `exit ${result.status}`}).`,
        );
    }
}

export function sdkPath() {
    return process.env.WASI_SDK_PATH
        ? resolve(process.env.WASI_SDK_PATH)
        : resolve(projectRoot, ".tools/wasi-sdk");
}

export async function requireSdk(directory = sdkPath()) {
    const clang = resolve(directory, "bin/clang");
    try {
        await access(clang, constants.X_OK);
    } catch (cause) {
        throw new Error(
            `No executable WASI clang at ${clang}. Run bun run setup:wasi, or set WASI_SDK_PATH to a wasi-sdk directory.`,
            { cause },
        );
    }
    return clang;
}

export function reportError(error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
}
