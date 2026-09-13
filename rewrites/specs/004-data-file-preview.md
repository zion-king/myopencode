# 004 — Data file preview (CSV, JSON) and a preview dispatcher

| Field         | Value                                                        |
| ------------- | ------------------------------------------------------------ |
| Status        | Planned                                                       |
| Branch        | `rewrite/004-data-file-preview`                               |
| Upstream base | `95daf90670b7c039c436c85537da5fbfe2205b41` (`dev`, 2026-09-11) |
| Release near base | `v1.18.30`                                                |
| Date          | 2026-09-13                                                    |
| Audit item    | [audits/001](../audits/001-desktop-developer-experience.md) §3, Rewrite 10 |
| Builds on     | [001 — Markdown file preview](./001-markdown-file-preview.md) |

## Problem

Opening a `.csv` or `.json` file in the session file view shows raw source. For CSV especially that is close
to unreadable — quoted fields, long rows, no column alignment — when what the developer wants is a table.

More structurally: rewrite 001 taught the file view to preview *one* format (markdown) by wiring a single
bespoke component into the tab renderer. Every additional format currently implies repeating that wiring.
There is no seam for "preview this kind of file".

## Root cause

**Media formats already preview; text formats do not.** The audit's framing ("HTML, SVG, Mermaid render only
as plain code") is partly wrong and was corrected in [audits/001 §0](../audits/001-desktop-developer-experience.md):

- `packages/session-ui/src/components/file-media.tsx` already renders images (`<img>` from a data URL),
  **SVGs** (with a toggle back to source), and audio, plus a binary placeholder.
- It is dispatched by `mediaKindFromPath()` (`packages/session-ui/src/pierre/media.ts:36-41`), an
  extension-based dispatcher returning `"svg" | "image" | "audio" | undefined`.
- That whole path runs **inside** the pierre viewer, via the `media={{ mode: "auto", path, current, … }}`
  prop passed from `file-tabs.tsx:769-781`.

So SVG needs nothing. What has no preview path is **text files whose text is not the useful
representation** — CSV and JSON today; HTML and Mermaid later (see Scope decision).

**The fork already owns the only seam.** Rewrite 001 renamed the upstream renderer to `renderSource` and
added a wrapper beside it (`file-tabs.tsx:786-794`):

```tsx
const renderFile = (source: string) => (
  <MarkdownAwareFileView tab={…} path={path()} text={source} cacheKey={cacheKey()}
    fallback={() => renderSource(source)} />
)
```

`MarkdownAwareFileView` hardcodes markdown (`markdown-file-view.tsx:22`, `isMarkdownPath`). Any new format
must either be bolted into that component or given its own wiring — neither of which is a dispatcher.

## Goals

Preview `.csv` and `.json` files as structured data in the session file view, and establish a fork-owned
preview seam so further formats cost a policy entry and a viewer rather than new upstream wiring.

## Scope decision — which formats ship here

Audit item 10 named four formats. They have very different costs, so this spec ships the two that carry
none and sequences the other two rather than bundling them:

| Format | Status | Rationale |
| --- | --- | --- |
| **SVG** | **Already ships** | `file-media.tsx` renders it today, with a source toggle. Nothing to do. |
| **CSV** | **In scope** | No dependency (a correct parser is ~40 lines of pure, testable logic), no security surface, and the largest readability win — raw CSV is the least legible of the four. |
| **JSON** | **In scope** | No dependency (`JSON.parse`). Smaller win than CSV since pierre already syntax-highlights JSON, but a table for arrays-of-objects and a collapsible tree for nested data are real improvements, and it shares all of CSV's machinery. |
| **Mermaid** | **Deferred — own spec** | Requires a **new runtime dependency**; `mermaid` appears nowhere in this repo (verified across all `package.json`). That pulls in d3 and a large bundle, and mermaid has a history of XSS advisories. Adding a heavy dependency to a fork is a decision that deserves its own spec — and upstream may well add it themselves. |
| **HTML** | **Deferred — own spec** | Needs a sandboxed iframe. There is **no iframe anywhere** in `packages/app` or `packages/session-ui` today, so this establishes a new security surface inside an Electron renderer: sandbox flags, CSP, opaque origin, and what a script in agent-generated HTML may reach. That analysis is the spec, not a bullet in this one. |

