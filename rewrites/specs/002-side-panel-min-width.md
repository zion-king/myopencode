# 002 — Side panel minimum width

| Field         | Value                                                         |
| ------------- | ------------------------------------------------------------- |
| Status        | Implemented — automated checks pass                           |
| Branch        | `rewrite/002-side-panel-min-width`                            |
| Upstream base | `95daf90670b7c039c436c85537da5fbfe2205b41` (`dev`, 2026-09-11)|
| Release near base | `v1.18.30`                                                |
| Date          | 2026-09-13                                                    |
| Audit item    | [audits/001](../audits/001-desktop-developer-experience.md) §3a, Rewrite 12 |

## Problem

The review/file side panel cannot be narrowed past a fixed floor, at any window size. A developer who
wants more room for the chat column — while keeping the side panel open for reference — has no way to get
it. The only options are "side panel at ≥480px" or "side panel closed entirely".

This cannot be fixed through configuration: the floor is a hardcoded constant, and OpenCode exposes no
renderer/UI extension point (see [`../README.md`](../README.md)).

## Root cause

`packages/app/src/pages/session/session-panel-width.ts` is a 19-line pure module holding three constants:

```ts
export const SESSION_PANEL_WIDTH_MIN = 450        // floor for the chat/composer column
export const REVIEW_PANE_WIDTH_MIN = 480          // width the side panel reserves, unified diff
export const REVIEW_PANE_WIDTH_MIN_SPLIT = 800    // width the side panel reserves, split diff
```

The side panel has **no width of its own** — it is `flex-1` and takes whatever the chat column leaves
behind (the module's own header comment says so). Its width is therefore derived:

```
sidePanelWidth  =  available − chatWidth
chatWidthMax    =  sessionPanelWidthMax({ available, split })
                =  Math.max(SESSION_PANEL_WIDTH_MIN, available − pane)
```

where `pane` is `REVIEW_PANE_WIDTH_MIN_SPLIT` in split-diff mode and `REVIEW_PANE_WIDTH_MIN` otherwise.

The only user-facing control is the chat column's `ResizeHandle` (`session.tsx:2287-2299`,
`min={SESSION_PANEL_WIDTH_MIN}`, `max={sessionPanelMax()}`). Dragging it right grows the chat column and
shrinks the side panel — but only until `chatWidth` hits `chatWidthMax`, at which point the side panel is
pinned at exactly `pane` px. So `REVIEW_PANE_WIDTH_MIN` is precisely the constant that stops the panel
from getting narrower, and it is flat: it does not scale with window width, and there is no setting for it.

Consumers are limited to three call sites, all in `packages/app/src/pages/session.tsx`
(`sessionPanelMax()` at L485-489, `sessionPanelResizedWidth()` at L492-498, and `min={SESSION_PANEL_WIDTH_MIN}`
at L2293). Nothing else in the repo imports these constants.

Nothing in the rendered tree prevents a narrower panel: the `<aside>` carries `min-w-0`
(`session-side-panel.tsx:297`) and `session-review.css` sets `min-width: 0` on its inner containers
(L107, L114, L130). The panel is shrinkable today; only the derived-width arithmetic forbids it.

Verified that no layout rule elsewhere assumes a ≥480px pane, which would otherwise become the real binding
constraint once the arithmetic stops being one:

- No `@container` queries exist anywhere under `packages/session-ui/src` or `packages/app/src/pages/session`.
- No `@media` queries or hardcoded pixel widths (`w-[…]`, `min-w-[…]`) in `review-panel-v2.tsx`,
  `session-side-panel.tsx`, or `session-file-browser-tab.tsx`.
- The only non-zero `min-width` rules in the review tree are `session-review-v2.css:275,302` at **36px**
  (icon-sized controls) — an order of magnitude below the proposed floor.

## Goals

Let the developer trade side-panel width for chat width, at any window size, by dragging the existing
handle further than the current floor allows — without changing any default, any persisted width, or any
behavior above the floor.

## Non-goals

- **User-configurable floors.** A Settings row would need settings-v2 UI, persistence, and i18n keys for a
  value most users set once. Out of scope; see Known gaps.
