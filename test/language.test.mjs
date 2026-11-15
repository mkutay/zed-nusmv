// SPDX-License-Identifier: EPL-1.0
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Language, Parser, Query } from "web-tree-sitter";

const root = new URL("../", import.meta.url);
await Parser.init();
const language = await Language.load(
    fileURLToPath(new URL("grammars/nusmv.wasm", root)),
);
const highlighting = new Query(
    language,
    await readFile(new URL("languages/nusmv/highlights.scm", root), "utf8"),
);

function withTree(source, callback) {
    const parser = new Parser();
    parser.setLanguage(language);
    const tree = parser.parse(source);
    try {
        return callback(tree);
    } finally {
        tree.delete();
        parser.delete();
    }
}

function assertParses(source) {
    withTree(source, (tree) => {
        const errors = [];
        function visit(node) {
            if (node.isError || node.isMissing)
                errors.push(
                    `${node.type} at ${node.startPosition.row + 1}:${node.startPosition.column + 1}: ${node.text}`,
                );
            for (const child of node.children) if (child.hasError) visit(child);
        }
        visit(tree.rootNode);
        assert.equal(
            tree.rootNode.hasError,
            false,
            errors.join("\n") || tree.rootNode.toString(),
        );
    });
}

function captures(source) {
    return withTree(source, (tree) =>
        highlighting.captures(tree.rootNode).map((capture) => ({
            name: capture.name,
            text: capture.node.text,
            start: capture.node.startIndex,
            end: capture.node.endIndex,
        })),
    );
}

function assertHighlight(source, text, expected, from = 0) {
    const start = source.indexOf(text, from);
    assert.notEqual(start, -1, `Missing test token ${text}`);
    const matches = captures(source).filter(
        (capture) =>
            capture.start === start && capture.end === start + text.length,
    );
    assert.equal(
        matches.at(-1)?.name,
        expected,
        `${text}: ${JSON.stringify(matches)}`,
    );
}

const fixture = await readFile(
    new URL("test/fixtures/language.smv", root),
    "utf8",
);

test("parses the supported NuSMV sections, types and expression forms", () => {
    assertParses(fixture);
});

test("all Zed query files compile against the built WASM grammar", async () => {
    for (const name of await readdir(new URL("languages/nusmv/", root))) {
        if (!name.endsWith(".scm")) continue;
        const query = new Query(
            language,
            await readFile(new URL(`languages/nusmv/${name}`, root), "utf8"),
        );
        query.delete();
    }
});

test("highlights comments, declarations, parameters, constants and specification names", () => {
    for (const [text, capture] of [
        [
            "-- NuSMV highlighting reference: sections, types and expressions.",
            "comment",
        ],
        ["MODULE", "keyword"],
        ["main", "type"],
        ["binary_word", "function"],
        ["ctl_property", "label"],
        ["idle_constant", "constant"],
        ["self", "variable.special"],
    ]) {
        assertHighlight(fixture, text, capture);
    }
    assertHighlight(fixture, "active", "property");
    assertHighlight(fixture, "boolean", "type.builtin");
    assertHighlight(fixture, "idle", "enum");
    assertHighlight(fixture, "Worker", "type");
    assertHighlight(
        fixture,
        "limit",
        "variable.parameter",
        fixture.indexOf("MODULE Worker"),
    );
    assertHighlight(
        fixture,
        "local",
        "property",
        fixture.indexOf("self.local") + 5,
    );
});

test("highlights integer and signed/unsigned word literals as complete numbers", () => {
    for (const word of [
        "0ub8_1010",
        "0sb8_1111",
        "0o8_17",
        "0d_42",
        "0h16_FF",
        "0H16_Aa",
    ]) {
        assertHighlight(fixture, word, "number");
    }
    assertHighlight(fixture, "10", "number");
    assertHighlight(fixture, "FALSE", "boolean");
});

test("preserves every upstream temporal and word operator", () => {
    for (const operator of [
        "AG",
        "AF",
        "AX",
        "EF",
        "EX",
        "EG",
        "A",
        "E",
        "EBF",
        "ABF",
        "EBG",
        "ABG",
        "X",
        "Y",
        "Z",
        "G",
        "F",
        "H",
        "O",
        "U",
        "V",
        "S",
        "T",
    ]) {
        const source = ["U", "V", "S", "T"].includes(operator)
            ? `MODULE main LTLSPEC active ${operator} request;`
            : ["A", "E"].includes(operator)
              ? `MODULE main CTLSPEC ${operator} [active U request];`
              : ["EBF", "ABF", "EBG", "ABG"].includes(operator)
                ? `MODULE main CTLSPEC ${operator} 0..3 active;`
                : `MODULE main LTLSPEC ${operator} active;`;
        assertParses(source);
        assertHighlight(
            source,
            operator,
            "keyword",
            source.indexOf("SPEC") + 4,
        );
    }
    for (const operator of ["in", "mod", "union", "xnor", "xor"]) {
        const source = `MODULE main DEFINE result := left ${operator} right;`;
        assertParses(source);
        assertHighlight(
            source,
            operator,
            "operator",
            source.indexOf("left") + 4,
        );
    }
});