Both deferrals plug into the dispatcher this spec creates, so each becomes a policy entry plus a viewer.

### This supersedes the audit's recommended approach

[audits/001 §0](../audits/001-desktop-developer-experience.md) corrected item 10 and recommended adding
"`mermaid`, `html`, `csv`/`json` branches to the **existing** `mediaKindFromPath` dispatcher — an
extension, not a new preview system." This spec deliberately does **not** do that, and the divergence
should be explicit rather than silent:

- `mediaKindFromPath` and `file-media.tsx` are **upstream** files. Adding branches there means editing
  upstream in two files, growing with every format — exactly the surface P1 exists to avoid. Our seam costs
  two upstream lines *once*, and every future format costs zero.
- The media dispatcher solves a different problem. It runs *inside* the pierre viewer and converts bytes
  into a data URL for `<img>`/`<audio>`. CSV and JSON are already text that reaches our wrapper; they need
  parsing and a source toggle, not a data URL. Reusing that path would mean bending it to a use case it
  was not built for.
- The audit's recommendation was still an improvement on the original item (which assumed no dispatcher
  existed at all). It just stopped one step short: the right extension point is the fork-owned seam rewrite
  001 already established, not the upstream media one.

## Non-goals

- **Editing** previewed data. Read-only, as with rewrite 001.
- **Sorting, filtering, or searching** the table. A viewer, not a spreadsheet; see Known gaps.
- **Touching `mediaKindFromPath` / `file-media.tsx`.** The media path already works and is upstream's;
  extending it would mean editing upstream files to do something our own seam can do for free.
- **Changing rewrite 001's behaviour or files.** See Design — 004 delegates to it rather than absorbing it.
- **The v1 file view** (`SessionFileViewV1`, `file-tabs.tsx:450`). Retired path, per P5.
- **Upstreaming.** `CONTRIBUTING.md` requires design review for UI changes.

## Tradeoffs

### Tradeoff 1 — Preview hides the line-level affordances

Identical in kind to rewrite 001's Tradeoff 1 and inherited wholesale: the pierre viewer supplies line
selection, gutter comments, the comment-to-prompt-context workflow, and in-file find. A table has no line
numbers and participates in none of it.

**Mitigation: R2.** The source toggle from rewrite 001 is part of this rewrite too, defaulting to preview
but always one click from the full pierre viewer.

### Tradeoff 2 — Malformed data must not produce a broken pane

Agent-generated CSV and JSON are frequently partial or invalid — truncated mid-write, trailing commas,
ragged rows. A parser that throws would blank the tab.

**Mitigation: R4.** Parse failures fall back to the source viewer with a stated reason rather than erroring,
and the CSV parser is total: ragged rows pad, it never throws.

### Tradeoff 3 — A second mode store beside rewrite 001's

`markdown-file-view.tsx:12` keeps per-tab preview/source mode in a module-level store. This rewrite adds its
own rather than editing that file (see Design). Two stores for one concept is mild duplication.

Accepted because a given tab is only ever handled by one of the two wrappers — a file is markdown *or*
csv/json, never both — so the stores cannot disagree. Consolidating them would couple the two rewrites and
cost rewrite 001 its independent rollback, which is the more valuable property.

## Requirements

- **R1 — Preview.** `.csv` renders as a table; `.json` renders as structured data (table for an array of
  uniform objects, collapsible tree otherwise). V2 path only.
- **R2 — Source toggle, ships with R1.** Per-tab preview/source switch defaulting to preview, restoring the
  full pierre viewer (line selection, comments, find) in source mode. Mirrors rewrite 001's R2.
