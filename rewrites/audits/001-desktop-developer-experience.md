# 001: Desktop Developer Experience Audit & Scoped Rewrites

| Field | Value |
| --- | --- |
| Audit ID | 001 |
| Title | Desktop Developer Experience Audit & Scoped Rewrites |
| Date | 2026-09-02 (revised 2026-09-13) |
| Upstream Base | `38e10eb1408feb700021b8e8766fb0ab41bf84e2` (`dev`) |
| Release Near Base | `v1.18.15` |
| Focus | Desktop Application (`packages/desktop`, `packages/app`, `packages/session-ui`) |
| Competitive Baseline | Claude Code Desktop, Cursor Composer, Windsurf Cascade |
| Status | Revised & Prioritized |
| Draft | [drafts/001-desktop-developer-experience.md](./drafts/001-desktop-developer-experience.md) — original, unverified pass |

---

## 0. Revision Notes (2026-09-13)

This is a **revision pass** over the original audit (preserved verbatim in
[`drafts/001-desktop-developer-experience.md`](./drafts/001-desktop-developer-experience.md)), following the
process this directory now requires (see [README.md](./README.md)): draft first, verify every root-cause
claim against the actual tree, then revise before any item is speccable.

### Corrections made

Every "root cause" claim in the original ten items was checked against the current codebase. Two items
were substantially wrong — not diff-size-optimistic, but built on a **false premise**: the feature they
describe already exists.

- **Item 08 (Git Worktree Isolation) — corrected.** The original claimed OpenCode has "no automated
  lifecycle for creating, attaching, and tearing down git worktrees." False:
  `packages/core/src/git.ts` (~L855-923) already implements `Git.worktree.create/remove/list` (`git
  worktree add --detach`, `git worktree remove --force`, `git worktree list --porcelain`), and
  `new-session-workspace-controller.ts` + `packages/app/src/utils/worktree.ts` already wire worktree
  selection (`main` / `create` / a named branch) into new-session creation, with shipped, translated UI
  strings (`session.new.worktree.create`, `dialog.project.edit.worktree.startup`, sidebar multi-worktree
  toggle). Git worktree session isolation is a **shipped upstream feature**, not a gap. Rescoped below to
  the actual remaining delta.
- **Item 09 (Multi-Tab Terminal) — corrected.** The original claimed the terminal "provides a single
  terminal instance... lacks a tab bar." False: `terminal-panel-v2.tsx` already implements a full
  multi-tab terminal (`Tabs`/`Tabs.List`, `SortableTerminalTabV2` with drag-to-reorder via `@dnd-kit`, a
  "+" new-terminal action, one `pty` per tab). Rescoped below to the actual remaining delta: split-pane
  layout and a background-process monitor.
- **Item 03 (Subagent DAG) — corrected.** The original cited an `invoke_subagent` tool and `ConversationID`
  metadata as the wiring mechanism. Neither identifier exists anywhere in the repository. The real tool is
  `packages/opencode/src/tool/task.ts` (registered as `task`), and there is an agent `mode: "subagent"`
  concept, but no `ConversationID` field. Root cause (subagents flatten into linear chat bubbles) still
  holds; the proposed architecture is corrected to key off the `task` tool's actual output shape instead
  of an invented field.
- **Item 05 (Interactive Plan Mode) — corrected.** The original cited `session_input` with `followup:
  "steer" | "queue"` as a per-step checkpoint primitive. That setting is real (`context/settings.tsx`) but
  is a **global** behavior toggle for how any queued follow-up message is delivered while the agent is
  busy — it has nothing to do with plan steps or checkpoints. The `session-todo-dock.tsx` characterization
  (minimal done/total counter, no pause/rewind) is accurate; the proposed plan-checkpoint state machine
  needs to be designed against real primitives, which do not yet exist at any layer — this is a bigger
  lift than the original diff estimate implied.
- **Item 06 (Granular Hunk Staging) — path corrections, substance confirmed.** `review-panel-v2.tsx` is
  actually at `packages/app/src/pages/session/v2/review-panel-v2.tsx` (not directly under `session/`), and
  `session-revert-dock.tsx` is at `packages/app/src/pages/session/composer/session-revert-dock.tsx`. Both
  confirmed to only support whole-file/whole-session restore. Additionally: `session-diff.ts` already
  parses unified diffs into `hunks` with partial-hunk detection — the parsing groundwork exists; the gap
  is specifically the staging *actions* and UI, which narrows this item's scope favorably.
- **Item 04 (Open in External IDE)** — root cause confirmed accurate, with one nuance: `checkAppExists` in
  `apps.ts` only does real detection on macOS; on `win32`/`linux` it unconditionally returns `true`
  (no actual presence check). Worth folding into the eventual spec.
- **Items 01, 02, 07, 10** — verified accurate as originally written. Item 07's citation of
  `menu.ts:22` (`if (process.platform !== "darwin") return`) is an exact match, including the line number.

### On diff-size estimates

The original per-item "Diff: ~N lines" figures were not derived from any sketch of the edit site — they
cluster suspiciously close to rewrite 001's *actual measured* result (`+13/-1`) regardless of how much
bigger the proposed subsystem is (a system tray with cross-platform menus and actionable notifications is
not the same order of complexity as wrapping a render function). These numbers are left in the tables below
for continuity with the original scoping pass, but **should not be treated as commitments** — each will be
re-derived for real once a spec sketches the actual edit site, per [`docs/PRINCIPLES.md`](../docs/PRINCIPLES.md).

### On the structural gap vs. spec 001

An earlier pass flagged that these items lack spec-001-style Non-goals/Tradeoffs/Requirements sections.
That gap is by design: this is an **audit**, not a spec. Per the process below, each item gets that
treatment when it graduates to `rewrites/specs/NNN-*.md` — not here.

---

## 1. Executive Summary

OpenCode provides an extraordinarily capable backend engine: multi-turn agent execution, durable event-driven sessions (Session V2), extensible toolchains, MCP client support, and multi-model routing. However, the **desktop client layer** (`packages/desktop`, `packages/app`, `packages/session-ui`) currently operates primarily as a webview wrapper with several key DX frictions when compared to modern AI coding environments like **Claude Code Desktop**, **Cursor**, and **Windsurf** — and, separately, has a handful of concrete, immediately-felt UX friction points identified through direct daily use.

This audit analyzes the full desktop client surface and establishes the scoped rewrites and customizations required to elevate OpenCode Desktop's developer experience: ten items from a competitive-parity pass (§3), corrected against the current codebase in §0, plus three narrowly-scoped items from direct usage (§3a).

