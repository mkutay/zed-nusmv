; SPDX-License-Identifier: EPL-1.0
; Token categories adapted from Liam Walsh's vscode-nusmv. See ../../NOTICE.

(comment) @comment
(identifier) @variable
(number) @number
(word_literal) @number
(boolean) @boolean
(self) @variable.special

[
  "MODULE" "VAR" "IVAR" "FROZENVAR" "DEFINE" "MDEFINE" "CONSTANTS"
  "ASSIGN" "INIT" "TRANS" "INVAR" "FAIRNESS" "JUSTICE" "COMPASSION" "ISA"
  "SPEC" "CTLSPEC" "LTLSPEC" "PSLSPEC" "INVARSPEC" "NAME" "COMPUTE"
  "case" "esac" "process" "of"
] @keyword

(primitive_type) @type.builtin
(word_type ["word" "signed" "unsigned"] @type.builtin)
"array" @type.builtin
(builtin_function) @function
(state_reference ["init" "next"] @function)

(temporal_unary_operator) @keyword
(quantified_expression quantifier: _ @keyword)
(bounded_temporal_expression operator: _ @keyword)
["MIN" "MAX"] @keyword
["U" "V" "S" "T"] @keyword

[
  ":=" "<->" "->" "!=" "<=" ">=" "<<" ">>" "::" ".."
  "!" "&" "|" "=" "<" ">" "+" "-" "*" "/" "?"
  "in" "mod" "union" "xnor" "xor"
] @operator

["(" ")" "[" "]" "{" "}"] @punctuation.bracket
["," "." ";" ":"] @punctuation.delimiter

(module_declaration name: (identifier) @type)
(module_type name: (identifier) @type)
(isa_declaration name: (identifier) @type)
(parameters (identifier) @variable.parameter)
(variable_declaration name: (identifier) @property)
(define_declaration name: (identifier) @function)
(specification_name name: (identifier) @label)
(enum_type (identifier) @enum)
(constants_section (identifier) @constant)
(member_access member: (identifier) @property)
