# Plan: 003 — Clickable file cards in the chat timeline

Spec: [../specs/003-clickable-file-cards.md](../specs/003-clickable-file-cards.md)

## Verification against current tree

An independent Explore pass re-checked every line-numbered claim in the spec against the
current tree (fork HEAD, base still `95daf90`). All confirmed true, with one cosmetic drift:
`FileProvider` in `session.tsx` is now at lines 320-324 (spec said ~317-327) — same shape,
no material change. No claim needs correction before implementing.

## Summary

Wire the existing-but-unused `onSubtitleClick` affordance (and, for `edit`/`write`, a new
`ClickableFilename` element swap) so clicking a file name on a `read`/`edit`/`write` tool
card opens that file in the side panel in preview — reusing `previewTab`'s exact behavior
(`session-side-panel.tsx:206-213`: resolve tab → load file → open panel → activate tab).

The wire is a new optional context (`packages/session-ui/src/context/file-open.tsx`)
provided by `session.tsx` and consumed by `message-part.tsx`. It must not use
`createSimpleContext` (`packages/ui/src/context/helper.tsx:34` throws with no provider) —
confirmed there is no existing "optional, non-throwing" context helper anywhere in
`packages/ui` or `packages/session-ui` to reuse, so this plan builds a small one from a raw
`createContext` + `useContext` accessor, inline in the new file (no shared helper needed for
one context).

## Steps

1. **New policy module + tests** (P4).
   `packages/session-ui/src/components/tool-file-path-policy.ts`:
   ```ts
   export function openableFilePath(tool: string, input: Record<string, unknown>): string | undefined
   ```
   Returns `input.filePath` (as a string) for `tool === "read" | "edit" | "write"` (and,
   pending the decision in step 6, single-file `patch`), `undefined` otherwise — including
   when `filePath` is missing or not a string (malformed input).
   `tool-file-path-policy.test.ts`: cover read/edit/write, an excluded tool (e.g. `list`,
   `grep`, `bash`), and malformed input (`filePath` absent, wrong type, empty string).

2. **New optional context** — `packages/session-ui/src/context/file-open.tsx`:
   - Raw `createContext<((path: string) => void) | undefined>(undefined)` (SolidJS import,
     not `@opencode-ai/ui`'s `createSimpleContext`, since that throws with no provider — R4
     needs a non-throwing accessor).
   - Export the `Provider` and a `useFileOpenOptional()` that returns `useContext(ctx)`
     directly (possibly `undefined`) — every consumer must call this, never a throwing
     `.use()`.
   - Export from `packages/session-ui/src/context/index.ts` (`+1`, alongside the existing
     `export * from "./data"`).