- **Changing the chat column's own minimum** (`SESSION_PANEL_WIDTH_MIN = 450`). It is what keeps narrow
  windows usable; it stays exactly as-is.
- **Collapsing the side panel to zero.** That is the existing open/close toggle's job
  (`view().reviewPanel.toggle()`), not the resize handle's.
- **A dedicated resize handle on the side panel itself.** Its width is derived by deliberate upstream
  design; adding a second handle for the same boundary is a different, larger change.
- **The file-tree-only panel.** It already has its own handle and a lower floor
  (`FILE_TREE_WIDTH_MIN = 240`, `session-side-panel.tsx:62`, max 480). Untouched.
- **Upstreaming.** `CONTRIBUTING.md` requires design review for UI changes.

## Tradeoffs

Both tradeoffs come from the same fact: **a narrower review pane is a more cramped review pane.** Neither
is imposed on anyone — the panel only gets narrower if the user drags it there.

### Tradeoff 1 — Diff legibility at the new minimum

The pierre diff viewer wraps or horizontally scrolls more as the pane narrows, and the panel's tab bar
(review tab, file tabs, `+`, Open-in-app) shows fewer tabs before scrolling. At the proposed 280px floor
the pane is usable for navigation and short lines but poor for reviewing wide code.

**Mitigation: R2.** The floor stays high enough to keep the tab bar and its controls operable, rather than
allowing an arbitrarily thin sliver. 280px is deliberately close to the already-shipping
`FILE_TREE_WIDTH_MIN = 240` — a width upstream already treats as usable for a panel of this family.

**Open at implementation:** 280 is chosen by analogy to `FILE_TREE_WIDTH_MIN`, not measured against the
tab bar's intrinsic width (review tab + file tabs + `+` + Open-in-app control). Measure it in the browser
before landing — if the bar's controls overflow before 280, raise the floor to that measured width and
record the measured number here. This is the one value in the spec that should be confirmed empirically
rather than reasoned into place.

### Tradeoff 2 — Split diffs are two columns in the same space

Split-diff mode renders two code columns side by side, which is why upstream reserves 800px for it rather
than 480. Lowering that floor proportionally means each column gets roughly half the pane.

**Mitigation: R3.** Split keeps a strictly larger floor than unified (proposed 560 = 2 × 280), preserving
the existing invariant that split mode needs more room, and keeping the upstream test that asserts
`REVIEW_PANE_WIDTH_MIN_SPLIT > REVIEW_PANE_WIDTH_MIN` green.

R2 and R3 are not follow-ups. They are the reasons R1 is acceptable.

### Not a tradeoff: existing users are unaffected

Worth stating explicitly because it is the main risk one would expect and it does not exist here.
`clampSessionPanelWidth` only ever clamps **down** (`Math.min(width, max)`). Lowering the reserved pane
width *raises* `max`, so no persisted `layout.session.width()` is re-clamped and nobody's layout moves on
upgrade. The change is inert until the user drags the handle.

## Requirements

- **R1 — Lower the reserved side-panel width.** `REVIEW_PANE_WIDTH_MIN` drops 480 → 280 and
  `REVIEW_PANE_WIDTH_MIN_SPLIT` drops 800 → 560, so the chat column can grow ~200px (unified) / ~240px
  (split) further than today at every window width where the chat floor is not already binding.
- **R2 — Keep a usable floor, ships with R1.** The panel never goes below 280px (unified), keeping the tab
  bar and its controls operable. No collapse-to-zero via the handle.
- **R3 — Split stays strictly larger, ships with R1.** `REVIEW_PANE_WIDTH_MIN_SPLIT` remains > `REVIEW_PANE_WIDTH_MIN`.
- **R4 — No behavior change above the floor.** Dragging, width persistence, first-frame behavior before
  measurement, and re-clamping on window resize are all untouched.

## Design

The entire behavioral change is **two constant values** in one 19-line pure upstream module:

