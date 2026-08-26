/**
 * Custom sanitizers for path-injection queries.
 *
 * !! THIS FILE HAS NO EFFECT. !!
 *
 * A `.qll` library is only evaluated when a query imports it, and nothing in
 * `codeql/javascript-queries` imports this pack — so these `TaintedPath::Sanitizer`
 * subclasses are never instantiated. Verified rather than assumed:
 * `substrate.ts:378` reads `safeDest`, assigned directly from
 * `validatePathWithinBase()` at line 361, and `js/path-injection` flags it anyway.
 *
 * Kept because the intent is right and the class list is the correct starting
 * point. The working mechanism is a `barrierModel` data extension — see
 * `path-sanitizers.model.yml` next to this file, and its status note.
 *
 * Declares resolveProjectPath() and validatePathWithinBase() as taint barriers
 * for the js/path-injection query. These functions validate that paths are
 * non-traversal, absolute, and exist on the filesystem before returning them.
 */

import javascript
private import semmle.javascript.security.dataflow.TaintedPathCustomizations

/**
 * The return value of `resolveProjectPath()` is sanitized.
 *
 * The function validates that the input is a non-empty string,
 * contains no ".." traversal segments, is an absolute path,
 * exists on the filesystem, and resolves to a canonical rooted path.
 */
private class ResolveProjectPathReturnSanitizer extends TaintedPath::Sanitizer {
  ResolveProjectPathReturnSanitizer() {
    this = any(DataFlow::CallNode call |
      call.getCalleeName() = "resolveProjectPath"
    )
  }
}

/**
 * The argument passed to `resolveProjectPath()` is sanitized at the call site.
 * This prevents taint from flowing past the call into subsequent code.
 */
private class ResolveProjectPathArgumentSanitizer extends TaintedPath::Sanitizer {
  ResolveProjectPathArgumentSanitizer() {
    exists(DataFlow::CallNode call |
      call.getCalleeName() = "resolveProjectPath" and
      this = call.getArgument(0)
    )
  }
}

/**
 * The return value of `validatePathWithinBase()` is sanitized.
 *
 * The function validates that the target path stays within a base directory,
 * resolves symlinks, and prevents path traversal attacks.
 */
private class ValidatePathWithinBaseReturnSanitizer extends TaintedPath::Sanitizer {
  ValidatePathWithinBaseReturnSanitizer() {
    this = any(DataFlow::CallNode call |
      call.getCalleeName() = "validatePathWithinBase"
    )
  }
}

/**
 * The first argument to `validatePathWithinBase()` is sanitized at the call site.
 */
private class ValidatePathWithinBaseArgumentSanitizer extends TaintedPath::Sanitizer {
  ValidatePathWithinBaseArgumentSanitizer() {
    exists(DataFlow::CallNode call |
      call.getCalleeName() = "validatePathWithinBase" and
      this = call.getArgument(0)
    )
  }
}
