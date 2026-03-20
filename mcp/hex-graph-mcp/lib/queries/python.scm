; Python tree-sitter queries for codegraph

; --- Functions ---
(function_definition) @definition.function

(decorated_definition
  (function_definition)) @definition.function

; --- Classes ---
(class_definition) @definition.class

(decorated_definition
  (class_definition)) @definition.class

; --- Methods (functions inside class body) ---
(class_definition
  body: (block
    (function_definition) @definition.method))

(class_definition
  body: (block
    (decorated_definition
      (function_definition) @definition.method)))

; --- Imports ---
(import_statement) @import
(import_from_statement) @import

; --- Calls ---
(call) @call
