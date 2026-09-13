# Upstream Sync Guidelines

How to safely update this fork with the latest changes from upstream OpenCode (`anomalyco/opencode`), based on the proven integration of base `95daf90`. 

Because this fork tracks upstream's `dev` branch—which has no release boundaries and moves fast—syncs must be deliberate, isolated, and rigorously verified before promotion.

---

## 1. Preparation

Never merge directly into your working `dev` branch. Isolate the sync so it can be verified or aborted without leaving your daily driver in a broken state.

```powershell
# 1. Ensure upstream is tracked
git remote add upstream https://github.com/anomalyco/opencode.git

# 2. Fetch the latest tags and history
git fetch upstream --tags

# 3. Create an integration branch from your current dev tip
git checkout -b integration/upstream dev
```

Identify your target commit. While you *can* merge the bleeding-edge `dev` tip, merging a recent stable release tag (e.g., `v1.18.30`) is highly recommended for a local daily driver.

## 2. The Merge

We prefer a **merge** (with `--no-ff`) over a rebase for upstream syncs to preserve the exact history of our custom commits without rewriting them, which avoids needing to force-push `dev`.

```powershell
git merge <target-sha-or-tag> --no-ff -m "merge: sync fork with upstream dev @ <sha>"
```

If you followed the principles in [PRINCIPLES.md](./PRINCIPLES.md) (new files, single edit sites, no re-indentation), this should result in **zero textual conflicts**.

## 3. Environment & Invariants

Upstream merges will likely touch `bun.lock` and structural files. Restore Windows-specific invariants before building.

1. **Windows Symlinks:** Windows checks out git symlinks as text files (`core.symlinks=false`), which breaks typechecking. Ensure the `skip-worktree` workaround on `packages/app/src/custom-elements.d.ts` survived the merge. (See [../README.md](../README.md)).
2. **Lockfile Churn:** If `bun.lock` shows as modified but only has LF/CRLF differences or removes orphaned tools not relevant to the build (like coverage tools pruned by Bun 1.4.0), you can safely restore it to keep the tree clean: `git checkout -- bun.lock`.
3. **Install Dependencies:**
   ```powershell
   bun install
   ```

## 4. Automated Verification

Do not trust a clean textual merge. Verify the semantic graph. From `packages/app`:

1. **Typecheck:** 
   *Note: AppLocker blocks the freshly-downloaded native `tsgo.exe` binary on Windows. Use the JS-based `tsc` fallback.*
   ```powershell
   node ../../node_modules/typescript/bin/tsc -b
   ```
2. **Unit Tests:**
   ```powershell
   bun run test:unit
   ```
   *(If you see a single failure, re-run it to rule out known flakiness before investigating).*
3. **Browser Tests:**
   ```powershell
   bun run test:browser
   ```
4. **Policy Tests:**
   Run any `-policy.test.ts` files created in your rewrites to ensure upstream changes didn't break your pure logic.

## 5. Repackage & Smoke Test

Ensure your build tooling still works against the new upstream baseline.

```powershell
# Run the automated portable build script
.\rewrites\scripts\build-portable.ps1
```

*Crucial check:* Ensure the script successfully runs `bun run build` (electron-vite) *before* `electron-builder`. Packaging without compiling assets will bundle stale, pre-merge code.

Launch the resulting `OpenCode Dev.exe` from the output directory and manually verify the core capabilities added by your rewrites (e.g., Markdown rendering and toggling).

## 6. Documentation & Promotion

Once the integration branch is fully verified:

1. **Update Specs:** Bump the `Upstream base` SHA in all active specs in [`../specs/`](../specs/) to the new target SHA.
2. **Update Inventory:** Update the Base Commit column in the [`../README.md`](../README.md) inventory table.
3. **Update Changelog:** Add a new entry to [`../CHANGELOG.md`](../CHANGELOG.md) explicitly recording the upstream sync. Include:
   - The commit range (e.g., `38e10eb -> 95daf90`)
   - Headline improvements gained from upstream
   - Any forced re-derivations or environmental workarounds required.
4. **Commit & Promote:**
   ```powershell
   git add rewrites/
   git commit -m "docs(rewrites): record upstream sync to <sha>"
   
   git checkout dev
   git merge integration/upstream --ff-only
   ```