Each rewrite is scoped according to the fork's governing principle in [PRINCIPLES.md](../docs/PRINCIPLES.md): **minimize upstream diff surface** by isolating logic into new `-policy.ts` and component files while keeping upstream patch sites down to single-line invocation hooks.

---

## 2. Competitive DX Baseline & Audit Criteria

To evaluate developer friction and feature gaps, we evaluated OpenCode Desktop against Claude Code Desktop and modern AI IDEs across four core dimensions:

1. **Accessibility & Frictionless Summoning:** Can a developer prompt or query the AI instantly from anywhere without switching desktop workspaces or losing editor context?
2. **Context Transparency & Observability:** Does the developer have granular visibility into what is in the model's context window (token budget, prompt rules, memory, loaded files, MCP schemas)?
3. **External IDE & Tooling Integration:** Does the desktop app cleanly bridge into the developer's real workflow (VS Code / Cursor / Zed / JetBrains at exact lines, persistent multi-tab terminals, isolated git worktrees)?
4. **Interactive Review & Agent Steering:** Can the developer steer multi-step execution plans with checkpoints, review code with line-level hunk staging, and inspect parallel subagent trees in real time?

---

## 3. Scoped Rewrites & Customizations (Competitive Parity)

```
+---------------------------------------------------------------------------------------------------+
|                                DESKTOP DX REWRITE ROADMAP                                          |
+---------------------------------------------------------------------------------------------------+
| 1. Global Quick-Prompt HUD (Floating Spotlight Launcher & Global Hotkey)                          |
| 2. Live Context Window Inspector & Token Budget Breakdown                                         |
| 3. Subagent & Background Task Execution DAG / Tree Visualizer                                     |
| 4. Deep "Open in External IDE / Editor" Integration (VS Code, Cursor, Zed, JetBrains)             |
| 5. Interactive Plan Mode & Step-by-Step Checkpoint Steering                                       |
| 6. Granular Hunk Staging, Partial Diffs & Inline Diff Commenting                                  |
| 7. System Tray Controller & Desktop Background Task Engine with Actionable OS Notifications       |
| 8. Git Worktree Merge/Cleanup UX (rescoped — isolation itself already ships)                      |
| 9. Terminal Split Panes & Background Process Monitor (rescoped — tabs already ship)                |
| 10. Rich Artifact & Multi-Format Live Preview Sandbox (HTML, SVG, Mermaid, Sandboxes)             |
+---------------------------------------------------------------------------------------------------+
```

---

### Summary of Opportunities

| # | Rewrite Title | Problem & Competitive Gap vs Claude Code | Architectural Approach & Upstream Diff Surface |
| :---: | :--- | :--- | :--- |
| **01** | **Global Quick-Prompt HUD** | No way to summon OpenCode quickly from outside the app. Requires full window context switching. | Lightweight frameless overlay window (`hud-window.ts`) via global shortcut (`Ctrl+Shift+Space`) with quick answers and clipboard injection. **Diff: ~3 lines (unverified estimate — see §0).** |
| **02** | **Live Context Window Inspector** | No transparency into what fills the model's context window (system rules, files, MCP schemas, transcripts). | Segmented token capacity visualizer with itemized token weights, file pinning, and selective context eviction. **Diff: ~4 lines (unverified estimate — see §0).** |
| **03** | **Subagent Execution DAG / Tree** | Parallel subagent dispatch (the `task` tool) is flattened into message streams, obscuring hierarchy & state. | Visual node tree in the session dock displaying real-time status pills, duration, subagent output streams, and cancel actions, derived from `task` tool call/result pairs (not an invented `ConversationID` field). **Diff: ~6 lines (unverified estimate — see §0).** |
| **04** | **Deep "Open in External IDE"** | File & diff viewers cannot launch the user's primary IDE (VS Code, Cursor, Zed, JetBrains) at exact lines. `checkAppExists` only does real detection on macOS; win32/linux unconditionally report present. | Deep URI (`vscode://file/...:line:col`) and CLI fallback launcher in file tabs, code blocks, and review diffs. **Diff: ~10 lines (unverified estimate — see §0).** |
| **05** | **Interactive Plan & Checkpoint Steering** | Agent implementation plans are static markdown with no step-by-step interactive approvals. No existing primitive (client or server) exposes per-step checkpoint state — this is new state, not a wiring problem. | Interactive plan checklist dock with step pausing, single-step execution, and mid-plan prompt parameter editing. **Diff: ~5 lines (unverified estimate, likely low — see §0).** |
| **06** | **Granular Hunk Staging & Diff Comments** | Review panel (`v2/review-panel-v2.tsx` / `session-diff.ts`) operates at whole-file granularity; cannot stage/reject individual hunks or comment on diff lines. Hunk *parsing* already exists in `session-diff.ts` — the gap is staging actions and UI. | Granular hunk staging/rejection actions, side-by-side split view, and inline comments that feed into prompt context, built on the existing hunk parser. **Diff: ~10 lines (unverified estimate — see §0).** |
| **07** | **System Tray & Actionable OS Notifications** | Long-running tasks run invisibly when minimized; OS notifications are passive popups without action buttons. `menu.ts:22` confirmed: `if (process.platform !== "darwin") return`. | Electron System Tray with status badge & quick menu, cross-platform app menus, and OS notifications with "Approve" / "View Diff" buttons. **Diff: ~13 lines (unverified estimate — see §0).** |
| **08** | **Git Worktree Merge/Cleanup UX** *(rescoped)* | Worktree creation and session isolation **already ship** (`Git.worktree.create/remove/list` in `packages/core/src/git.ts`; worktree selection in `new-session-workspace-controller.ts`). The real remaining friction, if any, is post-session ergonomics: one-click merge-back and automatic worktree cleanup on session archive. | Needs a fresh, narrow root-cause pass on the *actual* gap (does session archive already call `Git.worktree.remove`? does anything expose "merge into main"?) before scoping further. **Diff: not yet estimable — original "~8 lines" assumed building the whole subsystem, which is wrong.** |
| **09** | **Terminal Split Panes & Process Monitor** *(rescoped)* | Multi-tab terminals **already ship** in `terminal-panel-v2.tsx` (`Tabs`, drag-reorder, per-tab `pty`). The real remaining gap is split-pane layout (view two terminals side by side) and a background-process registry/monitor (PID, CPU/RAM, kill/restart). | Split-pane container layered onto the existing tab system; a process-inspector drawer reading from the existing `pty`/background-task registry. **Diff: not yet estimable — original "~9 lines" assumed building tabs from scratch, which is wrong.** |
| **10** | **Rich Artifact & Preview Sandbox** | Following Rewrite 001 (Markdown file preview), OpenCode still renders HTML prototypes, SVG vectors, Mermaid charts, and web component mockups as raw text in the file tab view. (Chat-message Mermaid code blocks are already recognized as a distinct kind in `markdown-inline-code-kind.ts`; the file-tab preview path is not.) | Sandboxed iframe previewer, interactive SVG pan/zoom, Mermaid diagram visualizer, and data table inspector. **Diff: ~5 lines (unverified estimate — see §0).** |