3. **New `ClickableFilename` component** —
   `packages/session-ui/src/components/clickable-filename.tsx`:
   - Props: `path: string`, `children: JSX.Element` (the existing filename text).
   - Root element is a single `<span data-slot="message-part-title-filename">` — same tag,
     same slot, no wrapper (Design constraint 1: the flex/ellipsis CSS depends on this
     being the direct flex child).
   - Reads `useFileOpenOptional()`. If present: `classList={{ clickable: true }}`, `onClick`
     calls it with `path`, `role="button"`/`tabIndex` not required per spec (mirrors
     `basic-tool.tsx`'s plain click handling, no keyboard-nav claim there either — match
     that, don't add scope). If absent (R4): render the same `<span>` with no click
     handler and no `clickable` class — visually and behaviorally identical to today.

4. **New CSS** — `packages/session-ui/src/components/clickable-filename.css`:
   ```css
   [data-slot="message-part-title-filename"].clickable {
     cursor: pointer;
     text-decoration: underline;
     /* mirror basic-tool.css:119-127's hover transition exactly, so R5 holds */
   }
   ```
   Read `basic-tool.css:104-127` first and copy the transition/hover values verbatim rather
   than re-deriving them, so the two affordances are pixel-identical (R5). Register with
   `@import "../components/clickable-filename.css" layer(components);` in
   `packages/session-ui/src/styles/index.css` (`+1`, matching the existing per-file import
   convention confirmed there). Before adding it, quickly check whether a Tailwind-style
   utility class already available in this package (e.g. `cursor-pointer underline`) could
   replace the whole file per the spec's "confirm at implementation" note — only keep the
   CSS file if utilities aren't wired up for `session-ui` components.

5. **Upstream edit site 1 — `message-part.tsx`, `read` card** (~line 1794-1797, object
   trigger): add `onSubtitleClick={() => fileOpen?.(props.input.filePath)}` to the
   `BasicTool` call (or however the callback is threaded — see step 7). One added line.

6. **Upstream edit site 2 — `message-part.tsx`, `edit`/`write` only**:
   swap the bare span for `ClickableFilename` at each site:
   ```tsx
   // before
   <span data-slot="message-part-title-filename">{filename()}</span>
   // after
   <ClickableFilename path={props.input.filePath}>{filename()}</ClickableFilename>
   ```
   at line 2217 (`edit`) and 2284 (`write`). **`patch`'s single-file card (line 2466) is
   excluded**, not deferred: it renders `single()!.relativePath`, a field from a different
   data shape (`ToolFileAccordion`'s diff-file model, also used at :2395-2400 with
   `getDirectory`/`getFilename`/`FileIcon`) that is already treated as *relative*, whereas
   `read`/`edit`/`write`'s `filePath` is paired with `relativizeProjectPath(path, directory)`
   in the `read` card — implying it is project-root-relative-or-absolute and not
   pre-relativized. These are demonstrably different shapes; whether `relativePath` is
   directly `file.load()`-compatible the same way `filePath` is has not been confirmed and
   would need a runtime trace to settle. Do not wire `patch` on the assumption they match —
   revisit as a follow-up if verified later.
   Add the `ClickableFilename` import at the top of `message-part.tsx` (+1 line).

7. **Upstream edit site 3 — `session.tsx`**: mount the new context provider around the
   timeline. `previewTab` (`session-side-panel.tsx:206-213`) is a private `const` closed
   over that component's own locals (`tabs()`, `file`, `normalizeTab`, `openReviewPanel`) —
   it is not exported and cannot be called from `session.tsx`. This is not an open question:
   `session.tsx` already has its own equivalents of every primitive `previewTab` needs — its
   own `normalizeTab` (line 513), `openReviewPanel` (line 530), `tabs()`, and `file.load` —
   and already builds a sibling operation this exact way for `openReviewFile` (line 1156, via
   `createOpenReviewFile`). Build a local `previewFile` handler in `session.tsx` using its
   own existing bindings, following the same pattern as `openReviewFile`. This is normal
   same-shape sibling code, not a duplication to avoid.

8. **i18n** — only if a click target needs an accessible name. Default to none (the visible
   filename text already serves as the label per the existing subtitle-click precedent in
   `basic-tool.tsx`, which adds no `aria-label`). If one is added anyway, it goes in
   `packages/ui/src/i18n/en.ts` (confirmed as the catalogue backing `session-ui`, already a
   domain in `parity.test.ts`'s `domains` array) plus the shared `REWRITE_KEY_PREFIXES`
   allowlist — not the app's `en.ts`.

9. **Automated verification**. `packages/session-ui` has its own test setup
   (`"test": "bun test src --only-failures"`, no happydom preload, unlike `packages/app`),
   and `packages/app`'s `test:unit` (`bun test --conditions=solid --only-failures --preload
   ./happydom.ts ./src`) is scoped to `packages/app/src` and does not reach
   `packages/session-ui/src`. So `tool-file-path-policy.test.ts` runs via `bun run test`
   (or `bun test src`) **from `packages/session-ui`**, not through `packages/app`'s
   `test:unit`.
   - From `packages/session-ui`: `bun run test` — new policy tests pass, 0 fail
   - From `packages/app`: `bun typecheck` — exit 0 (covers both packages via the workspace
     project graph)
   - From `packages/app`: `bun run test:unit` — baseline pass count unchanged, 0 fail (this
     rewrite adds no files under `packages/app/src`)
   - From `packages/app`: `bun run test:browser` — 0 fail
   - `git diff --stat` — only `message-part.tsx`, `session.tsx`, `context/index.ts`,
     `styles/index.css` touched upstream; **`basic-tool.tsx` and `basic-tool-v2.tsx` must
     show zero diff** (P1/P5 check — the whole point is these already support this)

10. **Manual verification** — run all 9 steps listed in the spec's "Manual verification"
    section (click read/edit/write cards, confirm body-click still expands, confirm
    non-file tools unaffected, confirm `task`/`ToolErrorCard` untouched, confirm
    `data-slot` and truncation survive, confirm identical hover/cursor on read vs edit,
    confirm re-clicking doesn't accumulate tabs, confirm graceful no-provider render in
    Storybook). This needs the same live-app driving capability flagged as a gap in spec
    002's plan — no headless run path exists yet in this environment, so this step is a
    hand-off to a human tester, not something this pass can complete unattended.

11. **Update bookkeeping** — spec status, `rewrites/README.md` inventory row,
    `rewrites/CHANGELOG.md` entry, matching the 001/002 pattern; record whichever way the
    `patch` decision (step 6) landed.

## Deviations from the spec worth flagging to the reviewer

- Step 6 resolves the spec's open "decide at implementation" question on single-file
  `patch` by **excluding it**, contrary to the spec's framing that it's "one line-swap
  away." Re-reading the actual sites shows `patch`'s `single()!.relativePath` is a
  different field from a different data shape than `read`/`edit`/`write`'s `input.filePath`
  (the latter is paired with `relativizeProjectPath`, implying it is not pre-relativized;
  `relativePath` already is). Wiring it without confirming `file.load()`-compatibility risks
  a silently wrong path. Follow-up if this is verified later.
- Step 7's `previewTab`-reuse question is resolved, not left open: `previewTab` is private
  to `session-side-panel.tsx` and cannot be called from `session.tsx`. `session.tsx` builds
  its own `previewFile` handler from bindings it already has, exactly the way it already
  builds `openReviewFile` — normal sibling code, not a duplication P1-P4 would object to.

## Non-goals (carried from spec)

Line targeting, multi-file patch/apply_patch, whole-card click change, changes to
`basic-tool.tsx`/`basic-tool-v2.tsx`, external-IDE opening, upstreaming.

## Rollback

Remove the provider mount in `session.tsx`, the `onSubtitleClick` prop and `ClickableFilename`
usages in `message-part.tsx`, the `context/index.ts` export, and the `styles/index.css`
import; delete the four new files. Nothing else depends on them.

## Principles checklist (before calling this done)

- [ ] `git diff --stat` — `basic-tool.tsx`/`basic-tool-v2.tsx` show zero diff (P1, P5)
- [ ] Path-resolution logic isolated in `tool-file-path-policy.ts` with DOM-free tests (P4)
- [ ] `edit`/`write` (and decided `patch`) swap is element-for-element, no re-indenting (P3)
- [ ] i18n: no new keys unless an aria-label is actually added, and if so `ui/src/i18n/en.ts`
      + `REWRITE_KEY_PREFIXES` only (P6)
- [ ] `bun typecheck` exits 0, `test:unit` and `test:browser` green
- [ ] Spec/README/CHANGELOG updated; `patch`-inclusion decision recorded either way