- **R3 — Size guard, ships with R1.** Above a per-kind byte threshold, fall back to source and say why:
  **CSV 128 KB, JSON 256 KB.** CSV gets the lower limit because it is the densest of the two — it carries
  almost no syntactic overhead, so a given byte count yields far more cells (and therefore DOM nodes) than
  the same bytes of JSON, where keys, quotes and braces are repeated. Both sit below pierre's own
  `VIRTUALIZE_BYTES = 500_000` (`file.tsx:50`), so anything that falls back still lands in a viewer that
  virtualises it. Bytes are a proxy for cell count; if that proves a poor proxy in practice, add a
  secondary cell-count guard in the same policy module rather than moving the byte limits around.
- **R4 — Never break on bad input, ships with R1.** Invalid JSON or unparseable CSV falls back to the source
  viewer with a reason. The CSV parser is total: it handles quoted fields, embedded commas/newlines/escaped
  quotes, and ragged rows, and never throws.
- **R5 — Dispatcher.** Format detection and per-format limits live in one pure policy module, so a new
  format is a policy entry plus a viewer, with **no further upstream edits**.

R2-R4 are not follow-ups; they are what make R1 safe to default on.

## Design

### Delegate to rewrite 001, do not absorb it

A new fork-owned wrapper sits *in front of* rewrite 001's and hands anything it does not handle to it:

```
renderFile  →  PreviewAwareFileView        (new — csv, json, future formats)
                 └ fallback →  MarkdownAwareFileView   (rewrite 001, unchanged)
                                 └ fallback →  renderSource   (upstream pierre, unchanged)
```

The alternative — generalising `markdown-file-view.tsx` into one component — was rejected. Rewrite 001 is
`Verified`, and its Rollback reads "revert the single edit site and delete `markdown-file-view.tsx`".
Absorbing it entangles the two: reverting 004 would break 001. Chaining keeps each independently
revertable, which matters more in a fork than avoiding one extra component.

Upstream cost of chaining at the edit site is **two changed lines** in `file-tabs.tsx` — the import and the
JSX tag name (`+2/-2`); the existing `fallback={() => renderSource(source)}` prop is passed straight
through. The spec's total upstream footprint is larger than that only because of the two i18n files
(`en.ts` and the parity allowlist), which are additive and required by P6 — see Files.

### The policy module

```ts
// preview-file-view-policy.ts (new)
export type PreviewKind = "csv" | "json"
export function previewKindFromPath(path: string | undefined): PreviewKind | undefined
export function exceedsPreviewLimit(kind: PreviewKind, text: string): boolean   // CSV 128 KB, JSON 256 KB
```

Extension-based, mirroring both `mediaKindFromPath` (upstream convention) and
`markdown-file-view-policy.ts` (our own). Per-kind limits because a 2 MB CSV table is far heavier than 2 MB
of JSON text. This is the R5 seam: HTML and Mermaid later add a `PreviewKind` and a viewer, nothing else.

### The CSV parser

A pure, total `parseCsv(text): { headers: string[]; rows: string[][] }` in its own module — RFC-4180
quoting, embedded delimiters and newlines, escaped quotes, ragged rows padded to the widest. No dependency:
none exists in the repo (verified — no `papaparse`, `csv-parse`, or similar in any `package.json`), and the
logic is small enough that a dependency would cost more than it saves. Ideal P4 material: pure, total, and
exhaustively testable without a DOM.

### Viewers

Two small components, plus shared table chrome. Note `packages/ui` has **no table component** to reuse
(verified), so the table is local and deliberately minimal — a header row, monospaced cells, horizontal
scroll. It must not introduce a `min-width` that fights spec 002's narrower side panel.

## Files