---

### Rewrite 01: Global Quick-Prompt HUD (Floating Spotlight Launcher & Global Hotkey)

#### Problem
OpenCode Desktop currently only exists as standard heavy OS windows. To ask a quick question, query a codebase function, or paste a stack trace, developers must Alt+Tab away from their active editor/browser, locate the OpenCode window, click to focus, create or select a session, and type. This introduces friction for fast, high-frequency queries.

#### Competitive Benchmark
- **Claude Code CLI / Desktop:** Quick global summon shortcut (`Ctrl+Shift+Space` / `Cmd+Shift+K`) and instant terminal/floating launcher.
- **Raycast / Cursor Composer Floating Bar:** Lightweight, center-screen spotlight overlay that accepts natural language, captures clipboard context on demand, streams responses directly, and lets the user press `Enter` to pop out into a full session or `Esc` to dismiss.

#### Root Cause in OpenCode
`packages/desktop/src/main/index.ts` only instantiates standard `BrowserWindow` instances via `windows.ts`. There is no `globalShortcut` registration and no lightweight frameless overlay window renderer. **Verified:** `grep -r "globalShortcut" packages/desktop/src` returns zero hits.

#### Proposed Solution & Architecture
1. Introduce a dedicated HUD main-process controller: `packages/desktop/src/main/hud-window.ts`.
2. Register a customizable global shortcut (default: `Ctrl+Shift+Space` / `Cmd+Shift+Space`).
3. Render a lightweight, frameless, semi-transparent SolidJS view: `packages/app/src/pages/hud/hud-view.tsx` with minimal bundle overhead.
4. Provide instant answers, clipboard injection, and a "Promote to Full Session" shortcut (`Cmd+Enter`).

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/desktop/src/main/hud-window.ts` (~90 lines)
  - `packages/desktop/src/main/hud-policy.ts` (~40 lines)
  - `packages/app/src/pages/hud/hud-view.tsx` (~120 lines)
  - `packages/app/src/pages/hud/hud-policy.ts` (~50 lines)
- **Upstream Hook:** `packages/desktop/src/main/index.ts` (+3 lines to initialize HUD controller).
- **Estimated Upstream Diff:** `+3 / -0` lines (unverified — see §0).

---

### Rewrite 02: Live Context Window Inspector & Token Budget Breakdown

#### Problem
Developers have no real-time transparency into what constitutes the LLM's active context window. When sessions slow down or hit context limits, it is impossible to see whether tokens are consumed by bloated system prompts, redundant `AGENTS.md` files, giant tool definitions (MCP schemas), long conversation transcripts, or file content caches.

#### Competitive Benchmark
- **Claude Code:** `/context` command itemizing token usage by category (System, Messages, Tools, Git Diff, Files).
- **Cursor / Windsurf:** Visual context meter showing percentage usage of the model limit, with one-click pinning and eviction of specific files.

#### Root Cause in OpenCode
`packages/core/src/system-context/` exists (`index.ts`, `builtins.ts`, `registry.ts`) with real `SystemContext` machinery, and `packages/app/src/pages/session/composer/session-composer-controls.ts` exists — but no context-budget/token-inspector UI was found under `composer/`. Only aggregate message token metrics are shown or hidden.

#### Proposed Solution & Architecture
1. Build a pure context analyzer policy: `packages/app/src/pages/session/context-inspector/context-inspector-policy.ts`.
2. Implement an interactive popover/drawer: `packages/app/src/pages/session/context-inspector/context-inspector.tsx`.
3. Display a segmented progress bar of current token usage vs model capacity (e.g., 68k / 200k tokens).
4. Provide collapsible sections:
   - System Prompt & Active Rules (`AGENTS.md`, custom instructions)
   - Loaded Files & Attachments (with token weights and "Evict from Context" buttons)
   - Tool & MCP Server Schemas
   - Session Message History
   - Git Status & Diffs

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/app/src/pages/session/context-inspector/context-inspector.tsx` (~160 lines)
  - `packages/app/src/pages/session/context-inspector/context-inspector-policy.ts` (~75 lines)
  - `packages/app/src/pages/session/context-inspector/context-inspector-policy.test.ts` (~60 lines)
- **Upstream Hook:** `packages/app/src/pages/session/composer/session-composer-controls.ts` (+4 lines to mount Context Button).
- **Estimated Upstream Diff:** `+4 / -0` lines (unverified — see §0).

---

### Rewrite 03: Subagent & Background Task Execution DAG / Tree Visualizer

#### Problem
OpenCode V2 supports parallel subagent dispatch via the `task` tool (`packages/opencode/src/tool/task.ts`), but the desktop UI displays subagent activity either as flattened sequential chat bubbles or buried in background task logs. When an agent dispatches multiple parallel subagents (e.g. codebase research, test runner, documentation analyzer), tracking their concurrent lifecycles, execution hierarchy, intermediate artifacts, and token consumption is confusing.

#### Competitive Benchmark
- **Claude Code Multi-Agent / Devin / AutoGen Studio:** Hierarchical DAG / execution tree displaying active agents, parent-child task relationships, live status pills (running, waiting, completed, failed), and step-by-step trace inspection.

#### Root Cause in OpenCode
Session messages are rendered by `MessageTimeline` in `packages/app/src/pages/session/timeline/` (`message-timeline.tsx`), which sorts items linearly by timestamp. There is no dedicated hierarchical representation for subagent dispatch. **Correction:** the original version of this item cited an `invoke_subagent` tool and `ConversationID` metadata field as the wiring mechanism — neither exists anywhere in the repository (verified by full-text search). The actual mechanism is the `task` tool; parent-child structure will need to be derived from `task` tool-call/result message pairs and the agent's `mode: "subagent"` concept, not from an invented metadata field. This changes the design of the policy module below and should be treated as open design work, not settled plumbing.

