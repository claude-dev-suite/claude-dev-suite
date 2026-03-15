/**
 * Custom sanitizers for path-injection queries.
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
