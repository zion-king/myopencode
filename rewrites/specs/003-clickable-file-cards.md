# 003 — Clickable file cards in the chat timeline

| Field         | Value                                                        |
| ------------- | ------------------------------------------------------------ |
| Status        | Planned                                                       |
| Branch        | `rewrite/003-clickable-file-cards`                            |
| Upstream base | `95daf90670b7c039c436c85537da5fbfe2205b41` (`dev`, 2026-09-11) |
| Release near base | `v1.18.30`                                                |
| Date          | 2026-09-13                                                    |
| Audit item    | [audits/001](../audits/001-desktop-developer-experience.md) §3a, Rewrite 13 |

## Problem

When the agent reads, edits, or writes a file, the chat timeline renders a tool card whose subtitle is that
file's name. Clicking it does nothing useful — the card only expands to show raw tool output. To actually
look at the file the developer has to leave the conversation, find the file in the tree, and open it
manually, having just been told exactly which file matters.

## Root cause

Four facts, verified against the tree.

**1. A subtitle click handler exists on the card components, but has no production consumer.** Both
components declare it:

- `packages/session-ui/src/components/basic-tool.tsx:39` — `onSubtitleClick?: () => void`, which adds a
  `clickable` class (L213) and fires on click (L216-218).
- `packages/session-ui/src/v2/components/basic-tool-v2.tsx:44` — same prop, sets `cursor: pointer` (L102)
  and fires on click (L104-106).

A repo-wide search shows the only caller of `BasicTool`'s `onSubtitleClick` is
`basic-tool.stories.tsx:126`. The one production-looking hit, `message-part.tsx:1598`, is on a **different
component** — `ToolErrorCard`, whose prop has a different signature (`(event: MouseEvent) => void`,
`tool-error-card.tsx:19`) and which only renders when a `task` *errors*. The `task` card itself does not
use subtitle clicks at all: it makes the **whole card** a link via `triggerAsLink` / `triggerHref` /
`onTriggerClick` (`message-part.tsx:1978-2083`).

So the prop is a **designed-but-unused API**, not a proven path. That is still the right seam to use — it
is upstream's own affordance, and `basic-tool-v2.tsx` carries it too — but this spec must not claim it is
battle-tested, and implementation should expect to be its first real consumer.

**2. The subtitle click only exists for one of the two trigger shapes.** `BasicTool` renders its structured
title/subtitle markup — and therefore the click handler — only inside the
`<Match when={isTriggerTitle(props.trigger) && props.trigger}>` branch (`basic-tool.tsx:195-224`). A
renderer that passes **custom JSX** as `trigger` takes the `dynamicTrigger` branch (L194) instead, where
`onSubtitleClick` is never read.

The three file tools split across exactly this line:

| Tool | Trigger shape | Filename rendered at | `onSubtitleClick` usable? |
| --- | --- | --- | --- |
| `read` | object `{ title, subtitle, args }` (`:1792-1799`) | `subtitle` | **Yes** |
| `edit` | custom JSX (`:2209-2232`) | `<span data-slot="message-part-title-filename">` (`:2217`) | No — inert |
| `write` | custom JSX (`:2276-2295`) | same slot (`:2284`) | No — inert |
| `patch` single-file | custom JSX | same slot (`:2466`) | No — inert |

**Passing `onSubtitleClick` to the `edit` and `write` cards would silently do nothing.** They need a click
target attached to their filename span instead. This is the single most important fact in this spec and it
drives the design below.

**3. There is no single shared card render path.** `message-part.tsx` contains 15 separate `<BasicTool>`
call sites, one per registered tool, so there is no one central place to wire.

**4. The callback cannot reach the card through any existing channel.** Two plausible routes both fail:

- **`useData()`** is reachable from inside a card, but its provider is mounted in
  `packages/app/src/pages/directory-layout.tsx:63-71` — which sits *above* `FileProvider`
  (`session.tsx:317-327`) in the tree. It therefore cannot call `file.load`, and every existing open-a-file
  path treats loading as the caller's job (see `createOpenSessionFileTab`, `helpers.ts:141-160`).
- **The `actions` prop** (`session.tsx:1926`, `{ revert, openAttachment }`) reaches *user* message parts —
  it is consumed for attachments at `message-part.tsx:1302-1303` — but never reaches the assistant tool
  cards.

So the feature is a **plumbing gap**: a proven interaction primitive, an existing open-file implementation,
and no wire between them.

## Goals

Clicking the file name on a `read` / `edit` / `write` tool card opens that file in the session side panel,
in preview, reusing the existing open-file behaviour the file tree already uses.