#### Proposed Solution & Architecture
1. Create a pure subagent tree policy: `packages/app/src/pages/session/composer/subagent-tree-policy.ts` that builds a parent-child execution graph from `task` tool call/result pairs (exact linkage mechanism to be determined during spec — see correction above).
2. Build a live Subagent Tree Dock component: `packages/app/src/pages/session/composer/session-subagent-tree.tsx` placed alongside the composer dock.
3. Allow developers to expand/collapse individual subagent branches, view real-time streaming thoughts/tools for each subagent, and cancel individual subagent fibers.

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/app/src/pages/session/composer/session-subagent-tree.tsx` (~190 lines)
  - `packages/app/src/pages/session/composer/subagent-tree-policy.ts` (~85 lines)
  - `packages/app/src/pages/session/composer/subagent-tree-policy.test.ts` (~70 lines)
- **Upstream Hook:** `packages/app/src/pages/session/composer/session-composer-region.tsx` (+6 lines to mount subagent dock).
- **Estimated Upstream Diff:** `+6 / -1` lines (unverified — see §0).

---

### Rewrite 04: Deep "Open in External IDE / Editor" Integration (VS Code, Cursor, Zed, JetBrains)

#### Problem
Developers reviewing code, diffs, or generated files in OpenCode Desktop frequently need to jump into their primary IDE to run debugger breakpoints, use language servers, or apply manual edits. Currently, there is no direct one-click button to jump to the exact file, line, and column in external editors.

#### Competitive Benchmark
- **Claude Code:** Integrated `/open` commands and deep editor links.
- **GitHub Copilot & Cursor:** Seamless deep linking into editors via native URI schemes (`vscode://file/...`, `cursor://file/...`, `zed://file/...`) and CLI fallbacks (`code -g`, `cursor -g`, `zed`).

#### Root Cause in OpenCode
`packages/desktop/src/main/apps.ts` has `checkAppExists` (confirmed, line 13) — but it is thinner than the original write-up implied: on `win32` and `linux` it unconditionally `return true` with no real presence check; only the macOS branch (`checkMacosApp`) does real `/Applications` + `which` detection. `file-tabs.tsx` and `review-tab.tsx` lack UI buttons to trigger external editor opening (confirmed), and no `vscode://`/URI-scheme code exists anywhere in the repo.

#### Proposed Solution & Architecture
1. Implement pure URI and CLI generator policy: `packages/app/src/utils/external-editor-policy.ts` (handles VS Code, Cursor, Zed, WebStorm, IntelliJ, PyCharm, Sublime).
2. Add IPC handler in desktop main process: `packages/desktop/src/main/external-editor.ts` supporting both URI schemes and fallback CLI launchers, with real presence detection on win32/linux (not the current always-`true` stub).
3. Add an "Open in [Editor]" action button in:
   - File tab toolbar (`file-tabs.tsx`)
   - Code block headers in markdown (`packages/session-ui/src/components/markdown.tsx`)
   - Review panel file headers (`review-tab.tsx`)
4. Add default editor configuration in Settings V2 Appearance/General tab.

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/desktop/src/main/external-editor.ts` (~80 lines)
  - `packages/app/src/utils/external-editor-policy.ts` (~95 lines)
  - `packages/app/src/utils/external-editor-policy.test.ts` (~80 lines)
  - `packages/app/src/components/external-editor-button.tsx` (~45 lines)
- **Upstream Hooks:**
  - `packages/desktop/src/main/ipc.ts` (+4 lines to register IPC)
  - `packages/app/src/pages/session/file-tabs.tsx` (+3 lines)
  - `packages/app/src/pages/session/review-tab.tsx` (+3 lines)
- **Estimated Upstream Diff:** `+10 / -0` lines (unverified — see §0).

---

### Rewrite 05: Interactive Plan Mode & Step-by-Step Checkpoint Steering

#### Problem
When an agent creates an implementation plan (e.g. in `implementation_plan.md` or structured plan artifacts), the plan is static text. If a developer wants the agent to skip step 2, pause after step 3, or edit the parameters of step 4, they have to manually write follow-up steering prompts.

#### Competitive Benchmark
- **Claude Code Plan Mode (`/plan`):** Step-by-step interactive approvals, milestone checkpoints, and mid-plan prompt insertion.
- **Cursor Composer Agent:** Interactive checklist nodes that can be toggled, re-run, or resumed from specific checkpoints.

#### Root Cause in OpenCode
`session-todo-dock.tsx` (`packages/app/src/pages/session/composer/session-todo-dock.tsx`) is confirmed minimal: a done/total progress counter and a pointer to the current todo, with no checkpoint/pause/rewind logic. **Correction:** the original cited `session_input` with `followup: "steer" | "queue"` as the underlying mechanism for step control. That setting is real (`context/settings.tsx`), but it is a **global** preference for how any queued follow-up message is delivered while the agent is busy — unrelated to plan steps. There is no existing client- or server-side primitive for per-step checkpoints; this item requires new state end-to-end, not just new UI wired to an existing signal.

#### Proposed Solution & Architecture
1. Create a pure plan parser and checkpoint state machine: `packages/app/src/pages/session/composer/plan-checkpoint-policy.ts`.
2. Build an Interactive Plan Dock: `packages/app/src/pages/session/composer/session-plan-dock.tsx`.
3. Support interactive controls:
   - Checkbox toggle for completed / pending steps
   - "Execute next step only"
   - "Pause before step N"
   - "Inject custom instruction at step N"
   - "Rewind execution to step N checkpoint"

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/app/src/pages/session/composer/session-plan-dock.tsx` (~170 lines)
  - `packages/app/src/pages/session/composer/plan-checkpoint-policy.ts` (~110 lines)
  - `packages/app/src/pages/session/composer/plan-checkpoint-policy.test.ts` (~85 lines)
- **Upstream Hook:** `packages/app/src/pages/session/composer/session-composer-region.tsx` (+5 lines).
- **Estimated Upstream Diff:** `+5 / -1` lines (unverified, and likely optimistic given no existing checkpoint primitive — see §0).

---

### Rewrite 06: Granular Hunk Staging, Partial Diffs & Inline Diff Commenting

#### Problem
The review panel (`packages/app/src/pages/session/v2/review-panel-v2.tsx` / `packages/session-ui/src/components/session-diff.ts`) treats file changes as monolithic units for staging purposes. A developer can accept or reject an entire file's changes, but cannot stage hunk #1 and reject hunk #2. Furthermore, developers cannot click a specific line on a modified diff to add an inline review comment that directly feeds into the agent's next steer prompt.

