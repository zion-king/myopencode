# Changelog

A running record of rewrite updates and every spec implementation in this fork.

- **What belongs here:** each spec that lands, notable follow-ups to a landed spec, and
  environment/tooling changes that affect how rewrites are built or maintained.
- **What does not:** upstream commits pulled in during a rebase. Those are tracked by git
  and the base SHA in each spec; only record the rebase itself and anything it forced us
  to re-derive.

Entries are newest first. Each references its spec in `specs/` and the commits that
implemented it. Statuses mirror the spec header and the inventory table in `README.md`:
`Planned` -> `Implemented` -> `Verified`. Dates are the implementing commit dates.

Format is adapted from [Keep a Changelog](https://keepachangelog.com). Because rewrites
deliberately minimise upstream edits (see [docs/PRINCIPLES.md](./docs/PRINCIPLES.md)), each entry separates **new
files** (ours, conflict-free) from **upstream edits** (the rebase-sensitive surface).

---

## Upstream sync: `38e10eb` -> `95daf90` (dev) - 2026-09-13

Merged 352 upstream commits (2026-08-08 -> 2026-09-11) into the fork. Merge commit `ead1b0d`
on `integration/upstream`, strategy `ort`, **zero conflicts**.

### Why conflict-free

Pre-merge blob analysis confirmed upstream touched **none** of our three edit-site files
(`file-tabs.tsx`, `i18n/en.ts`, `i18n/parity.test.ts` were byte-identical to our base), and
all four semantic dependencies were intact (the `@opencode-ai/session-ui` `./*` export our
`Markdown` import relies on survived). This is the P1-P3 discipline paying off: a 24-line
upstream footprint isolated in files nobody else edits.

### What we gained (headline)

Predominantly reliability, not UI churn: network/streaming retry hardening, agent subagent
error surfacing, provider fixes (Azure CLI auth, Cloudflare AI Gateway, Bedrock reasoning),
v1/v2 database + config compatibility, and v2 app polish (session rename, archived-session
handling, file-search-while-loading). ~99 of 352 commits were cloud-only (`console`/`stats`/
`go`/`zen`) with no local effect. The `happy-dom` bump (#46675) targets the flaky unit test
we had documented.

### Re-verification at `95daf90` (packages/app)

- typecheck: exit 0 (via `tsc -b` fallback; see below)
- `test:unit`: 733 pass, 0 fail (was 727) - no flake this run
- `test:browser`: 41 pass, 0 fail
- policy tests: 9 pass; `session-ui/markdown` import resolves
- portable build: `OpenCode Dev` now reports **v1.18.30** (merge bumped desktop version);
  rewrite markers present in the freshly-built renderer bundle

### Forced re-derivations / environment

- **tsgo blocked by AppLocker.** `bun install` re-extracted `@typescript/native-preview`;
  the native `tsgo.exe` is blocked by Windows Application Control (same policy class as the
  NSIS installer). Validated types with `tsc -b` instead. Documented in `README.md`.
- **`build-portable.ps1` fixed.** It previously ran only `electron-builder --dir`, packaging a
  stale `out/`. It now runs `bun run build` (electron-vite) first so the package reflects
  current source. Without this, the post-merge package would have shipped pre-merge code.
- `bun.lock` restored after install (bun 1.4.0 pruned orphaned coverage-tooling entries;
  irrelevant to `bun test`).

### Deferred

The 10 rewrites scoped in [audits/001-desktop-developer-experience.md](./audits/001-desktop-developer-experience.md) remain
scoped-only; each will land later as its own numbered spec against this stabilized base.

---

## [003] Clickable file cards in the chat timeline: 2026-09-13

Status: **Implemented** — automated checks pass; manual verification pending · Base:
`95daf90` · Spec: [specs/003-clickable-file-cards.md](./specs/003-clickable-file-cards.md) ·
Plan: [plans/003-clickable-file-cards.md](./plans/003-clickable-file-cards.md)

Clicking the file name on a `read`, `edit`, or `write` tool card in the chat timeline now
opens that file in the session side panel, in preview — reusing upstream's own
designed-but-previously-unused `onSubtitleClick` affordance (`read`) and a fork-owned
element swap (`edit`/`write`, whose filename lives in custom JSX rather than an object
trigger).

### Added (new files)

- `packages/session-ui/src/context/file-open.tsx`: optional, non-throwing open-file
  callback context (deliberately not `createSimpleContext`, which throws with no provider).
- `packages/session-ui/src/components/clickable-filename.tsx`: renders the
  `message-part-title-filename` slot as a single element with a click target; a plain
  `<span>` when no provider is mounted.
- `packages/session-ui/src/components/clickable-filename.css`: `.clickable` affordance
  mirroring `basic-tool.css`'s existing subtitle treatment, so `read` and `edit`/`write`
  look identical (R5).
- `packages/session-ui/src/components/tool-file-path-policy.ts` +
  `tool-file-path-policy.test.ts`: pure `openableFilePath(tool, input)`, 7 tests.

### Changed (upstream edits, rebase-sensitive)

- `packages/session-ui/src/components/message-part.tsx` (+11/-3): three imports;
  `onSubtitleClick` wired on the `read` trigger; `edit`/`write` filename spans swapped
  one-for-one for `ClickableFilename` (`data-slot` preserved, nothing re-indented).
- `packages/app/src/pages/session.tsx` (+14): new `previewFile` handler (sibling of the
  existing `openReviewFile`, but opens a preview/temporary tab); `FileOpenProvider` mounted
  around `MessageTimeline`.
- `packages/session-ui/src/context/index.ts` (+1): export the new context.
- `packages/session-ui/src/styles/index.css` (+1): register the new stylesheet.

`basic-tool.tsx` / `basic-tool-v2.tsx` — the components that already declare
`onSubtitleClick` — are untouched, per P5's reasoning in the spec (v2 has no production
consumer yet, so only the live v1 path was wired).

Total upstream footprint: **27 insertions, 3 deletions across 4 files.**

### Requirements delivered

- **R1** click-to-preview on `read`/`edit`/`write`.
- **R2** path resolution isolated in `tool-file-path-policy.ts`, DOM-free, 7 tests.
- **R3** non-file tools (`list`, `grep`, `bash`, `patch`, …) unaffected — confirmed by
  `openableFilePath` only recognizing `read`/`edit`/`write`.
- **R4** degrades silently without a provider — `useFileOpenOptional()` never throws;
  `ClickableFilename` falls back to a plain, non-interactive `<span>`.
- **R5** one visual affordance across both mechanisms — `clickable-filename.css` mirrors
  `basic-tool.css`'s existing hover/cursor treatment.

### Verification

`bun typecheck` (packages/app) exit 0 · `test:unit` (packages/app) 739 pass, unchanged (no
new files under `packages/app/src`) · `bun run test` (packages/session-ui) 90 pass, 0 fail
(83 baseline + 7 new) · `test:browser` 41 pass · `git diff --stat` confirms
`basic-tool.tsx`/`basic-tool-v2.tsx` untouched.

### Known gaps (accepted, not fixed)

- **No line targeting** — files open at the top; `read`'s offset/limit and `edit`'s range
  are ignored.
- **`patch`/`apply_patch` stay non-clickable**, including the single-file case: its
  filename comes from a different, already-relative field (`single()!.relativePath`) than
  `read`/`edit`/`write`'s `input.filePath`, and `file.load()`-compatibility was not
  confirmed — excluded rather than guessed at, despite the spec initially framing it as
  "one line-swap away."
- **`list` stays non-clickable.**
- **Manual verification (9 steps in the spec) not run** — needs a live app + project/session
  to drive, same environment gap as spec 002.

---

## [002] Side panel minimum width: 2026-09-13

Status: **Implemented** — automated checks pass; manual verification (incl. the tab-bar
floor measurement) pending · Base: `95daf90` · Spec:
[specs/002-side-panel-min-width.md](./specs/002-side-panel-min-width.md) · Plan:
[plans/002-side-panel-min-width.md](./plans/002-side-panel-min-width.md)

Lets the review/file side panel narrow past its old 480px (unified) / 800px (split) floor,
so the developer can trade side-panel width for chat-column width at any window size.

### Added (new files)

- `packages/app/src/pages/session/session-panel-width-floors.test.ts`: 6 tests pinning the
  lowered floors as literal values (280/560), so a silent revert or upstream model rework
  fails loudly instead of the feature quietly disappearing.
- `rewrites/plans/002-side-panel-min-width.md`.

### Changed (upstream edits, rebase-sensitive)

- `packages/app/src/pages/session/session-panel-width.ts` (+2/-2): `REVIEW_PANE_WIDTH_MIN`
  480 → 280, `REVIEW_PANE_WIDTH_MIN_SPLIT` 800 → 560. No other lines touched.

Total upstream footprint: **2 insertions, 2 deletions, 1 file.**

### Requirements delivered

- **R1** lowered reserved widths (280/560).
- **R2** floor stays usable (280 chosen by analogy to `FILE_TREE_WIDTH_MIN = 240`; not yet
  empirically confirmed against the tab bar — see Known gaps).
- **R3** split floor (560) stays strictly greater than unified (280), confirmed by test.
- **R4** no behavior change above the floor — existing `session-panel-width.test.ts` (8
  tests, relative assertions) passes unmodified.

### Verification

`bun typecheck` exit 0 · `test:unit` 739 pass (733 baseline + 6 new) · `test:browser` 41
pass · `session-panel-width.test.ts` 8 pass, file untouched · `git diff --stat` exactly
`1 file changed, 2 insertions(+), 2 deletions(-)`.

### Known gaps (accepted, not yet resolved)

- **Tab-bar floor measurement not performed.** The spec calls for confirming 280px against
  the review panel's tab bar (review tab, file tabs, `+`, Open-in-app) in a running app
  before treating 280 as final. This implementation pass had no way to drive the Electron
  app + backend headlessly in this environment; needs a manual pass (spec's manual step 5)
  before the spec is marked **Verified**.
- Floors remain hardcoded, not user-configurable (by design, see spec's Non-goals).

---

## [001] Markdown file preview: 2026-08-30

Status: **Verified** · Base: `38e10eb` · Spec: [specs/001-markdown-file-preview.md](./specs/001-markdown-file-preview.md)

**Commits:** 
- `6fc66b9` feat(app): render markdown files as formatted preview
- `b8e87f6` docs: rewrite principles for app customization + spec 001

Render markdown files as formatted markdown in the session file view, reusing the existing
`Markdown` component from `@opencode-ai/session-ui`, instead of showing raw source.

### Added (new files)

- `packages/app/src/pages/session/markdown-file-view.tsx`: component and per-tab view
  mode state; wraps the source viewer as a fallback.
- `packages/app/src/pages/session/markdown-file-view-policy.ts`: pure logic: markdown
  extension match (`.md`, `.markdown`, `.mdx`, `.mdc`) and the 100 KB preview size limit.
- `packages/app/src/pages/session/markdown-file-view-policy.test.ts`: 9 tests, no DOM.
- `rewrites/README.md`, `rewrites/docs/PRINCIPLES.md`, `rewrites/specs/001-markdown-file-preview.md`.

### Changed (upstream edits, rebase-sensitive)

- `packages/app/src/pages/session/file-tabs.tsx` (+13/-1): one import; `renderFile`
  renamed to `renderSource` with a new `renderFile` wrapper. No existing line re-indented
  (see P3).
- `packages/app/src/i18n/en.ts` (+3): keys `session.files.markdown.{preview,source,tooLarge}`.
- `packages/app/src/i18n/parity.test.ts` (+8/-1): `REWRITE_KEY_PREFIXES` allowlist so
  English-only rewrite keys pass locale parity (see P6).

Total upstream footprint: **24 insertions, 2 deletions across 3 files.**

### Requirements delivered

- **R1 render**: markdown files render formatted. Confirmed visually.
- **R2 toggle**: per-tab Source/Preview switch, defaults to preview, restores the full
  pierre viewer (line selection, gutter comments, comment-to-prompt-context, Ctrl+F).
- **R3 size guard**: files over 100 KB fall back to source with a notice, mitigating the
  absence of virtualization in the `Markdown` component.

### Verification

`bun typecheck` exit 0 · `test:unit` 727 pass · `test:browser` 41 pass · policy tests 9 pass ·
rewrite present in production bundle · packaged `opencode-desktop-win-x64.exe` (175.5 MB,
"OpenCode Dev" v1.18.15). R1 confirmed visually.

### Known gaps (accepted, not fixed)

- Relative image paths (`![](./x.png)`) and relative links (`[l](./other.md)`) resolve
  against the renderer URL, not the project directory.
- No editing in preview mode.

### Infrastructure notes

- Windows checks out git symlinks as text files (`core.symlinks=false`); the materialized
  `packages/app/src/custom-elements.d.ts` is hidden with `git update-index --skip-worktree`.
  See "Windows symlinks" in `README.md`.
- Project directory renamed `OpenCode` -> `myopencode` to match the fork name.
