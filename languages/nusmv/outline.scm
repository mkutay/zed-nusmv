; SPDX-License-Identifier: EPL-1.0
(module_declaration
  "MODULE" @context
  name: (identifier) @name) @item

(variable_declaration name: (identifier) @name) @item
(define_declaration name: (identifier) @name) @item
(specification
  kind: _ @context
  (specification_name name: (identifier) @name)) @item
