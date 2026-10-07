# RFC 0028: Checked native source export

**Status:** Implemented (retrospective specification).
**Kind:** Tooling. **Release:** 0.1.2. **Dependencies:** 0025, 0029.

## Problem and native baseline

Teams need an inspectable route to native TS/TSX without manually lowering syntax and repairing imports. This is distinct from compiling one file or installing an entire application.

## Design

The optional export package supplies twill export and exportProject. Check a single configured source graph before writing into a new destination outside the source project. Dry-run/JSON report the same planned files and diagnostics. Reject existing/overlapping destinations, output/resolution/case collisions, escaping symlinks, source errors, project references and unsupported runtime paths before output creation. Caught write failures remove the newly created incomplete output; originals remain intact.

Include local sources, declarations and directly imported assets. Convert dialect suffixes to .ts/.tsx and rewrite relative literal imports/re-exports/type imports/dynamic imports in both native and dialect files. Preserve extensionless imports. Do not rewrite ordinary strings/comments or guess computed imports. Unsupported aliases/globs/CJS paths need explicit source changes.

## Lowering and interoperability

Format generated dialect TS with Prettier; native layout changes only at rewritten specifiers. Flatten a checking config with explicit files/noEmit, native TS import settings and no Twill TS-server plugin. Output coordinates are native, without maps to old dialect sources. Package manifests, dependencies, host config and public assets are not copied.

## Compatibility and alternatives

Single-file compile retains import spelling and is not this export. A full application migration remains an application task. There is no overwrite mode in the current safety contract.

## Validation and completion

[Export tests](../../packages/export/tests), [compiler command tests](../../packages/twill/tests/export-command.test.ts) and independent consumers verify preflight, collision/rollback handling, native tsc and Node execution without Twill. See [package boundaries](../../packages/export/README.md).

## Decision history

Retrospective single-project export contract; broader migration needs an amendment.