#### Competitive Benchmark
- **Claude Code Diff Review:** Interactive hunk-by-hunk review with `y` (accept), `n` (reject), `e` (edit), `c` (comment).
- **GitHub PR Review & Cursor:** Side-by-side split diffs, granular hunk staging, and inline line commenting.

#### Root Cause in OpenCode
The Pierre file component (`packages/session-ui/src/components/file.tsx`) renders diffs. `session-diff.ts` already parses unified diffs into `hunks` with partial-hunk detection (confirmed, ~L80-131) — so hunk-level parsing is not the gap. The gap is that the parent review controller only dispatches whole-file revert/apply actions: `session-revert-dock.tsx` (confirmed at `packages/app/src/pages/session/composer/session-revert-dock.tsx`, not directly under `session/`) exposes only a whole-file/whole-session "restore" action, with no hunk concept.

#### Proposed Solution & Architecture
1. Extract hunk-selection and partial-patch-application logic into a pure policy: `packages/session-ui/src/components/diff-hunk-policy.ts`, building on the existing hunk parser in `session-diff.ts` rather than re-deriving it.
2. Add a Hunk Actions overlay component: `packages/session-ui/src/components/diff-hunk-actions.tsx` providing:
   - "Accept Hunk" / "Reject Hunk"
   - "Comment & Steer Agent on this Hunk"
   - Side-by-Side (Split) vs Unified Diff toggle
3. Wire the comment trigger into `prompt.context.add({ type: "diff-hunk", path, hunk, comment })`.

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/session-ui/src/components/diff-hunk-actions.tsx` (~140 lines)
  - `packages/session-ui/src/components/diff-hunk-policy.ts` (~115 lines)
  - `packages/session-ui/src/components/diff-hunk-policy.test.ts` (~90 lines)
- **Upstream Hooks:**
  - `packages/app/src/pages/session/review-tab.tsx` (+6 lines)
  - `packages/session-ui/src/components/session-diff.ts` (+4 lines)
- **Estimated Upstream Diff:** `+10 / -2` lines (unverified — see §0).

---

### Rewrite 07: System Tray Controller & Desktop Background Task Engine with Actionable OS Notifications

#### Problem
When OpenCode Desktop executes long operations (large test suites, multi-step subagents, complex refactors), minimizing the window leaves the developer with no visual progress indicator. In addition:
- `packages/desktop/src/main/menu.ts:22` explicitly disables native menus on Windows and Linux (`if (process.platform !== "darwin") return`) — **verified exact match, including line number.**
- Notifications in `packages/app/src/context/notification.tsx` are passive web popups without actionable response buttons — **verified: only `TurnCompleteNotification` and `ErrorNotification` are modeled, no action-button concept.**

#### Competitive Benchmark
- **Claude Code Desktop:** Background daemon with system tray icon showing agent activity state, and native OS notifications with action buttons (e.g. "Approve Shell Command", "View Diff", "Dismiss").

#### Root Cause in OpenCode
Electron `Tray` and native notification action listeners are completely unhandled in `packages/desktop/src/main/` (confirmed: no `Tray` usage anywhere in the directory).

#### Proposed Solution & Architecture
1. Create a dedicated System Tray controller: `packages/desktop/src/main/tray.ts`.
2. Implement tray icon status badges (Idle, Thinking, Awaiting Permission, Completed, Error) with a native quick-action menu (Active Sessions, Abort All, Open Recent).
3. Implement actionable native notifications: `packages/desktop/src/main/notification-actions.ts` allowing developers to approve tool executions or open specific diffs directly from Windows Action Center / macOS Notification Center.
4. Provide cross-platform application menus for Windows and Linux.

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/desktop/src/main/tray.ts` (~130 lines)
  - `packages/desktop/src/main/tray-policy.ts` (~60 lines)
  - `packages/desktop/src/main/notification-actions.ts` (~90 lines)
- **Upstream Hooks:**
  - `packages/desktop/src/main/index.ts` (+5 lines to initialize Tray and notification handlers)
  - `packages/desktop/src/main/menu.ts` (+8 lines for Windows/Linux menu template)
- **Estimated Upstream Diff:** `+13 / -3` lines (unverified — see §0).

---

### Rewrite 08: Git Worktree Merge/Cleanup UX (rescoped)

#### Problem — corrected
The original framing ("all sessions operate on the same working copy; no automated worktree lifecycle exists") is **false**. Verified in the codebase:
- `packages/core/src/git.ts` (~L855-923) implements a complete `Git.worktree` service — `worktreeCreate` (`git worktree add --detach <dir> HEAD`), `worktreeRemove` (`git worktree remove --force`), `worktreeList` (`git worktree list --porcelain`).
- `packages/app/src/pages/new-session/new-session-workspace-controller.ts` already resolves a worktree selection (`"main"` / `"create"` / a named branch) as part of new-session creation.
- `packages/app/src/utils/worktree.ts` tracks per-directory worktree readiness state (pending/ready/failed) client-side.
- Shipped, translated UI strings exist: `session.new.worktree.create` ("Create new worktree"), `session.new.worktree.main`, `dialog.project.edit.worktree.startup` (workspace startup script run after creating a worktree), and a sidebar toggle for showing multiple worktrees (`toast.workspace.enabled/disabled`).

Git worktree session isolation is a real, shipped, first-class OpenCode feature today. There is no rewrite to do here at the level the original item described.

#### What might still be missing (needs its own root-cause pass before scoping)
- Does anything call `Git.worktree.remove` automatically when a worktree-backed session is archived, or does the worktree leak until manually cleaned up?
- Is there a "merge this worktree's branch into main" or "open a PR from this worktree" action anywhere in the UI, or does the user have to drop to a terminal for that?
- Is worktree creation exposed anywhere in the sidebar/project settings beyond new-session time (e.g., converting an existing session to a worktree after the fact)?

#### Proposed Solution & Architecture
Not scoped yet — **do not carry forward the original architecture** (`packages/core/src/workspace/worktree-manager.ts`, `worktree-policy.ts`, a new `worktree-switcher.tsx`), since it would duplicate the existing `Git.worktree` service and `worktree.ts` state tracker. Once the three questions above are answered, scope narrowly against whichever answer is "no."