```ts
// packages/app/src/pages/session/session-panel-width.ts
export const SESSION_PANEL_WIDTH_MIN = 450        // unchanged
export const REVIEW_PANE_WIDTH_MIN = 280          // was 480
export const REVIEW_PANE_WIDTH_MIN_SPLIT = 560    // was 800
```

No call site changes. `session.tsx` already derives everything through `sessionPanelWidthMax()` and
`clampSessionPanelWidth()`, so lowering the inputs is sufficient.

### Why constants and not the proportional formula the audit sketched

[audits/001](../audits/001-desktop-developer-experience.md) §3a proposed a window-relative floor,
`Math.min(480, available * 0.3)`. Sketching it against the real numbers shows it fails the requirement:

| `available` | Audit formula → pane | Effect |
| --- | --- | --- |
| 1700 (typical maximised window) | `min(480, 510)` = **480** | identical to today — no improvement where it is actually wanted |
| 900 (narrow window) | `min(480, 270)` = 270 | improves, but only here |

The user-visible problem is "I cannot narrow the panel **at any window size**", and a proportional floor
leaves ordinary windows exactly as they are. It also breaks two existing upstream tests (at `available =
1700`, split mode would reserve 510 instead of the asserted 800). Flat, lower constants deliver the goal at
every width, for a smaller diff. This supersedes the audit's sketch.

### Why edit the constants in place rather than shadow them from a new file

P1 says to prefer new files. The alternative considered was a new `session-panel-width-floors.ts` exporting
our values, with `session.tsx` importing from it instead. Rejected: it moves the edit site from a stable,
19-line, purpose-built helper into `session.tsx` — a 2400-line component file that upstream edits
constantly. Two constants in the quiet file is both the smaller and the *colder* diff. P2 (one edit site)
is better served by the file nobody touches.

### Tests live in a new file

Our regression tests go in a **new** `session-panel-width-floors.test.ts` rather than being appended to the
upstream `session-panel-width.test.ts`, keeping the upstream footprint at exactly `+2/-2`.

The two files assert different things on purpose:

- Upstream's existing tests assert *relative* to the constants (`toBe(1700 - REVIEW_PANE_WIDTH_MIN)`), so
  they stay green for any floor value and keep verifying the arithmetic model.
- Ours assert the *literal* values and the resulting widths, so if a rebase silently restores 480/800 — or
  upstream reworks the model — our suite fails loudly instead of the feature quietly disappearing (P8).

All 8 existing tests were checked by hand against the new values and pass unmodified; the narrow-window
cases (`available` 600/700/0) are governed by `SESSION_PANEL_WIDTH_MIN`, which does not change.

## Files

| File | Change |
| ---- | ------ |
| `packages/app/src/pages/session/session-panel-width.ts` | `+2/-2`. Two constants lowered. Only upstream edit. |
| `packages/app/src/pages/session/session-panel-width-floors.test.ts` | New. Pins the lowered floors and the resulting chat maxima at representative window widths. |

Total upstream footprint: **2 insertions, 2 deletions, 1 file** — smaller than rewrite 001's 24/2.

## i18n decision

None required. This rewrite adds no user-visible strings, so P6 does not apply and
`REWRITE_KEY_PREFIXES` in `parity.test.ts` is untouched.

## Automated verification

Run from `packages/app`:

| Check | Expectation | Result |
| ----- | ----------- | ------ |
| `bun typecheck` | exit 0 | Passed (`tsgo -b`, no errors) |
| `bun run test:unit` | 733 pass, 0 fail (baseline at `95daf90`), plus the new floors tests | 739 pass, 0 fail |
| `session-panel-width.test.ts` | 8 pass, **file unmodified** — the contract check that we did not disturb upstream's arithmetic | 8 pass, file untouched |
| `session-panel-width-floors.test.ts` | all pass | 6 pass |
| `bun run test:browser` | 41 pass, 0 fail | 41 pass, 0 fail |
| `git diff --stat` | exactly `1 file changed, 2 insertions(+), 2 deletions(-)` for upstream files (P3 check) | Matches exactly |

### Tab-bar floor measurement — not completed automatically