test("preserves complete identifiers rather than colouring keyword prefixes", () => {
    const identifiers = [
        "VARiable",
        "AGent",
        "boolean_value",
        "TRUE_value",
        "G$flag",
        "name#tag",
        "a-b",
        "MODULE-extra",
    ];
    const source = `MODULE main DEFINE result := ${identifiers.join(" & ")};`;
    assertParses(source);
    for (const identifier of identifiers)
        assertHighlight(source, identifier, "variable");
});

test("does not treat case conditions or ordinary assignments as declarations", () => {
    const source =
        "MODULE main VAR ready : boolean; ASSIGN ready := case ready : TRUE; TRUE : FALSE; esac;";
    assertParses(source);
    const ordinary = source.indexOf("ASSIGN") + 7;
    const condition = source.indexOf("case") + 5;
    assertHighlight(source, "ready", "variable", ordinary);
    assertHighlight(source, "ready", "variable", condition);
});

test("comments hide keywords and consume Windows line endings correctly", () => {
    const source =
        "MODULE main\r\n-- MODULE FALSE 0h8_FF := case\r\nVAR enabled : boolean;\r\n";
    assertParses(source);
    const commentStart = source.indexOf("--");
    const commentEnd = source.indexOf("\r\n", commentStart);
    const inside = captures(source).filter(
        (capture) =>
            capture.start >= commentStart && capture.start < commentEnd,
    );
    assert.deepEqual(
        inside.map((capture) => capture.name),
        ["comment"],
    );
    assertHighlight(source, "VAR", "keyword");
});

test("supports optional semicolons on definitions and specifications", () => {
    assertParses(
        "MODULE main DEFINE limit := 3 enabled := TRUE INIT enabled LTLSPEC G enabled CTLSPEC AG enabled",
    );
});

test("supports arithmetic and member paths in parameterised range bounds", () => {
    const source =
        "MODULE counter(N) VAR idx : 0..N - 1; flags : array 0..N - 1 of boolean; other : array -(N + 1)..bounds.limit * 2 of boolean;";
    assertParses(source);
    assertHighlight(source, "flags", "property");
    assertHighlight(source, "other", "property");
});

test("parses nested array definitions with matching brackets", async () => {
    const source = "MODULE main DEFINE lookup := [[1, 2], [3, 4]];";
    assertParses(source);
    const brackets = new Query(
        language,
        await readFile(new URL("languages/nusmv/brackets.scm", root), "utf8"),
    );
    try {
        withTree(source, (tree) => {
            assert.equal(brackets.matches(tree.rootNode).length, 3);
        });
    } finally {
        brackets.delete();
    }
});

test("captures word literals containing digit separators as a single number", () => {
    for (const literal of ["0ub8_1010_1100", "0sh16_FF_00", "0d16_1_234"]) {
        const source = `MODULE main DEFINE value := ${literal};`;
        assertParses(source);
        assertHighlight(source, literal, "number");
    }
});

test("multiline comments cannot create highlighted code or outline entries", async () => {
    const comment =
        "/-- Documentation\nMODULE ignored\n-- words and -/ symbols --- here\n--/";
    const source = `${comment}\nMODULE main\nVAR enabled : boolean;`;
    assertParses(source);
    assertHighlight(source, comment, "comment");
    assert.deepEqual(
        captures(source)
            .filter((capture) => capture.start < comment.length)
            .map((capture) => capture.name),
        ["comment"],
    );
    const outline = new Query(
        language,
        await readFile(new URL("languages/nusmv/outline.scm", root), "utf8"),
    );
    try {
        withTree(source, (tree) => {
            const names = outline
                .captures(tree.rootNode)
                .filter((capture) => capture.name === "name")
                .map((capture) => capture.node.text);
            assert.deepEqual(names, ["main", "enabled"]);
        });
    } finally {
        outline.delete();
    }
});

test("recovers highlighting in a later module after an incomplete declaration", () => {
    const source =
        "MODULE broken VAR unfinished :\nMODULE healthy\nVAR enabled : boolean;\n";
    assertHighlight(source, "healthy", "type");
    assertHighlight(source, "enabled", "property");
});