#### Upstream Diff & File Surface
Not yet estimable. The original `+8/-0` line estimate assumed building the whole subsystem from nothing, which is the wrong premise entirely — the real number depends on what the follow-up investigation finds is actually missing, and could plausibly be smaller (wiring an existing `Git.worktree.remove` call into session-archive) or require new UI (a merge-back action) depending on the answer.

---

### Rewrite 09: Terminal Split Panes & Background Process Monitor (rescoped)

#### Problem — corrected
The original framing ("single terminal instance... lacks a tab bar") is **false**. Verified in the codebase: `packages/app/src/pages/session/terminal-panel-v2.tsx` already implements a full multi-tab terminal system — `Tabs`/`Tabs.List` from `@opencode-ai/ui/tabs`, `SortableTerminalTabV2` with drag-and-drop reordering (`@dnd-kit`), a "+" new-terminal button wired to `terminal.new({ focus: true })`, and one `pty` per tab via a `terminal` context (`useTerminal`).

The genuinely missing pieces, confirmed absent from `terminal-panel-v2.tsx`:
- **Split-pane layout** — no way to view two terminals side by side or stacked; tabs are mutually exclusive.
- **Background-process monitor** — no PID/CPU/RAM view, no kill/restart action for detached background jobs.

#### Competitive Benchmark
- **Claude Code / VS Code Integrated Terminal:** Multi-tab multiplexing (OpenCode already has this), plus horizontal/vertical terminal split panes, and a background process manager.

