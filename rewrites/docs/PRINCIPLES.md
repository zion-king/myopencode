# Rewrite principles

How to make a change to upstream OpenCode in this fork without creating a maintenance
problem for yourself later.

[`../README.md`](../README.md) is the entry point (why the fork exists, inventory, environment, build, rebase
runbook). This file is the playbook for *making a change*. Every spec should cite the
principles it relied on in its "Rebase notes" section.

These are derived from rewrite 001, not invented in advance. Where a principle has
measured evidence, it is quoted.

---

## The one thing that matters

**Your maintenance cost is proportional to the number of upstream lines you touch — not to
the size of your feature.**

Upstream has 15k+ commits and no release cadence you control. `packages/app` is mid-
migration with v1/v2 component pairs throughout (`file-tree` / `file-tree-v2`,
`review-panel-v2`, `settings-v2`, `prompt-input-v2`). Every changed upstream line is a line
that can conflict on every future rebase, forever.

A feature that adds 400 lines in new files and changes 3 upstream lines is *cheaper to
maintain* than one that changes 40 upstream lines. Optimise for the second number.

---

## P1 — Put logic in new files

New files never conflict. Ever.

Rewrite 001 is ~120 lines of implementation, of which **13 lines** live in an upstream file.
Everything else is in `markdown-file-view.tsx` and `markdown-file-view-policy.ts`.

Before editing an upstream file, ask: can this live in a new module that the upstream file
merely *calls*?

## P2 — One edit site per rewrite

Aim for a single insertion point in a single upstream function. Two edit sites is twice the
conflict probability and twice the re-derivation work when upstream restructures.

Rewrite 001 touches `file-tabs.tsx` in exactly one function (`SessionFileViewV2`), with one
import at the top.

## P3 — Rename, don't re-indent

**This is the least obvious principle and the highest-value one.**

The instinct when wrapping existing code is to move it inside your new component:

```tsx
// Costs +62/-50. Every line of the moved block is "changed".
const renderFile = (source) => (
  <MyWrapper fallback={() => (
      <div>...48 lines, all shifted 4 spaces right...</div>
  )} />
)
```

Git's default 3-way merge is **not** whitespace-tolerant. Re-indenting 48 lines means
upstream edits to any of those 48 lines conflict.

Instead, rename the original and add a new wrapper beside it:

```tsx
// Costs +13/-1. Zero existing lines re-indented.
const renderSource = (source) => (      // <- was `renderFile`, only this line changed
  <div>...48 lines, byte-for-byte identical...</div>
)

const renderFile = (source) => (        // <- new, additive
  <MyWrapper fallback={() => renderSource(source)} />
)
```

Measured on rewrite 001: **`+62/-50` → `+13/-1`**. Same behaviour.

Verify with `git diff --stat` before committing. If the insertion count is close to the
size of the block you wrapped, you re-indented — redo it.

## P4 — Extract pure logic into a `-policy.ts` module

Put predicates, thresholds, and decisions in a plain `.ts` file with no framework or heavy
imports. Keep the component file for rendering only.

Benefits:
- Unit-testable without a DOM, a context provider, or the SolidJS runtime.
- Your tests keep passing across upstream refactors of the component layer.

This matches existing repo convention, so it reads as native: `review-diff-kinds.ts`,
`session-panel-layout.ts`, `general-controller-behavior.ts`, `file-tree-v2-model.ts`.

Rewrite 001: `markdown-file-view-policy.ts` (extension match, byte limit) + 9 tests that
require no rendering.

## P5 — Prefer the v2 code path

The v1 layout is being retired — see `oldInterfaceSunset` and `newLayoutDesignsDefault` in
`packages/app/src/context/settings.tsx`. Many components exist as v1/v2 pairs.

Patch v2 only. Patching both doubles the diff for code scheduled for deletion.

Corollary: when v1 is finally removed upstream, your v2 edit site may move. Note the
dependency in the spec.

## P6 — i18n: `en.ts` only, plus an allowlist

`packages/app/AGENTS.md` forbids hardcoded user-visible English. But adding a key normally
means editing 60+ locale bundles — the worst possible diff surface.

