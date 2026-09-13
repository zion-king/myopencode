# Plan: 002 — Side panel minimum width

Spec: [../specs/002-side-panel-min-width.md](../specs/002-side-panel-min-width.md)

## Summary

Lower two constants in `packages/app/src/pages/session/session-panel-width.ts`
(`REVIEW_PANE_WIDTH_MIN` 480→280, `REVIEW_PANE_WIDTH_MIN_SPLIT` 800→560) and add a new,
additive test file that pins the new values. No other upstream code changes — the spec's
Design section establishes that `session.tsx` derives everything through
`sessionPanelWidthMax()` / `clampSessionPanelWidth()`, so lowering the inputs is sufficient.

Verified against the current tree before writing this plan:
- `session-panel-width.ts` (19 lines) and `session-panel-width.test.ts` (8 tests) match the
  spec's quoted contents exactly — no drift since the spec was written.
- `session.tsx` imports these helpers (only import site, line 83).
- `session-side-panel.tsx:297` `<aside>` still carries `min-w-0`.
- `session-review.css` (in `packages/session-ui/src/components/`, not `packages/app`) still
  the CSS file that sets `min-width: 0` on inner containers.

## Steps

1. **Edit constants** — `packages/app/src/pages/session/session-panel-width.ts`:
   `REVIEW_PANE_WIDTH_MIN = 280` (was 480), `REVIEW_PANE_WIDTH_MIN_SPLIT = 560` (was 800).
   Exactly `+2/-2`, no other lines touched (comment above stays accurate — it describes the
   model, not the numbers).

2. **New test file** — `packages/app/src/pages/session/session-panel-width-floors.test.ts`.
   Per spec: assert the literal new values and resulting maxima at representative widths
   (e.g. 1700 unified/split, plus the invariant `REVIEW_PANE_WIDTH_MIN_SPLIT >
   REVIEW_PANE_WIDTH_MIN`), so a silent revert to 480/800 fails loudly. Do not touch the
   existing `session-panel-width.test.ts` (must stay byte-identical — it's the "upstream
   arithmetic didn't change" contract check).

3. **Measure the 280px floor against the tab bar** (spec's "Open at implementation" item).
   Before finalizing, load the app, open review panel, resize to ~280px, and confirm the tab
   bar (review tab, file tabs, `+`, Open-in-app) doesn't overflow/clip. If it does, raise the
   floor to the measured width and update the spec + this plan with the real number instead
   of 280 — and re-derive `REVIEW_PANE_WIDTH_MIN_SPLIT` as `2 ×` that measured value rather
   than leaving it at 560, to preserve R3's invariant.

4. **Automated verification** (from `packages/app`):
   - `bun typecheck` — exit 0 (Windows symlink workaround per `rewrites/README.md` if needed)
   - `bun run test:unit` — baseline pass count, 0 fail, plus new floors tests
   - `session-panel-width.test.ts` — 8 pass, file diff empty
   - `session-panel-width-floors.test.ts` — all pass
   - `bun run test:browser` — 0 fail
   - `git diff --stat` — exactly `1 file changed, 2 insertions(+), 2 deletions(-)` for
     upstream files

5. **Manual verification** — run the 6 steps in the spec's "Manual verification" section
   (drag past old floor, split-mode floor, narrow-window chat floor holds, persistence
   across relaunch, tab bar operable at floor, file-tree-only panel unaffected).

6. **Update spec status** to `Verified` with actual results, add the inventory row to
   `rewrites/README.md` (mirroring the 001 row), and add an entry to `rewrites/CHANGELOG.md`
   for this landed spec, following P8/P7 bookkeeping.

## Non-goals (carried from spec)

No settings UI, no chat-column floor change, no v1 changes (single shared module, no v1/v2
split here), no upstreaming.

## Rollback

Restore 480/800, delete the new test file. Nothing else depends on either constant.

## Principles checklist (before calling this done)

- [ ] `git diff --stat` shows exactly 2/-2 in one upstream file (P1–P3)
- [ ] New assertions live only in the new test file (P4-style isolation, even though this
      rewrite has no separate policy module — the constants file already is one)
- [ ] No i18n keys needed (confirmed, no user-visible strings)
- [ ] No environment workaround committed (P10)
- [ ] Spec's "Open at implementation" question (280 vs measured tab-bar width) resolved and
      recorded
