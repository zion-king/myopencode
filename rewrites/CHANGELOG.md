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
deliberately minimise upstream edits (see `PRINCIPLES.md`), each entry separates **new
files** (ours, conflict-free) from **upstream edits** (the rebase-sensitive surface).

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
- `rewrites/README.md`, `rewrites/PRINCIPLES.md`, `rewrites/specs/001-markdown-file-preview.md`.

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
