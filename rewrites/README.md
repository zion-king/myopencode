# Rewrites

Local modifications to OpenCode maintained in this fork (`zion-king/myopencode`).

## Why this exists

OpenCode is highly configurable, but its extension surface is **server-side only**:
plugins, custom tools, MCP servers, themes, keybinds, commands, and agents. There is
**no renderer/UI extension API** — no way to add, replace, or restyle a panel in the
desktop or web UI from configuration.

That means any UI change requires modifying the source. Hence this fork, and hence
this folder: a place to record *what* was changed, *why*, and *how to carry it forward*
across upstream updates.

Upstream is MIT licensed, so local modification is unrestricted. The cost is not legal,
it is **maintenance** — see the constraint below.

## The governing constraint: minimize diff surface

Upstream is extremely active (15k+ commits) and `packages/app` is mid-migration, with
v1/v2 component pairs throughout (`file-tree` / `file-tree-v2`, `review-panel-v2`,
`settings-v2`, `prompt-input-v2`). Every line we change in an upstream file is a line
that can conflict on every future rebase.

**Your maintenance cost is proportional to the number of upstream lines you touch, not to
the size of your feature.**

The full playbook — including the rename-don't-re-indent pattern that took rewrite 001
from `+62/-50` to `+13/-1`, the i18n policy, and a per-rewrite checklist — is in
**[PRINCIPLES.md](./PRINCIPLES.md)**. Read it before making a change.

## Layout

```
rewrites/
  README.md                 <- this file: index, inventory, environment, build, rebase runbook
  PRINCIPLES.md             <- how to make a change safely; read before editing upstream
  CHANGELOG.md              <- running record of every landed spec and rewrite update
  specs/
    NNN-slug.md             <- one spec per rewrite, numbered in order
```

Specs are numbered (`001-`, `002-`, ...) so ordering and dependencies are obvious.
Each spec records the exact upstream base commit it was written against, because a
moving base branch is only reproducible if the commit is written down.

## Rewrite inventory

| ID  | Title                 | Status | Upstream files touched                                                                 | Base commit |
| --- | --------------------- | ------ | -------------------------------------------------------------------------------------- | ----------- |
| 001 | Markdown file preview | Verified | `pages/session/file-tabs.tsx` (+13/-1), `i18n/en.ts` (+3), `i18n/parity.test.ts` (+8/-1) | `38e10eb`   |

Per-change detail, dates, and commits are in [CHANGELOG.md](./CHANGELOG.md).

## Environment

- **Runtime:** Bun 1.3+ (`winget install Oven-sh.Bun`). Node 24 is also present but the
  repo builds with Bun.
- **Install:** `bun install` at the repo root.
  - Known issue: a partially-failed install can poison Bun's cache and produce repeated
    `IntegrityCheckFailed` errors on the same packages. Fix with `bun pm cache rm`
    followed by a fresh `bun install`.
  - `bun.lock` may show as modified after an install due to `core.autocrlf=true`. If
    `git diff --numstat bun.lock` is empty, the change is line-endings only; restore with
    `git checkout -- bun.lock`.

### Windows symlinks

The repo contains 60 git symlinks (`mode 120000`). Without symlink privilege Windows git
sets `core.symlinks=false` and checks each one out as a **text file containing its target
path**. Most are assets and harmless, but one breaks typechecking:

```
packages/app/src/custom-elements.d.ts  ->  ../../ui/src/custom-elements.d.ts
```

Symptom: `bun typecheck` in `packages/app` fails with
`custom-elements.d.ts(1,1): error TS1128: Declaration or statement expected`.

Workaround applied locally (materialize the file, then hide it from git):

```
Copy-Item packages/ui/src/custom-elements.d.ts packages/app/src/custom-elements.d.ts -Force
git update-index --skip-worktree packages/app/src/custom-elements.d.ts
```

Proper fix: enable Windows Developer Mode (or run elevated), then
`git config core.symlinks true` and re-checkout. If you do that, undo the workaround with
`git update-index --no-skip-worktree packages/app/src/custom-elements.d.ts`.

The other two source symlinks (`packages/docs/openapi.json`,
`packages/enterprise/src/custom-elements.d.ts`) are not needed for app or desktop work.

### Verifying a change

```
cd packages/app
bun typecheck        # must exit 0
bun run test:unit    # 727 pass at base 38e10eb
bun run test:browser # 41 pass at base 38e10eb
```

The unit suite is occasionally flaky: one run out of seven reported a single failure that
did not reproduce across six consecutive clean runs of the same unmodified tree. Re-run
before investigating, and confirm the named test is actually related to your change.
Note that `test:unit` passes `--only-failures`, which suppresses per-test output on a
clean run; use `bun test --conditions=solid --preload ./happydom.ts ./src` to see names.

## Build and run

**Primary loop (UI work).** Fast, no Electron rebuild:

```
bun dev serve                          # API server, :4096
bun run --cwd packages/app dev         # Vite; :3000, falls forward if occupied
```

**Electron loop.** Slower; `predev` builds the node bundle and downloads the pinned
prebuilt Rust CLI sidecar from npm:

```
bun run --cwd packages/desktop dev     # renderer at :5173
```

The unpackaged dev build uses app id `ai.opencode.desktop.dev` and name `OpenCode Dev`,
so its `userData` (`%APPDATA%\ai.opencode.desktop.dev`) is **fully isolated** from an
installed OpenCode desktop app (`%APPDATA%\ai.opencode.desktop`). Running both is safe.

**Packaging:**

```
bun run --cwd packages/desktop build
bun run --cwd packages/desktop package:win
```

Notes:
- Local builds are **unsigned** (`script/sign-windows.ps1` is CI-only), so expect a
  SmartScreen prompt.
- Auto-update is already disabled for dev-channel builds:
  `UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev"` in
  `packages/desktop/src/main/constants.ts`. No change needed.
- The bundled **node/CLI** build derives a version from the branch name, so a branch
  containing `/` yields `0.0.0-rewrite/001-...`. This is cosmetic: `electron-builder.config.ts`
  sets no `version`, so the packaged app takes `version` from `packages/desktop/package.json`
  (valid semver). Packaging from a `/`-containing branch is verified working.
- The dev channel packages as **`OpenCode Dev`** with app id `ai.opencode.desktop.dev`, so
  installing it alongside an official `OpenCode` install is safe — separate executable,
  separate `userData`.

Verified output at base `38e10eb`:

```
packages/desktop/dist/opencode-desktop-win-x64.exe   175.5 MB   ProductName "OpenCode Dev"  v1.18.15
```

## Rebase runbook

This fork tracks upstream `dev`, which has no release boundaries. Sync deliberately,
not continuously.

```
git fetch upstream --tags
git rebase upstream/dev              # on the rewrite branch
```

After rebasing:

1. Re-read each spec's "Rebase notes" section for the code it depends on.
2. Re-run the verification steps in the spec. They are the regression suite.
3. Update the spec's base commit to the new upstream SHA.

If a rewrite's single edit site has moved or been deleted, that is a signal to re-derive
the change rather than force the old patch into place.