#### Proposed Solution & Architecture
1. Layer a split-pane container onto the existing tab system rather than replacing it: `packages/app/src/pages/session/terminal/terminal-split-layout.ts` (pure layout policy — which tabs occupy which pane).
2. Extend `terminal-panel-v2.tsx` with a split-toggle action that renders two (or more) tab groups side by side, reusing the existing per-tab `pty` plumbing unchanged.
3. Build a process-inspector drawer: `packages/app/src/pages/session/terminal/process-inspector.tsx`, sourced from whatever background-task/process registry the server already exposes (needs a lookup — if none exists server-side, this item's server dependency needs its own scoping pass before a client-only spec can be written).

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/app/src/pages/session/terminal/terminal-split-layout.ts` (~70 lines, policy + tests)
  - `packages/app/src/pages/session/terminal/process-inspector.tsx` (~90 lines)
- **Upstream Hook:** `packages/app/src/pages/session/terminal-panel-v2.tsx` (wrapping the existing tab bar with a split container, following P3 rename-don't-reindent).
- **Estimated Upstream Diff:** not yet estimable with confidence — smaller than the original `+9/-2` in scope (no tab system to build), but the process-monitor half depends on an unconfirmed server-side data source.

---

### Rewrite 10: Rich Artifact & Multi-Format Live Preview Sandbox (HTML, SVG, Mermaid, Sandboxes)

#### Problem
Following Rewrite 001 (Markdown file preview), OpenCode still renders HTML prototypes, SVG vectors, Mermaid charts, and React/Solid web component mockups as raw text in the session file-tab view. Developers must open external web browsers or preview tools to see visual outputs generated by the agent. (Note: chat-message code blocks already recognize `"mermaid"` as a distinct kind in `packages/session-ui/src/components/markdown-inline-code-kind.ts` — this item is specifically about the file-tab preview path, which has no equivalent.)

#### Competitive Benchmark
- **Claude Artifacts / v0 / ChatGPT Canvas:** Live interactive sandboxed iframe rendering for HTML/CSS/JS, interactive pan/zoom SVG visualizer, rendered Mermaid diagrams, and formatted JSON/CSV data table viewers.

#### Root Cause in OpenCode
`packages/session-ui/src/components/file.tsx` and `packages/app/src/pages/session/file-tabs.tsx` only branch to Markdown (via Rewrite 001) or the Pierre syntax highlighter. There is no pluggable preview dispatcher for rich MIME types and artifacts in the file-tab path.

#### Proposed Solution & Architecture
1. Create a pluggable Artifact Preview Policy: `packages/session-ui/src/components/preview/artifact-preview-policy.ts` supporting `.html`, `.svg`, `.mermaid`, `.csv`, `.json`.
2. Build sandboxed renderers:
   - Sandboxed iframe with DOMPurify & security CSP: `packages/session-ui/src/components/preview/sandbox-iframe.tsx`
   - Interactive SVG viewer with pan/zoom: `packages/session-ui/src/components/preview/svg-viewer.tsx`
   - Mermaid diagram renderer: `packages/session-ui/src/components/preview/mermaid-viewer.tsx`
3. Plug into `file-tabs.tsx` using the exact rename-don't-reindent pattern proven in Rewrite 001.

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/session-ui/src/components/preview/artifact-preview.tsx` (~160 lines)
  - `packages/session-ui/src/components/preview/artifact-preview-policy.ts` (~80 lines)
  - `packages/session-ui/src/components/preview/sandbox-iframe.tsx` (~110 lines)
  - `packages/session-ui/src/components/preview/mermaid-viewer.tsx` (~90 lines)
- **Upstream Hook:** `packages/app/src/pages/session/file-tabs.tsx` (+5 lines in `SessionFileViewV2`).
- **Estimated Upstream Diff:** `+5 / -1` lines (unverified — see §0).

---

## 3a. Additional Scoped Customizations (Direct Usage)

Unlike §3, these three items come from direct daily use of the app rather than competitive benchmarking. All
three are narrow, single-surface UI/state fixes in the existing v2 layout — closer in shape to rewrite 001
than to §3's larger items — and each root cause below is traced to an exact line, not inferred.

### Rewrite 11: Open the Side Panel on New-Session Screens

#### Problem
On the new-session screen (no session created yet), there is no way to open the file tree or review panel
to inspect project files before sending the first message. The developer has to send a message (creating a
session) just to be able to browse the project.

#### Root Cause in OpenCode
Two independent gates conspire to hide the panel specifically pre-session, in the v2 layout
(`settings.general.newLayoutDesigns()`):

1. `packages/app/src/pages/session/session-side-panel.tsx:291` —
   `<Show when={isDesktop() && !(settings.general.newLayoutDesigns() && !params.id)}>` — the entire
   `SessionSidePanel` is unmounted whenever new-layout-designs is on and no session id exists yet.
2. `packages/app/src/pages/session.tsx:451` —
   `const desktopV2ReviewOpen = createMemo(() => newSessionDesign() && desktopReviewOpen() && !!params.id)`
   — even if a user could reach the toggle, this memo hard-requires `params.id`, so the panel stays closed
   regardless of toggle state pre-session.
3. The only visible toggle in this state, `SessionHeaderV2Actions` (`packages/app/src/components/session/session-header.tsx:510-568`),
   renders a single "review" icon button (`sidebar-right`) gated on `reviewVisible: isDesktop()` — it calls
   `view().reviewPanel.toggle()`, which is a no-op in effect because of gate 2 above. There is also no
   separate file-tree-only toggle in the v2 actions bar (unlike the v1 fallback branch in the same file,
   which has both a review button and a file-tree button).

So this isn't a missing feature so much as an existing toggle that is silently defeated by a `!!params.id`
guard once new-layout-designs is active.

#### Proposed Solution & Architecture
1. Relax the `!!params.id` requirement in `desktopV2ReviewOpen` (`session.tsx:451`) so the panel can open
   pre-session — the panel itself (`SessionSidePanel`) already tolerates an unset `params.id` in its file
   browser tab (it operates on `sdk().directory` / `projectDirectory`, not session state), so this looks
   like a leftover guard rather than a load-bearing one. Verify in the spec whether any nested state assumes
   a session exists (e.g., `reviewDiffs`/`canReview`) and gate only those, not panel visibility itself.
2. Adjust the `Show` gate in `session-side-panel.tsx:291` to match (drop the `&& !params.id` clause, keeping
   the `isDesktop()` check).
3. Add a file-tree toggle to `SessionHeaderV2Actions` alongside the existing review toggle, mirroring the
   v1 fallback branch's pair of buttons, so a user can open the file browser specifically (not just review)
   before a session exists.
4. Extract the "is the toggle usable pre-session" predicate into a small `-policy.ts` module so it's
   unit-testable without mounting `session.tsx`.

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/app/src/pages/session/session-panel-visibility-policy.ts` (new — the pre-session-visibility predicate + tests, ~30 lines + tests)
- **Upstream Hooks:**
  - `packages/app/src/pages/session.tsx` (~L451, ~L2304-2322 — relax the `params.id` gate; likely +3/-2)
  - `packages/app/src/pages/session/session-side-panel.tsx` (~L291 — drop one clause from the `Show` condition; +1/-1)
  - `packages/app/src/components/session/session-header.tsx` (~L510-568 — add a file-tree toggle button to `SessionHeaderV2Actions`; +10/-1)
- **Estimated Upstream Diff:** `+14/-4` (rough, pending a spec-time sketch; smaller in scope than any §3 item — no new subsystem, only gate/wiring changes).

---

### Rewrite 12: Lower the Side-Panel Minimum Width

#### Problem
The side panel (review/file-tree) cannot be shrunk below a fixed floor regardless of window size, so on
smaller windows there's no way to reclaim that space for the chat/composer column even when the developer
doesn't need the side panel to be wide right now.

#### Root Cause in OpenCode
`packages/app/src/pages/session/session-panel-width.ts` hardcodes:
```ts
export const SESSION_PANEL_WIDTH_MIN = 450        // floor for the chat/session column
export const REVIEW_PANE_WIDTH_MIN = 480          // floor the side panel reserves, unified diff
export const REVIEW_PANE_WIDTH_MIN_SPLIT = 800    // floor the side panel reserves, split diff
```
`sessionPanelWidthMax` (same file) computes the chat column's max width as `available - <one of the two
floors above>` — meaning the side panel's width is *derived*, never directly resized, and can never drop
below 480px (or 800px in split-diff mode) no matter how narrow the window or how little the developer needs
from it right now. The only directly-draggable handle affecting this is the chat-column `ResizeHandle` in
`session.tsx:2287-2299` (`min={SESSION_PANEL_WIDTH_MIN}`, `max={sessionPanelMax()}`) — dragging it just
redistributes width between chat and side panel within those fixed floors, it doesn't lower the floor
itself. (Separately, the file-tree-only panel, when review is not open, does have its own handle with a
lower floor — `FILE_TREE_WIDTH_MIN = 240` in `session-side-panel.tsx:62` — so this gap is specific to the
*review* pane's floor, not file-tree-only mode.)

#### Proposed Solution & Architecture
1. Lower `REVIEW_PANE_WIDTH_MIN`/`REVIEW_PANE_WIDTH_MIN_SPLIT` to values that scale with window width rather
   than being flat constants — e.g. a floor expressed as `Math.min(480, available * 0.3)` — so narrow
   windows can trade more of the side panel away. Keep a small absolute floor (enough to keep the tab bar
   and close buttons usable) rather than allowing collapse to zero, since that's a different control
   (the existing open/close toggle from Rewrite 11).
2. Extract the floor computation into `session-panel-width.ts` as a pure, testable function (the file
   already holds pure logic, so this is an edit in place, not a new module) with unit tests covering narrow
   (e.g. 1024px laptop) and wide (e.g. 2560px ultrawide) window scenarios.
3. No new UI is needed — the existing `ResizeHandle` in `session.tsx` already reads `sessionPanelMax()`,
   which is derived from these constants; changing the derivation is sufficient.

#### Upstream Diff & File Surface
- **Changed Files:**
  - `packages/app/src/pages/session/session-panel-width.ts` (the floor constants become a function of `available`; +~15/-4)
  - `packages/app/src/pages/session/session-panel-width.test.ts` (new or extended — cover narrow/wide cases; +~40 lines)
- **Upstream Hook:** none beyond the file above — `session.tsx` and `session-side-panel.tsx` already call into `sessionPanelWidthMax`/`clampSessionPanelWidth`, so no call-site changes are expected.
- **Estimated Upstream Diff:** `+15/-4` in one file (rough, pending a spec-time sketch) — this is the smallest of the three new items; it is a pure-logic change to an existing policy file, not a new feature.

---

### Rewrite 13: Click-to-Preview File Cards in the Chat Timeline

#### Problem
When the agent reads, edits, or otherwise touches a file, the chat timeline shows a tool-call card with the
file name in its title/subtitle, but clicking it only expands/collapses the tool's raw output — it does not
open that file in the side panel for a proper preview. The developer has to manually locate and open the
file via the file tree instead of clicking straight through from where the agent already referenced it.

#### Root Cause in OpenCode
- `packages/session-ui/src/components/basic-tool.tsx` and its v2 counterpart
  `packages/session-ui/src/v2/components/basic-tool-v2.tsx` render generic tool-call cards; their only
  `onClick` handler is `onTriggerClick`, which toggles the card's expand/collapse state.
- `packages/session-ui/src/components/message-part.tsx` — `getToolInfo()` (~L469-540) computes a
  `subtitle: getFilename(input.filePath)` for file-touching tools (read/edit/write/etc.), so the filename is
  already displayed, but no click handler or callback prop exists anywhere in this file to act on it.
- By contrast, `packages/app/src/pages/session/session-side-panel.tsx` already has the exact mechanism
  needed — `onFileClick={(node) => openTab(file.tab(node.path))}` (file tree, all-files tab) and a
  `previewTab`/`openTab` pair distinguishing a single-click preview from a pinned open — this item is
  substantially a wiring problem, in the same spirit as rewrite 001 (a renderer already exists; it's not
  reachable from this surface yet).

#### Proposed Solution & Architecture
1. Add an optional `onFilePathClick?: (path: string) => void` callback prop to `basic-tool.tsx` /
   `basic-tool-v2.tsx`, rendered as a click target on the filename portion of the card header only
   (not the whole card, to avoid conflicting with the existing expand/collapse `onTriggerClick`).
2. Thread the callback from wherever `AssistantParts`/`Message` are mounted in the session page down to
   `basic-tool`, terminating in a call to the existing `previewTab(file.tab(path))` used by the file tree
   (reuses the existing single-click-preview vs. double-click-pin distinction already established for file
   tree entries, so behavior stays consistent across both entry points).
3. Extract the "does this tool card represent a single, clickable file path" predicate (some tools touch
   multiple files, or none) into a small `-policy.ts` module, since `getToolInfo()` already centralizes the
   per-tool-type filePath extraction this would build on.

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/session-ui/src/components/tool-file-click-policy.ts` (new — predicate + path extraction, ~25 lines + tests)
- **Upstream Hooks:**
  - `packages/session-ui/src/components/basic-tool.tsx` (+~8 lines — click target + prop)
  - `packages/session-ui/src/v2/components/basic-tool-v2.tsx` (+~8 lines — same, v2 path)
  - `packages/session-ui/src/components/message-part.tsx` (+~4 lines — thread the callback prop through)
  - Wherever `AssistantParts` is mounted in `packages/app/src/pages/session.tsx` (+~4 lines — wire to
    `previewTab`)
- **Estimated Upstream Diff:** `+24/-0` across four files (rough, pending a spec-time sketch).

---

## 4. Priority Matrix & Phased Implementation Roadmap

To maximize developer velocity and maintain low maintenance overhead, the items are ranked by **DX Impact**, **Upstream Diff Surface**, and **Architectural Risk**. Diff-surface figures for items still marked "unverified estimate" in §0/§3 should be re-derived at spec time, not taken at face value.

| Rank | Rewrite ID & Title | DX Impact | Upstream Diff | Risk / Complexity | Recommended Phase |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **1** | **12 — Lower Side-Panel Minimum Width** | High | ~19 lines, 1 file | Low | **Phase 1 (Immediate)** |
| **2** | **11 — Open Side Panel on New-Session Screens** | High | ~18 lines, 3 files | Low | **Phase 1 (Immediate)** |
| **3** | **01 — Global Quick-Prompt HUD** | Critical | ~3 lines (unverified) | Low | **Phase 1 (Immediate)** |
| **4** | **13 — Click-to-Preview File Cards** | High | ~24 lines, 4 files | Low | **Phase 1 (Immediate)** |
| **5** | **04 — Deep "Open in External IDE"** | High | ~10 lines (unverified) | Low | **Phase 1 (Immediate)** |
| **6** | **02 — Context Window Inspector** | High | ~4 lines (unverified) | Low | **Phase 1 (Immediate)** |
| **7** | **10 — Rich Artifact & Preview Sandbox** | High | ~5 lines (unverified) | Low | **Phase 1 (Immediate)** |
| **8** | **05 — Interactive Plan Mode & Checkpoints** | Critical | unverified, likely underestimated (no existing checkpoint primitive) | Medium-High | **Phase 2 (Core DX)** |
| **9** | **06 — Granular Hunk Staging & Diff Comments** | High | ~10 lines (unverified) | Medium | **Phase 2 (Core DX)** |
| **10** | **03 — Subagent Tree / DAG Visualizer** | High | ~6 lines (unverified) | Medium | **Phase 2 (Core DX)** |
| **11** | **07 — System Tray & Actionable Notifications** | Medium | ~13 lines (unverified) | Medium | **Phase 2 (Core DX)** |
| **12** | **08 — Git Worktree Merge/Cleanup UX** | Unknown until re-scoped | not yet estimable | Unknown | **Needs re-scoping pass before phasing** |
| **13** | **09 — Terminal Split Panes & Process Monitor** | Medium | not yet estimable | Medium | **Phase 3, pending server-side data-source confirmation** |

Items 11-13 (§3a) were placed ahead of most of §3 because they are the narrowest in scope (single existing
surface, no new subsystem) and their root causes are traced to exact lines rather than estimated — the
lowest-risk, fastest-to-spec items in the whole backlog.

---

## 5. Compliance with Rewrite Principles (P1–P9)

For every candidate rewrite moving from this audit into a numbered spec in `rewrites/specs/NNN-*.md`:

1. **P1 (New Files):** All complex UI and state logic MUST live in new dedicated files.
2. **P2 (Single Edit Site):** Each rewrite must touch exactly one hook point in upstream components wherever possible.
3. **P3 (Rename Don't Re-indent):** When wrapping upstream components (like `renderFile` or `TerminalPanel`), rename the original function and add a wrapper beside it to ensure `git diff` does not touch unedited lines.
4. **P4 (Pure Logic in `-policy.ts`):** Thresholds, parsers, URI generators, and data transformations MUST be isolated in pure TypeScript files with unit tests.
5. **P5 (V2 Paths Only):** Target `packages/app` V2 components (`prompt-input-v2`, `review-panel-v2`, `file-tree-v2`, `terminal-panel-v2`). Do not touch legacy V1 paths.
6. **P6 (i18n Allowlist):** Add English keys to `packages/app/src/i18n/en.ts` and update `REWRITE_KEY_PREFIXES` in `parity.test.ts`. Do not touch other 60+ language files.
7. **P8 (Regression Verification):** Every landed rewrite must include automated policy tests and executable typecheck verification.

Per [README.md](./README.md), every item above still needs its own re-verification and full spec pass
(Non-goals, Tradeoffs, Requirements, verification plan, i18n keys, rebase notes) before implementation
begins — this audit establishes scope and priority, not an implementation-ready design.