| File | Change |
| ---- | ------ |
| `packages/app/src/pages/session/preview-file-view.tsx` | New. Dispatcher, per-tab mode, toggle chrome; delegates to `MarkdownAwareFileView`. |
| `packages/app/src/pages/session/preview-file-view-policy.ts` | New. `previewKindFromPath`, per-kind size limits. |
| `packages/app/src/pages/session/preview-file-view-policy.test.ts` | New. Extensions, casing, unknown kinds, per-kind limits — **plus a disjointness test** asserting no extension is claimed by both `previewKindFromPath` and rewrite 001's `isMarkdownPath` (import-only; does not modify 001). |
| `packages/app/src/pages/session/preview-csv.ts` | New. Pure, total RFC-4180 parser. |
| `packages/app/src/pages/session/preview-csv.test.ts` | New. Quoting, embedded delimiters/newlines, escaped quotes, ragged rows, empty input — **plus a property pass** feeding a few thousand random/truncated byte strings through the parser asserting it never throws (R4's actual guarantee). |
| `packages/app/src/pages/session/preview-table.tsx` | New. Shared table rendering for both kinds. |
| `packages/app/src/pages/session/preview-json.tsx` | New. Array-of-objects table, collapsible tree otherwise. |
| `packages/app/src/pages/session/file-tabs.tsx` | `+2/-2`. The import line and the JSX tag name — the only two changed lines at the edit site. |
| `packages/app/src/i18n/en.ts` | `+~4`. Keys under `session.files.preview.` (toggle labels, too-large, parse-failed). |
| `packages/app/src/i18n/parity.test.ts` | `+1`. Add the prefix to `REWRITE_KEY_PREFIXES`. |

Estimated upstream footprint: **~7 insertions, 2 deletions across 3 files** — to be re-derived from a real
`git diff --stat` at implementation.

## i18n decision

New user-visible strings are needed (toggle labels, oversized notice, parse-failure notice). These live in
the **app** package, so P6 applies exactly as in rewrite 001: add them to `packages/app/src/i18n/en.ts`
under a `session.files.preview.` prefix and add that prefix to `REWRITE_KEY_PREFIXES` in
`packages/app/src/i18n/parity.test.ts` (which already contains `session.files.markdown.` from 001). Two
files, not sixty.

**Do not generalise rewrite 001's keys.** An earlier draft of this spec suggested renaming
`session.files.markdown.{preview,source,tooLarge}` to a shared `session.files.preview.` prefix and updating
001's call sites. That contradicts this spec's own Non-goal and Design premise: editing
`markdown-file-view.tsx` is editing rewrite 001, which breaks its independent rollback — and the
verification table's "001 was not disturbed" check would **not** catch it, since the keys live in `en.ts`,
not in the policy module that test covers.

So this rewrite adds its own three-or-four keys under `session.files.preview.` and accepts that two
near-identical English strings exist across the two rewrites. That duplication is the price of keeping the
rewrites independently revertable, and it costs nothing upstream. If 001 and 004 are ever deliberately
merged into one preview rewrite, consolidate the keys then.

## Automated verification

To run at implementation, from `packages/app`:

| Check | Expectation |
| ----- | ----------- |
| `bun typecheck` | exit 0 (via `tsc -b` fallback; see AppLocker note in `rewrites/README.md`) |
| `bun run test:unit` | 733 pass baseline + new policy/parser tests |
| `preview-csv.test.ts` | all pass, including malformed/ragged input and the never-throws property pass |
| `preview-file-view-policy.test.ts` | all pass, including the markdown/data extension disjointness check |
| `markdown-file-view-policy.test.ts` | **9 pass, unchanged** — proves 001 was not disturbed |
| `i18n/parity.test.ts` | passes with the new prefix allowlisted |
| `bun run test:browser` | 41 pass, 0 fail |
| `git diff --stat` | 3 upstream files; `markdown-file-view.tsx` **not** among them (P1/independence check) |

## Manual verification

These steps are the regression suite for this rewrite. Re-run them after every rebase.

1. Open a `.csv` — renders as a table with a header row; wide tables scroll horizontally without the page
   scrolling.
2. Toggle to source — the pierre viewer returns with line selection, gutter comments and Ctrl+F intact.
3. Open a `.json` array of uniform objects — renders as a table. Open a nested/irregular `.json` — renders
   as a collapsible tree.
4. Open a **truncated** CSV and an **invalid** JSON — each falls back to source with a stated reason, no
   blank pane and no console error (R4).
5. Open a CSV above the size threshold — falls back to source with the oversized notice (R3).
6. Open a `.md` file — **rewrite 001 still works unchanged**, with its own toggle.
7. Open a `.svg` and a `.png` — still render as images via the existing media path, untouched.
8. Open a `.ts` file — no toggle, completely unaffected.
9. Switch between tabs of different kinds — each remembers its own mode.
10. With the side panel dragged to its narrowest (spec 002), a wide table still scrolls inside its own
    container rather than forcing the panel wider.

## Known gaps

Accepted, not fixed:

- **No sorting, filtering or column resizing** in the table.
- **No virtualisation.** Large files fall back to source via R3 rather than windowing — the same tradeoff
  rewrite 001 made, for the same reason.
- **Mermaid and HTML are not delivered here** — see Scope decision. The dispatcher exists so each is a
  policy entry plus a viewer.
- **JSON preview adds less than CSV** where pierre's syntax highlighting was already adequate.

## Rollback

Revert the two lines in `file-tabs.tsx` (pointing `renderFile` back at `MarkdownAwareFileView`), remove the
i18n keys and the allowlist prefix, and delete the new files. Rewrite 001 continues to work untouched —
which is the point of chaining rather than absorbing.

## Principles applied

See [docs/PRINCIPLES.md](../docs/PRINCIPLES.md).

| Principle | Applied as |
| --------- | ---------- |
| P1 new files | Seven new files; two changed upstream lines |
| P2 one edit site | `SessionFileViewV2.renderFile` — the same single site rewrite 001 already owns |
| P3 rename don't re-indent | Inherited: 001's `renderSource` rename means the pierre block is still passed through byte-for-byte as a `fallback`; this rewrite re-indents nothing |
| P4 policy module | `preview-file-view-policy.ts` and a pure, total `preview-csv.ts`, both DOM-free and fully tested |
| P5 v2 only | `SessionFileViewV1` untouched |
| P6 i18n | New keys in `en.ts` + `REWRITE_KEY_PREFIXES`, exactly as 001 |
| P7 pinned base | `95daf90` recorded in the header table |
| P8 verification | Automated table + manual steps, including explicit non-regression checks on rewrite 001 and the media path |
| P9 local convention | Extension-based dispatch mirrors upstream's `mediaKindFromPath`; `-policy.ts` naming matches the repo |
| P10 no committed workarounds | None needed |

## Rebase notes

Depends on:

- **Rewrite 001's edit site and component** (`file-tabs.tsx:786-794`, `MarkdownAwareFileView`). This
  rewrite chains onto it, so **001's rebase notes apply transitively** — if `SessionFileViewV2.renderFile`
  moves or the v1/v2 split collapses, both rewrites re-derive together. Re-read
  [001's Rebase notes](./001-markdown-file-preview.md) before resolving any conflict here.
- **`MarkdownAwareFileView`'s prop shape** (`{ tab, path, text, cacheKey, fallback }`) — our wrapper passes
  these straight through. A change there is a change here.
- **`renderSource` continuing to own media dispatch** via its `media` prop (`file-tabs.tsx:769-781`). If
  upstream moves media handling out of the pierre viewer, re-check that `.svg`/`.png` still preview (manual
  step 7) — this rewrite deliberately does not handle them.
- **`contents()` remaining the decoded text** at `file-tabs.tsx:800`. Our viewers parse that string; if
  binary or lazily-loaded content starts arriving there, the size guard and parsers need re-checking.

If upstream adds its own multi-format preview dispatcher, drop this rewrite in favour of it and keep only
the formats it lacks.