The "Open at implementation" item above (measure 280px against the tab bar's intrinsic
width) requires driving the actual Electron app with a running project/session, which this
implementation pass could not do headlessly on this Windows environment (no project run
skill exists yet for this repo, and the app needs a live `opencode` server + project
directory, not just a static page). 280 remains chosen by analogy to
`FILE_TREE_WIDTH_MIN = 240`, unconfirmed against the tab bar's actual rendered width. This
is called out explicitly, per P8, rather than silently assumed — **manual verification step
5 below must confirm this before the spec is marked fully Verified.**

## Manual verification

These steps are the regression suite for this rewrite. Re-run them after every rebase.

1. Open a session with the review panel open. Drag the divider right — the side panel narrows past the old
   480px stop, down to ~280px, and the chat column gains that space.
2. Switch the review panel to split-diff style and drag again — the panel stops at ~560px, not 280px.
3. Narrow the window to ~1000px wide — the chat column still refuses to go below 450px and no horizontal
   overflow appears in the layout row.
4. Note the panel width, quit, and relaunch — the width is exactly where it was left (no re-clamp on
   upgrade, per "Not a tradeoff" above).
5. At the new minimum width, confirm the panel's tab bar is still operable (tabs selectable, `+` and
   Open-in-app reachable) and a wide diff scrolls horizontally rather than clipping.
6. Open the file-tree-only panel (review closed) and drag its own handle — unchanged behavior, floor still
   240px.

## Known gaps

Accepted, not fixed:

- **Floors remain hardcoded**, not user-configurable. A Settings row is the natural follow-up if 280 turns
  out to be the wrong number for some workflow.
- **The side panel still has no handle of its own**; width remains derived from the chat column's handle.
- **Split diffs at the 560px floor are cramped** (~280px per column) — user-elected, per Tradeoff 2.

## Rollback

Restore the two constants to 480 / 800 and delete `session-panel-width-floors.test.ts`. Nothing else in
the tree depends on either.

## Principles applied

See [docs/PRINCIPLES.md](../docs/PRINCIPLES.md).

| Principle | Applied as |
| --------- | ---------- |
| P1 new files | Only 2 upstream lines change; the rewrite's tests live in a new file |
| P2 one edit site | One file, one pair of adjacent constants; the *coldest* candidate file was chosen deliberately over `session.tsx` |
| P3 rename don't re-indent | N/A — nothing is wrapped or moved, so no lines are re-indented |
| P4 policy module | Upstream already isolates this logic in a pure, framework-free module; we change values in place rather than duplicating it |
| P5 v2 only | N/A — `session-panel-width.ts` is a single shared module with no v1/v2 pair. Both paths consume it via the same memos; the change is behaviour-identical in each |
| P6 i18n | No user-visible strings added |
| P7 pinned base | `95daf90` recorded in the header table |
| P8 verification | Automated table + manual steps above; our tests pin literals so a silent revert fails loudly |
| P10 no committed workarounds | None needed |

## Rebase notes

Depends on:

- **`session-panel-width.ts` keeping its three exported constants and the
  `Math.max(chatFloor, available − pane)` model.** This file has churned recently — the existing test
  comments reference an older cap of "45% of the window" that was replaced by the current reserve-based
  model. If upstream reworks the model again, **re-derive the floors rather than force the two-line patch**;
  the intent is "let the side panel get narrower", not "these two numbers".
- `sessionPanelMax()` and `sessionPanelResizedWidth()` in `session.tsx` (L485-498) continuing to consume
  these helpers, and the `ResizeHandle` at L2287-2299 continuing to take `max={sessionPanelMax()}`.
- `min-w-0` on the side panel `<aside>` (`session-side-panel.tsx:297`) and `min-width: 0` in
  `session-review.css` — these are what let the pane physically shrink. If upstream introduces a real
  `min-width` on the review pane, that becomes the binding constraint instead and this rewrite stops
  having an effect.
- The upstream `session-panel-width.test.ts` remaining constant-relative. If upstream rewrites those
  assertions to use literals (480/800), they will fail against our values and that file becomes a second
  edit site — at which point reconsider the shadow-module alternative described in Design.

If upstream makes these floors user-configurable, drop this rewrite in favour of the setting.
