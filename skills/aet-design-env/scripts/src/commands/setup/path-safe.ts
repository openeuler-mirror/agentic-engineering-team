/**
 * Path safety utilities — ports the validation invariants from Spec Kit's
 * manifest.py and update-agent-context.sh:
 *
 *   - Reject absolute paths in agent-configured file targets.
 *   - Reject `..` segments entirely (canonical keys only, even when not escaping).
 *   - Reject backslash separators (cross-platform safety).
 *   - Reject symlinks in manifest-tracked paths.
 *   - Validate containment via `path.relative()` non-escapement.
 *
 * These invariants are enforced BEFORE any disk write so a misconfigured
 * agents.json cannot escape the project root.
 */
import { lstatSync, statSync } from 'node:fs';
import { resolve, isAbsolute, relative, sep, posix } from 'node:path';

/** Throw if `rel` contains a backslash separator (cross-platform safety). */
export function assertNoBackslash(rel: string): void {
  if (rel.includes('\\')) {
    throw new Error(
      `backslash separator not allowed (cross-platform safety): ${JSON.stringify(rel)}`,
    );
  }
}

/** Throw if `rel` is absolute (POSIX or Windows drive-qualified). */
export function assertRelative(rel: string): void {
  if (isAbsolute(rel) || /^[A-Za-z]:[\\/]/.test(rel)) {
    throw new Error(`absolute paths not allowed: ${JSON.stringify(rel)}`);
  }
}

/** Throw if `rel` contains any `..` segment (canonical keys only). */
export function assertNoDotDot(rel: string): void {
  const parts = rel.split(/[\\/]/);
  if (parts.some((p) => p === '..')) {
    throw new Error(`'..' segments not allowed: ${JSON.stringify(rel)}`);
  }
}

/** True if `child` resolves inside `root` (after symlink resolution). */
export function isPathInside(child: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(child));
  if (!rel) return false; // child === root → not "inside"
  return !rel.startsWith('..') && !isAbsolute(rel);
}

/** Throw if `rel` (relative to `root`) would resolve outside `root`. */
export function assertContained(rel: string, root: string): void {
  const abs = resolve(root, rel);
  if (!isPathInside(abs, root)) {
    throw new Error(
      `path escapes project root: rel=${JSON.stringify(rel)} root=${root}`,
    );
  }
}

/** Throw if `p` is a symlink (anywhere along its components). */
export function assertNotSymlink(p: string): void {
  try {
    const st = lstatSync(p);
    if (st.isSymbolicLink()) {
      throw new Error(`symlink not allowed: ${p}`);
    }
  } catch (e: any) {
    if (e?.message?.startsWith('symlink')) throw e;
    // missing path → not a symlink, OK
  }
}

/**
 * Full validation for a relative path the user's agents.json provides:
 * rejects absolute, backslash, `..`, and out-of-root resolution.
 */
export function assertSafeRelativePath(rel: string, root: string): void {
  assertRelative(rel);
  assertNoBackslash(rel);
  assertNoDotDot(rel);
  assertContained(rel, root);
}

/**
 * Canonicalize a tracked path to a POSIX-style relative key.
 * Returns `relative(root, abs).split(sep).join(posix.sep)` or, if not
 * contained, the absolute path as POSIX. Used for manifest file map keys.
 */
export function relativizeKey(abs: string, root: string): string {
  const rel = relative(resolve(root), resolve(abs));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    return abs.split(sep).join(posix.sep);
  }
  return rel.split(sep).join(posix.sep);
}

/** Stats helper: returns true if the path exists as a regular file (not symlink). */
export function isRegularFile(p: string): boolean {
  try {
    const st = statSync(p);
    return st.isFile() && !st.isSymbolicLink();
  } catch {
    return false;
  }
}
