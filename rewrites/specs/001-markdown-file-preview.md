# 001 — Markdown file preview

| Field         | Value                                                        |
| ------------- | ------------------------------------------------------------ |
| Status        | Verified                                                      |
| Branch        | `rewrite/001-markdown-file-preview`                           |
| Upstream base | `95daf90670b7c039c436c85537da5fbfe2205b41` (`dev`, 2026-09-11); originally `38e10eb` (2026-08-08) |
| Release near base | `v1.18.15` (2026-08-07)                                   |
| Date          | 2026-08-09                                                    |

## Problem

Opening a `.md` file in the session file browser shows raw Markdown source. There is no
rendered preview. This cannot be fixed through configuration: OpenCode's extension
surface (plugins, custom tools, MCP, themes, keybinds, commands) is server-side, and no
renderer/UI extension point exists.

## Root cause

The session file view renders every text file through the "pierre" viewer
(`packages/session-ui/src/components/file.tsx`), a syntax-highlighting code/diff
component. It has **no markdown handling** of any kind.

Meanwhile a complete, production markdown renderer already exists in the repo at
`packages/session-ui/src/components/markdown.tsx` — worker-based incremental parse and
highlight, DOMPurify sanitization, shiki, `morphdom` patching — but it is only used for
chat message parts, never for files.

So the feature is mostly a wiring problem, not new functionality.

## Goals

Render markdown files as formatted markdown in the session file view, reusing the
existing `Markdown` component, without regressing the existing file-review workflow.

## Non-goals

- Editing markdown in preview mode.
- Fixing relative asset resolution (see Known gaps).
- Touching the v1 layout (`SessionFileViewV1`); it is being retired, see
  `oldInterfaceSunset` in `packages/app/src/context/settings.tsx`.
- Upstreaming. `CONTRIBUTING.md` requires design review for UI features.

## Tradeoffs

Both derive from one fact: **`Markdown` was built to render chat output, not to be a
file viewer.** Its entire prop surface is `{ text, cacheKey?, streaming?, class?, classList? }`.
The pierre `File` component it replaces takes ~15 props.

### Tradeoff 1 — Loss of line-level affordances

`renderFile()` in `file-tabs.tsx` passes the following to pierre. `Markdown` accepts none:

| Prop | Capability lost in preview |
| ---- | -------------------------- |
| `enableLineSelection`, `onLineSelected`, `onLineSelectionEnd`, `onLineNumberSelectionEnd` | Line range selection |
| `enableGutterUtility`, `renderGutterUtility` | Gutter affordance to start a comment |
| `annotations`, `renderAnnotation`, `commentedLines` | Inline comment threads |
| `selectedLines` | Selection highlight and restore |
| `search` | Ctrl+F in-file find (`find` stays `null`, handler no-ops) |
| `onRendered` | Post-render scroll restoration hook |

The significant loss is the **comment-to-prompt-context workflow**: selecting lines and
commenting calls `addCommentToContext()`, which fires
`prompt.context.add({ type: "file", path, selection, comment, preview })`. That path is
keyed entirely on line numbers. Rendered markdown has no line numbers, so it cannot
participate.

**Mitigation: R2.** Preview must never be a one-way door.

Minor, same cause:
- Scroll restore degrades but survives. `createScrollSync.getCode()` looks for a
  `diffs-container` shadow root; with markdown there is none, so `code()` is `[]`.
  Vertical restore still works via `el.scrollTop`; horizontal sync and the `onRendered`
  re-restore are lost.

### Tradeoff 2 — No virtualization

Pierre has an explicit escape hatch:

```
file.tsx:50    const VIRTUALIZE_BYTES = 500_000
file.tsx:775   const virtual = createMemo(() => bytes() > VIRTUALIZE_BYTES)
```

Above 500 KB it swaps to `VirtualizedFile` and mounts only the visible window.

`Markdown` has no equivalent. It splits input into blocks, sets `innerHTML` per block,
and `morphdom`s them in. That block structure exists to make **streaming** updates cheap,
not to keep off-screen content out of the DOM. Every block of a finished document is
mounted. No byte threshold, no windowing, no `IntersectionObserver`.

Failure mode is a UI freeze rather than graceful degradation.

**Mitigation: R3.**

## Requirements

- **R1 — Render.** `.md`, `.markdown`, `.mdx`, `.mdc` render as formatted markdown in the
  session file view, via the existing `Markdown` component. V2 path only.
- **R2 — Toggle, ships with R1.** A per-tab source/preview toggle. Defaults to preview
  for markdown files. Switching to source restores the full pierre viewer with line
  selection, comments, and find intact.
- **R3 — Size guard, ships with R1.** Above a conservative byte threshold (100 KB), fall
  back to the source viewer and surface the reason. 100 KB rather than pierre's 500 KB
  because markdown parsing plus per-block shiki highlighting is heavier per byte than
  pierre's line rendering.

R2 and R3 are not follow-ups. They are the mitigations that make R1 acceptable.

## Design

All logic lives in a **new file**, `packages/app/src/pages/session/markdown-file-view.tsx`,
which owns: extension detection, the size guard, per-tab view mode state, the toggle
control, and the `Markdown` wrapper.

`packages/app/src/pages/session/file-tabs.tsx` receives **exactly one edit**: inside
`SessionFileViewV2`, `renderFile` is wrapped so the existing pierre block is passed
through verbatim as a `fallback`.

```tsx
const renderFile = (source: string) => (
  <MarkdownAwareFileView
    tab={props.tab}
    path={path()}
    text={source}
    cacheKey={cacheKey()}
    fallback={() => (/* existing pierre block, unchanged */)}
  />
)
```

Net upstream footprint: one import plus one wrapped expression, in one function.

