// SPDX-License-Identifier: EPL-1.0
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    rename,
    rm,
    writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
    projectRoot,
    reportError,
    requireSdk,
    run,
    sdkPath,
} from "./common.mjs";

const version = "34.0";
const release = "wasi-sdk-34";
const targets = {
    "darwin-arm64": [
        "arm64-macos",
        "9c59398106b417f8f14913380fdf0097a8cc0ff4af9eb3ce0065a859e88d49e9",
    ],
    "darwin-x64": [
        "x86_64-macos",
        "87d27fa8adc68dee59bfbf2e22a6d34ef717c34d6bf1d8af2a56fc929d9ce0eb",
    ],
    "linux-arm64": [
        "arm64-linux",
        "f7e243dff54d60bcc576e94d6166b69f410f2500ae4a9ceef34315be10e77971",
    ],
    "linux-x64": [
        "x86_64-linux",
        "b761e3a0721dbae9c09a0059e5fdb2bf917d1b4a8a7b430fb3b5aafb0984b2c4",
    ],
};

async function main() {
    if (process.env.WASI_SDK_PATH) {
        await requireSdk();
        console.log(`Using WASI_SDK_PATH=${sdkPath()}; no download needed.`);
        return;
    }

    const target = targets[`${process.platform}-${process.arch}`];
    if (!target) {
        throw new Error(
            `Automatic wasi-sdk setup supports macOS/Linux on arm64/x64, not ${process.platform}/${process.arch}. Use a supported host, or provide a compatible SDK with WASI_SDK_PATH.`,
        );
    }
    const [host, expectedHash] = target;
    const destination = sdkPath();
    const marker = `wasi-sdk ${version} ${host}\n`;
    const existing = await lstat(destination).catch((error) => {
        if (error.code !== "ENOENT") throw error;
    });
    if (existing) {
        if (existing.isDirectory() && !existing.isSymbolicLink()) {
            const installedMarker = await readFile(
                join(destination, ".zed-nusmv-sdk"),
                "utf8",
            ).catch((error) => {
                if (error.code !== "ENOENT") throw error;
            });
            if (installedMarker === marker) {
                await requireSdk(destination);
                console.log(
                    `wasi-sdk ${version} is already available at ${destination}.`,
                );
                return;
            }
        }
        throw new Error(
            `Refusing to replace unrecognised SDK path ${destination}. Move it aside, or select an existing SDK with WASI_SDK_PATH.`,
        );
    }

    const tools = join(projectRoot, ".tools");
    await mkdir(tools, { recursive: true });
    const temporary = await mkdtemp(join(tools, ".wasi-sdk-"));
    try {
        const archive = join(temporary, "sdk.tar.gz");
        const asset = `wasi-sdk-${version}-${host}.tar.gz`;
        const url = `https://github.com/WebAssembly/wasi-sdk/releases/download/${release}/${asset}`;
        console.log(`Downloading ${url}`);
        run(
            "curl",
            [
                "--fail",
                "--location",
                "--show-error",
                "--retry",
                "3",
                "--retry-all-errors",
                "--retry-delay",
                "2",
                "--connect-timeout",
                "15",
                "--max-time",
                "600",
                "--retry-max-time",
                "1200",
                "--output",
                archive,
                url,
            ],
            { timeout: 1_500_000 },
        );

        const hash = createHash("sha256");
        for await (const chunk of createReadStream(archive)) hash.update(chunk);
        const actualHash = hash.digest("hex");
        if (actualHash !== expectedHash) {
            throw new Error(
                `SHA-256 mismatch for ${asset}: expected ${expectedHash}, received ${actualHash}. Nothing was extracted.`,
            );
        }

        const extracted = join(temporary, "sdk");
        await mkdir(extracted);
        run("tar", ["-xzf", archive, "-C", extracted, "--strip-components=1"], {
            timeout: 120_000,
        });
        await requireSdk(extracted);
        await writeFile(join(extracted, ".zed-nusmv-sdk"), marker);
        await rename(extracted, destination);
        console.log(`Installed wasi-sdk ${version} at ${destination}.`);
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}

main().catch(reportError);