## Non-goals

- **Jumping to a line.** `read` often has `offset`/`limit`, and `edit` targets a range, but the existing
  open-file path is whole-file. Line targeting is a separate change; see Known gaps.
- **Multi-file `patch` / `apply_patch`.** When they touch several files the subtitle is a *count*, so there
  is no single target. (Note: the **single-file** case does render a filename in the same slot at
  `message-part.tsx:2466`, so it is one extra line-swap away — see Design. Decide at implementation;
  excluded from the estimate here.) `list` renders a *directory*, also out of scope — R3 keeps these
  non-clickable rather than guessing.
- **Making the whole card clickable.** The card body already owns click (expand/collapse) via
  `onTriggerClick`; only the subtitle becomes a click target.
- **Changing `basic-tool.tsx` / `basic-tool-v2.tsx`.** They already support this; touching them would be
  pure diff surface for no gain.
- **Opening files externally.** That is audit item 04.
- **Upstreaming.** `CONTRIBUTING.md` requires design review for UI changes.

## Tradeoffs

### Tradeoff 1 — Wiring the live v1 path, not the v2 one

P5 says patch the v2 path. Here that would ship nothing: `BasicToolV2` has **no consumers** anywhere in the
repo outside its own file and stories (verified by search) — it is built but not yet wired up, while
`message-part.tsx` renders the v1 `BasicTool`. Patching only v2 would be invisible to users.

**Mitigation: R4 + rebase notes.** We wire the live path and record the dependency, so that when upstream
switches `message-part.tsx` to `BasicToolV2` the edit sites move rather than break — the prop name is
identical on both components, so the move is mechanical.

### Tradeoff 2 — Three edit sites, and two different mechanisms

P2 asks for a single edit site. Each tool registers its own renderer, so `read`, `edit` and `write` are
three separate sites; worse, they do not share a mechanism (root-cause fact 2) — `read` gets a prop, the
other two get an element swap. There is no shared seam, and the alternative that *would* give one edit site
is worse (see "Rejected: registry override").

**Mitigation:** all three sites sit in one file; each is one changed line; the decision logic lives in a
policy module (R2) and the swapped element in a fork-owned component, so the upstream lines stay trivial
and carry no logic of their own.

### Tradeoff 3 — We are the first consumer of `onSubtitleClick`

The prop is upstream's own designed affordance but is currently used only by a story
(root-cause fact 1). Being the first real consumer means no production precedent to lean on, and a small
chance upstream removes it as dead code.

**Mitigation:** the `edit`/`write` path — the majority of the value — does not depend on it at all, so a
removal would degrade this rewrite to two-thirds working rather than breaking it. Recorded in Rebase notes.

## Requirements

- **R1 — Click to preview.** Clicking the subtitle of a `read`, `edit` or `write` tool card opens that file
  in the side panel in **preview** (temporary tab), matching the file tree's single-click behaviour rather
  than pinning a permanent tab.
- **R2 — Path resolution is pure and tested.** Which tools expose a single openable path, and how it is
  extracted from the tool input, lives in a `-policy.ts` module with unit tests and no DOM.
- **R3 — Non-file tools are unaffected, ships with R1.** Tools with no single path (`list`, `glob`, `grep`,
  `patch`, `apply_patch`, `bash`, `webfetch`, …) render exactly as today, with no clickable affordance and
  no cursor change.
- **R4 — Degrade silently without a provider, ships with R1.** If the open-file context is absent (any
  surface that renders the timeline outside the session page — e.g. Storybook, the share/read-only view),
  cards render exactly as today rather than throwing.
- **R5 — One affordance, ships with R1.** A clickable filename looks and behaves the same on all three
  cards — same cursor, same hover treatment — despite the two underlying mechanisms. The two-mechanism
  split is an implementation detail and must not be visible to the user.

R3, R4 and R5 are not follow-ups; they are what keep R1 from regressing surfaces it does not own or
shipping a visibly inconsistent affordance.

## Design

### The wire

A new, minimal, **optional** context in session-ui carries the callback from the session page down to the
cards:

```
packages/session-ui/src/context/file-open.tsx   (new)
      ▲ provided by                         ▼ consumed by
packages/app/src/pages/session.tsx      message-part.tsx  ──▶ onSubtitleClick
```