No CSS work is required. `markdown.css` targets `[data-component="markdown"]`, set by the
component itself, and is already loaded via `@opencode-ai/session-ui/styles`.

`@opencode-ai/session-ui/markdown` resolves through the `"./*": "./src/components/*.tsx"`
export map in that package's `package.json`.

## Files

| File | Change |
| ---- | ------ |
| `packages/app/src/pages/session/markdown-file-view.tsx` | New. Component and per-tab mode state. |
| `packages/app/src/pages/session/markdown-file-view-policy.ts` | New. Pure logic: extension match, size limit. |
| `packages/app/src/pages/session/markdown-file-view-policy.test.ts` | New. 9 tests. |
| `packages/app/src/pages/session/file-tabs.tsx` | `+13/-1`. One import, `renderFile` renamed to `renderSource`, new `renderFile` wrapper. |
| `packages/app/src/i18n/en.ts` | `+3`. Three keys under `session.files.markdown.`. |
| `packages/app/src/i18n/parity.test.ts` | `+5/-1`. Rewrite-key prefix allowlist. |

The pure logic lives in a separate `-policy.ts` module so it is testable without importing
the SolidJS component or the markdown renderer. This matches the existing repo convention
(`review-diff-kinds.ts`, `session-panel-layout.ts`, `general-controller-behavior.ts`).

The `renderFile` -> `renderSource` rename plus a new wrapper was chosen deliberately over
moving the pierre block inside the `fallback` prop. Wrapping in place re-indented 48 lines,
producing a `+62/-50` diff; the rename approach re-indents nothing and produces `+13/-1`.
Git's default 3-way merge is not whitespace-tolerant, so this materially reduces rebase risk.

## i18n decision

Three keys were required (`.preview`, `.source`, `.tooLarge`); no reusable equivalents
existed in `en.ts`. Adding them to all 60+ locale bundles would have been the single
largest diff in this rewrite. They live in `en.ts` only, with a prefix allowlist in
`parity.test.ts`. See P6 in `rewrites/PRINCIPLES.md` for the rationale and the automatic
English-fallback mechanism that makes it safe.

## Automated verification

Re-verified at base `95daf90` (upstream sync), from `packages/app`:

| Check | Result at `95daf90` | (orig `38e10eb`) |
| ----- | ------ | ------ |
| typecheck | exit 0 (via `tsc -b`; see note) | exit 0 |
| `bun run test:unit` | 733 pass, 0 fail | 727 pass |
| `bun run test:browser` | 41 pass, 0 fail | 41 pass |
| `markdown-file-view-policy.test.ts` | 9 pass | 9 pass |
| `@opencode-ai/session-ui/markdown` import | resolves (the `./*` export survived the merge) | resolves |

Notes:
- `bun typecheck` requires the Windows symlink workaround described in `rewrites/README.md`.
- At `95daf90`, the configured `tsgo` (`@typescript/native-preview`) binary is blocked by
  Windows Application Control after `bun install` re-extracted it, so types were validated
  with the JS `tsc -b` (TypeScript 5.8.2) fallback, which runs under permitted `node`. Same
  project graph, exit 0. See the AppLocker note in `rewrites/README.md`.

## Manual verification

Confirmed at base `38e10eb` on 2026-08-09: markdown files render as formatted markdown in
the session file view (R1).

Run the primary loop and check:

1. Open `AGENTS.md` — renders as formatted markdown.
2. Toggle to source — pierre viewer returns; line selection, gutter comment, and
   comment-to-prompt-context all work.
3. Open a `.ts` file — completely unaffected, no toggle shown.
4. Open a markdown file larger than the threshold — falls back to source with a reason.
5. Switch between file tabs — each tab remembers its own mode.

These steps are the regression suite for this rewrite. Re-run them after every rebase.

## Known gaps

Accepted, not fixed:

- **Relative images.** DOMPurify runs with `USE_PROFILES: { html: true }`, so `<img>`
  survives, but `![](./diagram.png)` resolves against the renderer's document URL, not the
  project directory, and 404s. Remote `https://` images load.
- **Relative links.** `[link](./other.md)` attempts SPA navigation rather than opening
  that file in a tab.
- **No editing** in preview mode.

## Rollback

Revert the single edit site in `file-tabs.tsx` and delete `markdown-file-view.tsx`.
Nothing else in the tree depends on either.

## Principles applied

See `rewrites/PRINCIPLES.md`. This rewrite is where they were derived.

| Principle | Applied as |
| --------- | ---------- |
| P1 new files | ~120 lines of implementation, 13 in an upstream file |
| P2 one edit site | `SessionFileViewV2` only, plus one import |
| P3 rename don't re-indent | `renderFile` -> `renderSource` + new wrapper; `+62/-50` became `+13/-1` |
| P4 policy module | `markdown-file-view-policy.ts` + 9 DOM-free tests |
| P5 v2 only | `SessionFileViewV1` deliberately untouched |
| P6 i18n | 3 keys in `en.ts` + `REWRITE_KEY_PREFIXES` allowlist |
| P7 pinned base | `38e10eb` recorded in the header table |
| P8 verification | Automated table above plus manual steps |
| P10 no committed workarounds | Symlink fix via `skip-worktree`, documented in README |

## Rebase notes

Depends on:

- `SessionFileViewV2.renderFile` in `file-tabs.tsx` — the edit site. If it is renamed,
  restructured, or the v1/v2 split collapses, re-derive rather than force the patch.
- `Markdown` export and prop shape in `packages/session-ui/src/components/markdown.tsx`.
- The `"./*"` subpath export in `packages/session-ui/package.json`.
- `settings.general.newLayoutDesigns()` gating `SessionFileViewV2`. Once the v1 layout is
  fully removed, the `SessionFileViewV1` branch disappears and the edit site may move.
