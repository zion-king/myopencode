# Audits

Periodic audits of upstream OpenCode and fork customizations to identify, scope, and prioritize rewrite features and developer experience improvements.

## Purpose

The `rewrites/audits/` directory serves as the technical radar and feature scoping backlog for `zion-king/myopencode`. While `rewrites/specs/` contains detailed engineering specs for verified/active rewrites, `rewrites/audits/` contains comprehensive architectural audits, competitive teardowns (e.g. vs Claude Code desktop, Cursor), and prioritized scoping roadmaps.

## Process: draft, revise, spec

An audit is never implementation-ready on its first pass. Every audit goes through three stages before a
line of implementation code is written:

1. **Draft** (`drafts/NNN-slug.md`). The initial scoping pass — competitive teardown, root-cause hypotheses,
   proposed architecture, rough diff estimates. Written without exhaustively verifying every claim against
   the current tree; treat every "root cause" and file path in a draft as a hypothesis, not a fact.
2. **Revision** (`NNN-slug.md`, this directory's top level). Every root-cause claim and file path in the
   draft is checked against the actual codebase before the audit is considered scoped. Items that turn out
   to be built on a false premise (e.g. describing a subsystem that already exists) are corrected or
   rescoped, not left as-is. This is the version referenced by the inventory table below and the one new
   items get added to. See [001](./001-desktop-developer-experience.md) §0 for a worked example of this
   pass, including two items whose entire premise was wrong.
3. **Spec** (`rewrites/specs/NNN-slug.md`, one per item that moves forward). Only at this stage does an item
   get the full template from [`../docs/PRINCIPLES.md`](../docs/PRINCIPLES.md): Non-goals, Tradeoffs,
   enumerated Requirements, a verification plan, i18n keys, and rebase notes. A revised audit item is scoped
   and prioritized — it is not yet spec'd, and nothing here should be implemented directly from an audit
   document, revised or not.

Draft and revised versions are both kept — the draft as a record of the initial (unverified) pass, the
revision as the current source of truth.

### Verification discipline

Audit 001 needed two verification passes. The first caught two items that were wholly built already; the
second, triggered when spec-writing exposed a wrong root cause, found that **9 of 13 items overstated the
work** — most proposed building things that substantially already ship. These rules come from those
failures and apply to every audit:

1. **Ask "does this already exist?" before "how would we build it?"** Every item that survived contact
   with the codebase got smaller. Assume the gap is narrower than it looks.
2. **Search for the capability, not the identifier.** Audit 001 cited an `invoke_subagent` tool and a
   `ConversationID` field that exist nowhere, while the real mechanism shipped under different names.
   A failed grep for an invented name is not evidence of a missing feature.
3. **"Traced to an exact line" ≠ "traced to the line that runs."** Verify which component is actually
   *mounted on the route in question*. Audit 001's item 11 cited two real, correct line numbers in a
   component that is never mounted on the screen being described.
4. **A competitive feature list is a hypothesis generator, not evidence.** "Cursor has X" tells you
   nothing about what this codebase already does.
5. **Distrust diff estimates that cluster around a prior result.** Audit 001's original estimates all sat
   near the one previously measured rewrite regardless of the proposed scope. Re-derive at spec time from
   an actual sketch of the edit site.
6. **Check whether the item is blocked before ranking it.** One item's UI half turned out to require
   backend work upstream had deliberately deferred — that belongs in the ranking, not discovered mid-spec.

## Audit Inventory

| ID | Title | Date | Focus Area | Status |
|---|---|---|---|---|
| [001](./001-desktop-developer-experience.md) | Desktop Developer Experience Audit & Scoped Rewrites | 2026-09-02 (swept 2026-09-13) | Desktop App DX & Parity with Claude Code | Verified & Re-prioritized |

Drafts (pre-revision, kept for reference): [drafts/001](./drafts/001-desktop-developer-experience.md).