It mirrors the shape of the existing `data.tsx` context (the only other context in that package), so it
reads as native — with one required difference. **`createSimpleContext(...).use()` throws when no provider
is mounted** (`packages/ui/src/context/helper.tsx:33-35`: `if (!value) throw new Error(...)`). R4 therefore
cannot rely on it. The new context must export its own undefined-safe accessor — hold the raw
`createContext` handle and export a `useFileOpenOptional()` that returns `useContext(ctx)` without the
throw — and every consumer must use that accessor, never `.use()`.

`session.tsx` is the provider because it is the lowest point that has **both** `useFile()` and the tab API
in scope, and it already constructs this exact operation: `openReviewFile` (`session.tsx:1156-1162`, built
from `createOpenReviewFile`). The handler we pass is the preview-flavoured sibling of that — the same
four steps the file tree's `previewTab` performs (`session-side-panel.tsx:206-213`): resolve tab, load
file, open the panel, activate the tab.

### The card-side mechanism — two shapes, two treatments

Because of root-cause fact 2, this cannot be "pass one prop three times".

**`read` — use the built-in prop.** Pass `onSubtitleClick` to the existing object trigger. One added line.

**`edit` / `write` — replace the filename span.** These render
`<span data-slot="message-part-title-filename">{filename()}</span>` inside custom JSX. Swap that single
element for a fork-owned component that renders the *same* slot and text, plus a click target:

```tsx
// before (upstream, :2217 and :2284)
<span data-slot="message-part-title-filename">{filename()}</span>
// after
<ClickableFilename path={props.input.filePath}>{filename()}</ClickableFilename>
```

`ClickableFilename` (new file) keeps `data-slot="message-part-title-filename"` on its root so all existing
CSS continues to match, reads the open-file context itself, and falls back to rendering a plain `<span>`
when no handler is available (R4). One line changed per site, nothing re-indented (P3).

**Two implementation constraints, both load-bearing:**

1. **The `data-slot` must sit on the single rendered root element — no extra wrapper.**
   `message-part.css:476-485` gives that slot `min-width: 0; overflow: hidden; text-overflow: ellipsis;
   white-space: nowrap`, and those depend on it remaining the direct flex child of
   `[data-slot="message-part-title"]` (`display: flex`, `:439-452`). Wrapping the span in a `<button>` or
   `<div>` would silently break filename truncation. Render one element, put the attribute and the click
   handler on it.
2. **It must carry its own clickable affordance.** The `read` card gets this free:
   `basic-tool.css:119-127` styles `[data-slot="basic-tool-tool-subtitle"].clickable` with
   `cursor: pointer`, `text-decoration: underline` and a hover transition. The filename slot has **no
   interactive styling whatsoever** (`message-part.css:476-485`). Without a matching treatment, `read`
   filenames would look clickable and `edit`/`write` filenames would not — the same action with two
   different affordances (R5).

   Ship a fork-owned `clickable-filename.css` mirroring the existing `.clickable` rule, scoped to
   `[data-slot="message-part-title-filename"].clickable`, registered in
   `packages/session-ui/src/styles/index.css` (+1 upstream line — that file aggregates component CSS).
   Confirm at implementation whether utility classes are available in this package and would avoid even
   that line.

Single-file `patch` renders the identical span at `:2466`; including it is one more line-swap and should be
decided at implementation rather than assumed here.

This split is unfortunate but honest: it is the shape upstream actually has. The alternative — converting
`edit`/`write` to object triggers so all three use `onSubtitleClick` — would rewrite their entire custom
trigger markup and lose the diff-changes/path sub-rows they render, a far larger and more fragile diff.

### The policy module

`read`, `edit`, `write` → `input.filePath`. Everything else → no path. Encoded as a pure function so the
three call sites stay one line each and the decision is testable without a DOM:

```ts
// tool-file-path-policy.ts (new)
export function openableFilePath(tool: string, input: Record<string, unknown>): string | undefined
```

This also gives a single place to extend later (e.g. if `patch` gains per-file rows).

### Rejected: the `ToolRegistry` override (zero upstream edits)

`ToolRegistry` is exported and `registerTool` **overwrites by name** (`message-part.tsx:1484-1496`), and
session-ui's `"./*"` export map makes it importable from app code — the same mechanism rewrite 001 used. So
we could re-register `read`/`edit`/`write` from a new file and touch **no upstream lines at all**.

Rejected deliberately. The registry hands over the *whole* renderer, and the built-in renderers do not
accept an `onSubtitleClick` to delegate to — so overriding means **copying upstream's read/edit/write card
bodies into our file** (icons, i18n titles, `args` assembly, `loaded` metadata handling, output panes).
That copy would then silently diverge: upstream improvements to those cards would never reach us, and
because we no longer touch their lines, **git would never raise a conflict to tell us**. P1 prefers new
files because new files cannot conflict — but it exists to reduce maintenance cost, and trading a visible
conflict for invisible rot increases it. A three-line diff that conflicts loudly is the cheaper asset.

