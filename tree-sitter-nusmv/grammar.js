// SPDX-License-Identifier: EPL-1.0
// Tree-sitter adaptation of vscode-nusmv's TextMate and Langium syntax.
// Upstream: Liam Walsh, revision f1fa0cbea4ee70388b8caa36ef39790f6e00e185.
// See ../NOTICE for provenance. This is an editor grammar, not a model validator.

const commaSep1 = (rule) => seq(rule, repeat(seq(",", rule)));
const commaSep = (rule) => optional(commaSep1(rule));

module.exports = grammar({
    name: "nusmv",

    extras: ($) => [/\s/, $.comment],
    word: ($) => $.identifier,
    // Keep section keywords recognisable while a preceding declaration is incomplete.
    reserved: {
        global: (_) => [
            "MODULE",
            "VAR",
            "IVAR",
            "FROZENVAR",
            "DEFINE",
            "MDEFINE",
            "CONSTANTS",
            "ASSIGN",
            "INIT",
            "TRANS",
            "INVAR",
            "FAIRNESS",
            "JUSTICE",
            "COMPASSION",
            "ISA",
            "SPEC",
            "CTLSPEC",
            "LTLSPEC",
            "PSLSPEC",
            "INVARSPEC",
            "NAME",
            "COMPUTE",
            "MIN",
            "MAX",
            "case",
            "esac",
            "process",
            "array",
            "of",
            "boolean",
            "integer",
            "real",
            "word",
            "signed",
            "unsigned",
            "init",
            "next",
            "word1",
            "bool",
            "toint",
            "extend",
            "resize",
            "sizeof",
            "count",
            "abs",
            "max",
            "min",
            "TRUE",
            "FALSE",
            "self",
            "in",
            "mod",
            "union",
            "xor",
            "xnor",
            "EX",
            "AX",
            "EF",
            "AF",
            "EG",
            "AG",
            "X",
            "Y",
            "Z",
            "G",
            "H",
            "F",
            "O",
            "U",
            "V",
            "S",
            "T",
            "A",
            "E",
            "EBF",
            "ABF",
            "EBG",
            "ABG",
        ],
    },

    rules: {
        source_file: ($) => repeat($.module_declaration),

        module_declaration: ($) =>
            seq(
                "MODULE",
                field("name", $.identifier),
                optional($.parameters),
                repeat($._section),
            ),
        parameters: ($) =>
            seq("(", commaSep(field("parameter", $.identifier)), ")"),

        _section: ($) =>
            choice(
                $.variable_section,
                $.define_section,
                $.constants_section,
                $.assign_section,
                $.constraint,
                $.compassion_constraint,
                $.specification,
                $.compute_specification,
                $.isa_declaration,
            ),
        variable_section: ($) =>
            seq(
                choice("VAR", "IVAR", "FROZENVAR"),
                repeat1($.variable_declaration),
            ),
        variable_declaration: ($) =>
            seq(field("name", $.identifier), ":", field("type", $._type), ";"),
        _type: ($) =>
            choice(
                $.primitive_type,
                $.word_type,
                $.enum_type,
                $.range_type,
                $.array_type,
                $.module_type,
            ),
        primitive_type: (_) => choice("boolean", "integer", "real"),
        word_type: ($) =>
            seq(
                optional(choice("signed", "unsigned")),
                "word",
                "[",
                $._expression,
                "]",
            ),
        enum_type: ($) =>
            seq("{", commaSep1(choice($.identifier, $.number, $.boolean)), "}"),
        range_type: ($) => seq($._bound, "..", $._bound),
        _bound: ($) => choice($.number, $.reference, $.bound_expression),
        bound_expression: ($) =>
            choice(
                seq("(", $._bound, ")"),
                prec(3, seq(choice("-", "+"), $._bound)),
                prec.left(2, seq($._bound, choice("*", "/", "mod"), $._bound)),
                prec.left(1, seq($._bound, choice("+", "-"), $._bound)),
            ),
        array_type: ($) => seq("array", $.range_type, "of", $._type),
        module_type: ($) =>
            seq(
                optional("process"),
                field("name", $.identifier),
                optional($.arguments),
            ),

        define_section: ($) =>
            seq(choice("DEFINE", "MDEFINE"), repeat1($.define_declaration)),
        define_declaration: ($) =>
            seq(
                field("name", $.identifier),
                ":=",
                field("value", $._expression),
                optional(";"),
            ),
        constants_section: ($) =>
            seq("CONSTANTS", commaSep1($.identifier), optional(";")),
        assign_section: ($) => seq("ASSIGN", repeat1($.assignment)),
        assignment: ($) =>
            seq(
                field("left", choice($.reference, $.state_reference)),
                ":=",
                field("right", $._expression),
                optional(";"),
            ),
        state_reference: ($) =>
            seq(choice("init", "next"), "(", $.reference, ")"),
        constraint: ($) =>
            seq(
                choice("INIT", "TRANS", "INVAR", "FAIRNESS", "JUSTICE"),
                $._expression,
                optional(";"),
            ),
        compassion_constraint: ($) =>
            seq(
                "COMPASSION",
                "(",
                $._expression,
                ",",
                $._expression,
                ")",
                optional(";"),
            ),
        specification: ($) =>
            seq(
                field(
                    "kind",
                    choice(
                        "SPEC",
                        "CTLSPEC",
                        "LTLSPEC",
                        "PSLSPEC",
                        "INVARSPEC",
                    ),
                ),
                optional($.specification_name),
                $._expression,
                optional(";"),
            ),
        specification_name: ($) =>
            seq("NAME", field("name", $.identifier), ":="),
        compute_specification: ($) =>
            seq(
                "COMPUTE",
                choice("MIN", "MAX"),
                "[",
                $._expression,
                ",",
                $._expression,
                "]",
                optional(";"),
            ),
        isa_declaration: ($) =>
            seq("ISA", field("name", $.identifier), optional(";")),

        _expression: ($) =>
            choice(
                $.reference,
                $.number,
                $.word_literal,
                $.boolean,
                $.parenthesized_expression,
                $.set_expression,
                $.array_expression,
                $.case_expression,
                $.call_expression,
                $.unary_expression,
                $.binary_expression,
                $.conditional_expression,
                $.quantified_expression,
                $.bounded_temporal_expression,
            ),
        reference: ($) =>
            seq(
                choice($.identifier, $.self),
                repeat(choice($.member_access, $.index_expression)),
            ),
        self: (_) => "self",
        member_access: ($) => seq(".", field("member", $.identifier)),
        index_expression: ($) =>
            seq("[", $._expression, optional(seq(":", $._expression)), "]"),
        parenthesized_expression: ($) => seq("(", $._expression, ")"),
        set_expression: ($) => seq("{", commaSep($._expression), "}"),
        array_expression: ($) => seq("[", commaSep($._expression), "]"),
        arguments: ($) => seq("(", commaSep($._expression), ")"),
        call_expression: ($) =>
            seq(field("function", $.builtin_function), $.arguments),
        builtin_function: (_) =>
            choice(
                "init",
                "next",
                "word1",
                "bool",
                "toint",
                "signed",
                "unsigned",
                "extend",
                "resize",
                "sizeof",
                "count",
                "abs",
                "max",
                "min",
            ),
        case_expression: ($) => seq("case", repeat1($.case_branch), "esac"),
        case_branch: ($) =>
            seq(
                field("condition", $._expression),
                ":",
                field("value", $._expression),
                ";",
            ),
        conditional_expression: ($) =>
            prec.right(
                1,
                seq($._expression, "?", $._expression, ":", $._expression),
            ),
        unary_expression: ($) =>
            choice(
                prec(
                    15,
                    seq(
                        field("operator", choice("!", "-", "+")),
                        $._expression,
                    ),
                ),
                prec(
                    8,
                    seq(
                        field("operator", $.temporal_unary_operator),
                        $._expression,
                    ),
                ),
            ),
        temporal_unary_operator: (_) =>
            choice(
                "EX",
                "AX",
                "EF",
                "AF",
                "EG",
                "AG",
                "X",
                "Y",
                "Z",
                "G",
                "H",
                "F",
                "O",
            ),
        binary_expression: ($) =>
            choice(
                ...[
                    [2, "->", "right"],
                    [3, "<->"],
                    [4, choice("U", "V", "S", "T")],
                    [5, choice("|", "xor", "xnor")],
                    [6, "&"],
                    [9, choice("=", "!=", "<", ">", "<=", ">=")],
                    [10, "in"],
                    [11, "union"],
                    [12, choice("<<", ">>")],
                    [13, choice("+", "-")],
                    [14, choice("*", "/", "mod")],
                    [16, "::"],
                    [17, ".."],
                ].map(([precedence, operator, associativity]) =>
                    (associativity === "right" ? prec.right : prec.left)(
                        precedence,
                        seq(
                            field("left", $._expression),
                            field("operator", operator),
                            field("right", $._expression),
                        ),
                    ),
                ),
            ),
        quantified_expression: ($) =>
            seq(field("quantifier", choice("A", "E")), "[", $._expression, "]"),
        bounded_temporal_expression: ($) =>
            prec(
                8,
                seq(
                    field("operator", choice("EBF", "ABF", "EBG", "ABG")),
                    $.temporal_range,
                    $._expression,
                ),
            ),
        temporal_range: ($) => seq($.number, "..", $.number),

        boolean: (_) => choice("TRUE", "FALSE"),
        number: (_) => /[0-9]+/,
        word_literal: (_) => /0[us]?[bBoOdDhH_][0-9]*_[A-Fa-f0-9][A-Fa-f0-9_]*/,
        identifier: (_) => /[A-Za-z_][A-Za-z0-9_$#-]*/,
        comment: (_) =>
            token(
                prec(
                    1,
                    choice(
                        /--[^\r\n]*/,
                        seq("/--", /([^-]|-[^-]|--+[^-/])*/, /--+\//),
                    ),
                ),
            ),
    },
});
