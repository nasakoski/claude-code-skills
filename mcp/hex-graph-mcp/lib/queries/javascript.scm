; JavaScript/JSX tree-sitter queries for codegraph
; Captures: definition.function, definition.class, definition.method,
;           definition.variable, import, call

; --- Functions ---
(function_declaration) @definition.function
(generator_function_declaration) @definition.function

; Arrow functions assigned to const/let/var
(lexical_declaration
  (variable_declarator
    value: (arrow_function))) @definition.function

; export function ...
(export_statement
  (function_declaration)) @definition.function

; --- Classes ---
(class_declaration) @definition.class

(export_statement
  (class_declaration)) @definition.class

; --- Methods ---
(method_definition) @definition.method

; --- Variables (exported consts) ---
(export_statement
  (lexical_declaration)) @definition.variable

; --- Imports ---
(import_statement) @import

; require() calls captured as imports too
(call_expression
  function: (identifier) @_req
  (#eq? @_req "require")) @import

; --- Calls ---
(call_expression) @call