A variant — override the renderer, delegate to the original, and intercept clicks on
`[data-slot="basic-tool-tool-subtitle"]` by event delegation — avoids the copy but depends on an
undocumented DOM structure and would fail silently if the slot name changed. Also rejected.

### Rejected: extending `DataProvider`

Adding `onOpenFile` beside `onNavigateToSession` would mirror convention nicely, but its provider
(`directory-layout.tsx`) is mounted above `FileProvider` and cannot call `file.load` (root cause 4).
Re-mounting a second `DataProvider` inside the session page to add one callback would mean re-passing
`data`, `directory`, `sessionID`, `onNavigateToSession` and `onSessionHref` — more surface, not less.

## Files

| File | Change |
| ---- | ------ |
| `packages/session-ui/src/context/file-open.tsx` | New. Optional open-file callback context, with an undefined-safe accessor. |
| `packages/session-ui/src/components/clickable-filename.tsx` | New. Renders the `message-part-title-filename` slot as a single element with a click target; plain `<span>` when unprovided. |
| `packages/session-ui/src/components/clickable-filename.css` | New. `.clickable` affordance for that slot, mirroring `basic-tool.css:119-127` (R5). |
| `packages/session-ui/src/styles/index.css` | `+1`. Register the new stylesheet (this file aggregates component CSS). Avoidable if utility classes are usable here. |
| `packages/session-ui/src/components/tool-file-path-policy.ts` | New. Pure `openableFilePath(tool, input)`. |
| `packages/session-ui/src/components/tool-file-path-policy.test.ts` | New. Covers read/edit/write, the excluded tools, and malformed input. |
| `packages/session-ui/src/context/index.ts` | `+1`. Export the new context. |
| `packages/session-ui/src/components/message-part.tsx` | `~+5/-2`. Two imports; `onSubtitleClick` on the `read` trigger (+1); filename span swapped for `ClickableFilename` at `:2217` and `:2284` (+2/-2). |
| `packages/app/src/pages/session.tsx` | `~+4/-1`. Mount the provider around the timeline, handler built from the existing open-file helpers. |

Estimated upstream footprint: **~10 insertions, 3 deletions across 3 files** — a rough figure, to be
re-derived at implementation from an actual `git diff --stat` (per the audit's §0 note on estimate
discipline). Add one line-swap if single-file `patch` (`:2466`) is included.

## i18n decision

Likely none — the filename text already exists; only its interactivity changes. If an accessible name is
needed on the click target (`aria-label`/`title`, e.g. "Open file"), the catalogue is resolved:

This markup lives in `packages/session-ui`, which uses `useI18n()` from `packages/ui` — backed by
**`packages/ui/src/i18n/en.ts`**, not the app's `en.ts`. That catalogue is already a first-class domain in
`packages/app/src/i18n/parity.test.ts` (`domains`, L78-88, `source: "../../../ui/src/i18n/en.ts"`), and
`REWRITE_KEY_PREFIXES` (L102) is applied across every domain in the parity loop (L107+). So **P6 applies
unchanged**: add the key to `packages/ui/src/i18n/en.ts` under a namespaced prefix and add that prefix to
the same `REWRITE_KEY_PREFIXES` array. No new mechanism, and still only two files.

## Automated verification

To run at implementation, from `packages/app` (and `packages/session-ui` where noted):

| Check | Expectation |
| ----- | ----------- |
| `bun typecheck` | exit 0 (via `tsc -b` fallback; see AppLocker note in `rewrites/README.md`) |
| `bun run test:unit` | 733 pass baseline + the new policy tests |
| `tool-file-path-policy.test.ts` | all pass |
| `bun run test:browser` | 41 pass, 0 fail |
| `git diff --stat` | 3 upstream files, footprint in the range above; no changes to `basic-tool.tsx` or `basic-tool-v2.tsx` (P1 check) |

## Manual verification

These steps are the regression suite for this rewrite. Re-run them after every rebase.

1. Ask the agent to read a file. Click the file name on the `read` card — the file opens in the side panel
   in preview (italic/temporary tab), and the panel opens if it was closed.