`context/language.tsx` builds every locale as `{ ...base, ...localeDict }` where `base` is
English, so **a key missing from a locale automatically falls back to English**. Nothing
breaks at runtime.

Procedure:

1. Add the key to `packages/app/src/i18n/en.ts` under a namespaced prefix
   (e.g. `session.files.markdown.`).
2. Add that prefix to `REWRITE_KEY_PREFIXES` in `packages/app/src/i18n/parity.test.ts`,
   which otherwise enforces exact key parity across locales.

Cost: 2 small files instead of 60. Non-English users see English — the same outcome as
hardcoding, but the strings stay translatable and the architecture stays intact.

## P7 — Pin the base commit in writing

This fork tracks `dev`, which has no release boundaries. A moving base is only reproducible
if the exact commit is recorded.

Every spec records its base SHA in the header table. Update it after each rebase.

## P8 — Verification steps are the regression suite

You will not remember what "working" meant six months and 3,000 upstream commits from now.

Every spec ends with concrete, re-runnable verification steps. After every rebase, re-run
them. They are the only thing standing between a clean-looking rebase and a silently broken
feature.

Automate what is mechanically checkable; be explicit about what is not. Rewrite 001
verifies typecheck, unit tests, browser tests, policy tests, and bundle inclusion
automatically, and documents the visual check as manual because no browser automation was
available.

## P9 — Don't fight the codebase's conventions

You are a guest in this code. Following local convention costs nothing and makes your diff
smaller and less conflict-prone:

- Read the nearest `AGENTS.md` before editing — the repo root, `packages/app`, and
  `packages/desktop` each have their own and they differ.
- `createStore` over multiple `createSignal` (per `packages/app/AGENTS.md`).
- Match surrounding naming, file layout, and styling tokens. Grep for an existing class
  token before inventing one.

## P10 — Environment workarounds go in README, never in the tree

Local machine problems must not become tracked changes.

Rewrite 001 needed `packages/app/src/custom-elements.d.ts` materialized because Windows
checked out git symlinks as text files. It is hidden from git with
`git update-index --skip-worktree`, not committed, and documented under
"Windows symlinks" in [`../README.md`](../README.md).

If a fix helps only your machine, it belongs in documentation.

---

## Checklist for a new rewrite

Before starting:

- [ ] Write the spec first: problem, root cause, goals, non-goals, tradeoffs, requirements.
- [ ] Record the base SHA (`git rev-parse HEAD`).
- [ ] Confirm the feature genuinely cannot be done via config, plugins, or MCP.
- [ ] Identify the single intended edit site.

Before considering it done:

- [ ] `git diff --stat` — is the upstream line count as small as it can be? (P1, P2, P3)
- [ ] Is pure logic in a `-policy.ts` with tests? (P4)
- [ ] v2 path only? (P5)
- [ ] New i18n keys in `en.ts` + allowlist only? (P6)
- [ ] `bun typecheck` exits 0, `test:unit` and `test:browser` green.
- [ ] Spec updated: files table, verification results, rebase notes, known gaps.
- [ ] Inventory row added to [`../README.md`](../README.md).
- [ ] No environment workaround committed. (P10)

## Anti-patterns

| Don't | Because | Instead |
| ----- | ------- | ------- |
| Move an existing block to re-indent it | Git's 3-way merge isn't whitespace-tolerant | Rename it in place, wrap beside it (P3) |
| Add i18n keys to all 60 locale bundles | Largest possible diff, constant upstream churn | `en.ts` + parity allowlist (P6) |
| Patch v1 and v2 "for completeness" | v1 is being deleted | v2 only (P5) |
| Inline predicates in the component | Untestable without a DOM and context | `-policy.ts` module (P4) |
| Commit a local environment fix | Becomes a permanent phantom diff | Document in README (P10) |
| Track `dev` continuously | Rebase churn with no stable reference | Sync deliberately, pin the SHA (P7) |
| "I'll remember how to test this" | You won't | Written verification steps (P8) |
