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
 * A call to `resolveProjectPath()` acts as a barrier for tainted-path flow.
 *
 * The function validates that the input:
 *   - is a non-empty string
 *   - contains no ".." traversal segments
 *   - is an absolute path
 *   - exists on the filesystem
 *   - resolves to a canonical rooted path
 */
private class ResolveProjectPathBarrier extends TaintedPath::Sanitizer {
  ResolveProjectPathBarrier() {
    this = any(DataFlow::CallNode call |
      call.getCalleeName() = "resolveProjectPath"
    ).getALocalUse()
  }
}

/**
 * A call to `validatePathWithinBase()` acts as a barrier for tainted-path flow.
 *
 * The function validates that the target path stays within a base directory,
 * resolves symlinks, and prevents path traversal attacks.
 */
private class ValidatePathWithinBaseBarrier extends TaintedPath::Sanitizer {
  ValidatePathWithinBaseBarrier() {
    this = any(DataFlow::CallNode call |
      call.getCalleeName() = "validatePathWithinBase"
    ).getALocalUse()
  }
}