2. Repeat for an `edit` and a `write` card.
3. Click the *body* of the same card — it still expands/collapses, unchanged.
4. Hover a `grep`, `glob`, `bash` and `patch` card subtitle — no pointer cursor, no click affordance (R3).
5. Click a `task` card — it still navigates into the child session (it uses whole-card `triggerAsLink`, a
   different mechanism; this checks we did not disturb it). Then trigger a `task` error and confirm the
   `ToolErrorCard` subtitle still behaves as before — it is the only other component in the tree with a
   prop of this name, and should be unaffected.
6. Confirm the `edit`/`write` filename still renders with the same styling as before the swap — the
   `data-slot="message-part-title-filename"` attribute must survive, since existing CSS targets it.
7. Open a session whose pane is narrow enough to truncate a long filename — the ellipsis still works on
   `edit`/`write` cards (proves no extra wrapper broke the flex-child truncation; Design constraint 1).
8. Hover the filename on a `read` card and on an `edit` card — identical cursor and hover treatment (R5).
6. Click the same file card twice — it stays a single preview tab rather than accumulating tabs.
7. Open the timeline somewhere without the provider (Storybook `basic-tool.stories.tsx`, or the read-only
   share view if reachable) — cards render, nothing throws (R4).

## Known gaps

Accepted, not fixed:

- **No line targeting.** `read`'s `offset`/`limit` and `edit`'s range are ignored; the file opens at the
  top. This is the most likely follow-up.
- **`patch` / `apply_patch` stay non-clickable** even though they know their file list — their subtitle is
  a count, so there is no single obvious target.
- **`list` stays non-clickable**; opening a directory is a different action.

## Rollback

Remove the provider mount in `session.tsx`, the three `onSubtitleClick` props and context read in
`message-part.tsx`, and the `index.ts` export; delete the two new files. Nothing else depends on them.

## Principles applied

See [docs/PRINCIPLES.md](../docs/PRINCIPLES.md).

| Principle | Applied as |
| --------- | ---------- |
| P1 new files | Context, `ClickableFilename`, policy and tests are new; upstream edits are two imports, one prop line, two element swaps, one export, one provider mount. The zero-edit registry override was rejected for a *worse* maintenance profile (see Design) |
| P2 one edit site | Three call sites in one file, across two mechanisms — the shape upstream has; no shared seam exists. `basic-tool*.tsx` untouched |
| P3 rename don't re-indent | Applied: the `edit`/`write` filename spans are swapped one-for-one for `ClickableFilename`, preserving the `data-slot`. Nothing is wrapped or re-indented |
| P4 policy module | `tool-file-path-policy.ts` + DOM-free tests |
| P5 v2 only | **Deliberately not followed** — `BasicToolV2` has no consumers yet, so the v2-only patch would ship nothing. Live v1 path wired; see Tradeoff 1 and Rebase notes |
| P6 i18n | Likely no new strings; catalogue ownership to resolve if an aria-label is needed |
| P7 pinned base | `95daf90` recorded in the header table |
| P8 verification | Automated table + manual steps above, including a no-regression check on the existing `task` consumer |
| P10 no committed workarounds | None needed |

## Rebase notes

Depends on:

- **`onSubtitleClick` remaining on `BasicTool`** (`basic-tool.tsx:39`) **and the `isTriggerTitle` branch
  that renders it** (`:195-224`). We are its first production consumer, so it carries a small risk of being
  removed as dead code; if that happens, only the `read` card is affected (Tradeoff 3) and it can move to
  the same `ClickableFilename` approach as `edit`/`write`.
- **`data-slot="message-part-title-filename"`** remaining the filename element in the `edit`/`write`
  triggers (`:2217`, `:2284`). If those triggers are restructured, re-derive the swap sites; if they are
  converted to object triggers, all three cards collapse onto `onSubtitleClick` — take that simplification.
- **`message-part.tsx` keeping per-tool `ToolRegistry.register` renderers for `read`/`edit`/`write`.** If
  upstream consolidates them into a shared file-tool renderer, that becomes a *better* single edit site —
  take it.
- **`BasicToolV2` adoption.** The moment `message-part.tsx` starts rendering `BasicToolV2`, move the three
  props across; the prop name and signature are identical, so this is mechanical. Watch for it on every
  rebase (Tradeoff 1).
- **`createOpenReviewFile` / `createOpenSessionFileTab` in `pages/session/helpers.ts`** and the
  `previewTab` behaviour in `session-side-panel.tsx:206-213` — the handler mirrors these. If the open-file
  contract changes (e.g. loading becomes lazy inside the tab), simplify the handler to match.
- **`DataProvider` staying above `FileProvider`.** If upstream ever moves the data context below the file
  context, extending `DataProvider` with `onOpenFile` becomes the smaller design and this context should be
  retired in its favour.
