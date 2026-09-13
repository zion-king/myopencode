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

## Audit Inventory

| ID | Title | Date | Focus Area | Status |
|---|---|---|---|---|
| [001](./001-desktop-developer-experience.md) | Desktop Developer Experience Audit & Scoped Rewrites | 2026-09-02 (revised 2026-09-13) | Desktop App DX & Parity with Claude Code | Revised & Prioritized |

Drafts (pre-revision, kept for reference): [drafts/001](./drafts/001-desktop-developer-experience.md).
