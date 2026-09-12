# 001: Desktop Developer Experience Audit & Top 10 Rewrites

| Field | Value |
| --- | --- |
| Audit ID | 001 |
| Title | Desktop Developer Experience Audit & Top 10 Scoped Rewrites |
| Date | 2026-09-02 |
| Upstream Base | `38e10eb1408feb700021b8e8766fb0ab41bf84e2` (`dev`) |
| Release Near Base | `v1.18.15` |
| Focus | Desktop Application (`packages/desktop`, `packages/app`, `packages/session-ui`) |
| Competitive Baseline | Claude Code Desktop, Cursor Composer, Windsurf Cascade |
| Status | Scoped & Prioritized |

---

## 1. Executive Summary

OpenCode provides an extraordinarily capable backend engine: multi-turn agent execution, durable event-driven sessions (Session V2), extensible toolchains, MCP client support, and multi-model routing. However, the **desktop client layer** (`packages/desktop`, `packages/app`, `packages/session-ui`) currently operates primarily as a webview wrapper with several key DX frictions when compared to modern AI coding environments like **Claude Code Desktop**, **Cursor**, and **Windsurf**.

This audit analyzes the full desktop client surface and establishes the **Top 10 Scoped Rewrites and Customizations** required to elevate OpenCode Desktop to best-in-class developer experience.

Each rewrite is scoped according to the fork's governing principle in [PRINCIPLES.md](../PRINCIPLES.md): **minimize upstream diff surface** by isolating logic into new `-policy.ts` and component files while keeping upstream patch sites down to single-line invocation hooks.

---

## 2. Competitive DX Baseline & Audit Criteria

To evaluate developer friction and feature gaps, we evaluated OpenCode Desktop against Claude Code Desktop and modern AI IDEs across four core dimensions:

1. **Accessibility & Frictionless Summoning:** Can a developer prompt or query the AI instantly from anywhere without switching desktop workspaces or losing editor context?
2. **Context Transparency & Observability:** Does the developer have granular visibility into what is in the model's context window (token budget, prompt rules, memory, loaded files, MCP schemas)?
3. **External IDE & Tooling Integration:** Does the desktop app cleanly bridge into the developer's real workflow (VS Code / Cursor / Zed / JetBrains at exact lines, persistent multi-tab terminals, isolated git worktrees)?
4. **Interactive Review & Agent Steering:** Can the developer steer multi-step execution plans with checkpoints, review code with line-level hunk staging, and inspect parallel subagent trees in real time?

---

## 3. Top 10 Scoped Rewrites & Customizations

```
+---------------------------------------------------------------------------------------------------+
|                                TOP 10 DESKTOP DX REWRITE ROADMAP                                  |
+---------------------------------------------------------------------------------------------------+
| 1. Global Quick-Prompt HUD (Floating Spotlight Launcher & Global Hotkey)                          |
| 2. Live Context Window Inspector & Token Budget Breakdown                                         |
| 3. Subagent & Background Task Execution DAG / Tree Visualizer                                     |
| 4. Deep "Open in External IDE / Editor" Integration (VS Code, Cursor, Zed, JetBrains)             |
| 5. Interactive Plan Mode & Step-by-Step Checkpoint Steering                                       |
| 6. Granular Hunk Staging, Partial Diffs & Inline Diff Commenting                                  |
| 7. System Tray Controller & Desktop Background Task Engine with Actionable OS Notifications       |
| 8. Git Worktree & Multi-Branch Session Isolation                                                  |
| 9. Multi-Tab Terminal Multiplexing & Detached Background Process Manager                          |
| 10. Rich Artifact & Multi-Format Live Preview Sandbox (HTML, SVG, Mermaid, Sandboxes)             |
+---------------------------------------------------------------------------------------------------+
```

---

### Summary of Top Opportunities

| # | Rewrite Title | Problem & Competitive Gap vs Claude Code | Architectural Approach & Upstream Diff Surface |
| :---: | :--- | :--- | :--- |
| **01** | **Global Quick-Prompt HUD** | No way to summon OpenCode quickly from outside the app. Requires full window context switching. | Lightweight frameless overlay window (`hud-window.ts`) via global shortcut (`Ctrl+Shift+Space`) with quick answers and clipboard injection. **Diff: ~3 lines**. |
| **02** | **Live Context Window Inspector** | No transparency into what fills the model's context window (system rules, files, MCP schemas, transcripts). | Segmented token capacity visualizer with itemized token weights, file pinning, and selective context eviction. **Diff: ~4 lines**. |
| **03** | **Subagent Execution DAG / Tree** | Parallel subagents (`invoke_subagent`) are flattened into message streams, obscuring hierarchy & state. | Visual node tree in the session dock displaying real-time status pills, duration, subagent output streams, and cancel actions. **Diff: ~6 lines**. |
| **04** | **Deep "Open in External IDE"** | File & diff viewers cannot launch the user's primary IDE (VS Code, Cursor, Zed, JetBrains) at exact lines. | Deep URI (`vscode://file/...:line:col`) and CLI fallback launcher in file tabs, code blocks, and review diffs. **Diff: ~10 lines**. |
| **05** | **Interactive Plan & Checkpoint Steering** | Agent implementation plans are static markdown with no step-by-step interactive approvals. | Interactive plan checklist dock with step pausing, single-step execution, and mid-plan prompt parameter editing. **Diff: ~5 lines**. |
| **06** | **Granular Hunk Staging & Diff Comments** | Review panel operates at whole-file granularity; cannot stage/reject individual hunks or comment on diff lines. | Granular hunk staging/rejection actions, side-by-side split view, and inline comments that feed into prompt context. **Diff: ~10 lines**. |
| **07** | **System Tray & Actionable OS Notifications** | Long-running tasks run invisibly when minimized; OS notifications are passive popups without action buttons. | Electron System Tray with status badge & quick menu, cross-platform app menus, and OS notifications with "Approve" / "View Diff" buttons. **Diff: ~13 lines**. |
| **08** | **Git Worktree Session Isolation** | Sessions modify the active working directory, causing collisions with the developer's in-progress edits. | Automated Git Worktree management (`.git/worktrees/opencode-...`) for completely isolated agent experimentation and one-click merges. **Diff: ~8 lines**. |
| **09** | **Multi-Tab Terminal Multiplexing** | Session terminal is single-instance; cannot split panes, run dev servers in parallel, or inspect background PIDs. | Multi-tab split terminal container with shell profile selection (PowerShell, WSL, Bash) and background process registry. **Diff: ~9 lines**. |
| **10** | **Rich Artifact & Live Preview Sandbox** | HTML, SVG, Mermaid diagrams, and web components render only as plain code. | Sandboxed iframe previewer, interactive SVG pan/zoom, Mermaid diagram visualizer, and data table inspector. **Diff: ~5 lines**. |


### Rewrite 01: Global Quick-Prompt HUD (Floating Spotlight Launcher & Global Hotkey)

#### Problem
OpenCode Desktop currently only exists as standard heavy OS windows. To ask a quick question, query a codebase function, or paste a stack trace, developers must Alt+Tab away from their active editor/browser, locate the OpenCode window, click to focus, create or select a session, and type. This introduces friction for fast, high-frequency queries.

#### Competitive Benchmark
- **Claude Code CLI / Desktop:** Quick global summon shortcut (`Ctrl+Shift+Space` / `Cmd+Shift+K`) and instant terminal/floating launcher.
- **Raycast / Cursor Composer Floating Bar:** Lightweight, center-screen spotlight overlay that accepts natural language, captures clipboard context on demand, streams responses directly, and lets the user press `Enter` to pop out into a full session or `Esc` to dismiss.

#### Root Cause in OpenCode
`packages/desktop/src/main/index.ts` only instantiates standard `BrowserWindow` instances via `windows.ts`. There is no `globalShortcut` registration and no lightweight frameless overlay window renderer.

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
- **Estimated Upstream Diff:** `+3 / -0` lines.

---

### Rewrite 02: Live Context Window Inspector & Token Budget Breakdown

#### Problem
Developers have no real-time transparency into what constitutes the LLM's active context window. When sessions slow down or hit context limits, it is impossible to see whether tokens are consumed by bloated system prompts, redundant `AGENTS.md` files, giant tool definitions (MCP schemas), long conversation transcripts, or file content caches.

#### Competitive Benchmark
- **Claude Code:** `/context` command itemizing token usage by category (System, Messages, Tools, Git Diff, Files).
- **Cursor / Windsurf:** Visual context meter showing percentage usage of the model limit, with one-click pinning and eviction of specific files.

#### Root Cause in OpenCode
While OpenCode V2 computes and tracks `SystemContext` and session history in `packages/core/src/system-context`, the client UI (`packages/app/src/pages/session/composer/`) only displays aggregate message token metrics or hides them completely.

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
- **Estimated Upstream Diff:** `+4 / -0` lines.

---

### Rewrite 03: Subagent & Background Task Execution DAG / Tree Visualizer

#### Problem
OpenCode V2 supports powerful background tasks and subagent dispatch (`invoke_subagent`), but the desktop UI displays subagents either as flattened sequential chat bubbles or buries them in background task logs. When an agent dispatches 3 parallel subagents (e.g. codebase research, test runner, documentation analyzer), tracking their concurrent lifecycles, execution hierarchy, intermediate artifacts, and token consumption is confusing.

#### Competitive Benchmark
- **Claude Code Multi-Agent / Devin / AutoGen Studio:** Hierarchical DAG / execution tree displaying active agents, parent-child task relationships, live status pills (running, waiting, completed, failed), and step-by-step trace inspection.

#### Root Cause in OpenCode
Session messages are rendered by `MessageTimeline` in `packages/app/src/pages/session/timeline/` which sorts items linearly by timestamp. There is no dedicated hierarchical representation for subagent conversation IDs and background task trees.

#### Proposed Solution & Architecture
1. Create a pure subagent tree policy: `packages/app/src/pages/session/composer/subagent-tree-policy.ts` that builds a parent-child execution graph from `ConversationID` metadata and task events.
2. Build a live Subagent Tree Dock component: `packages/app/src/pages/session/composer/session-subagent-tree.tsx` placed alongside the composer dock.
3. Allow developers to expand/collapse individual subagent branches, view real-time streaming thoughts/tools for each subagent, and cancel individual subagent fibers.

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/app/src/pages/session/composer/session-subagent-tree.tsx` (~190 lines)
  - `packages/app/src/pages/session/composer/subagent-tree-policy.ts` (~85 lines)
  - `packages/app/src/pages/session/composer/subagent-tree-policy.test.ts` (~70 lines)
- **Upstream Hook:** `packages/app/src/pages/session/composer/session-composer-region.tsx` (+6 lines to mount subagent dock).
- **Estimated Upstream Diff:** `+6 / -1` lines.

---

### Rewrite 04: Deep "Open in External IDE / Editor" Integration (VS Code, Cursor, Zed, JetBrains)

#### Problem
Developers reviewing code, diffs, or generated files in OpenCode Desktop frequently need to jump into their primary IDE to run debugger breakpoints, use language servers, or apply manual edits. Currently, there is no direct one-click button to jump to the exact file, line, and column in external editors.

#### Competitive Benchmark
- **Claude Code:** Integrated `/open` commands and deep editor links.
- **GitHub Copilot & Cursor:** Seamless deep linking into editors via native URI schemes (`vscode://file/...`, `cursor://file/...`, `zed://file/...`) and CLI fallbacks (`code -g`, `cursor -g`, `zed`).

#### Root Cause in OpenCode
`packages/desktop/src/main/apps.ts` has basic app detection (`checkAppExists`), but lacks deep URI formatting and command-line execution with line/column targeting. `file-tabs.tsx` and `review-tab.tsx` lack UI buttons to trigger external editor opening.

#### Proposed Solution & Architecture
1. Implement pure URI and CLI generator policy: `packages/app/src/utils/external-editor-policy.ts` (handles VS Code, Cursor, Zed, WebStorm, IntelliJ, PyCharm, Sublime).
2. Add IPC handler in desktop main process: `packages/desktop/src/main/external-editor.ts` supporting both URI schemes and fallback CLI launchers.
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
- **Estimated Upstream Diff:** `+10 / -0` lines.

---

### Rewrite 05: Interactive Plan Mode & Step-by-Step Checkpoint Steering

#### Problem
When an agent creates an implementation plan (e.g. in `implementation_plan.md` or structured plan artifacts), the plan is static text. If a developer wants the agent to skip step 2, pause after step 3, or edit the parameters of step 4, they have to manually write follow-up steering prompts.

#### Competitive Benchmark
- **Claude Code Plan Mode (`/plan`):** Step-by-step interactive approvals, milestone checkpoints, and mid-plan prompt insertion.
- **Cursor Composer Agent:** Interactive checklist nodes that can be toggled, re-run, or resumed from specific checkpoints.

#### Root Cause in OpenCode
OpenCode V2 supports `session_input` with `followup: "steer" | "queue"`, and has a minimal `session-todo-dock.tsx`, but it only reads basic todo summaries and lacks interactive checkpoint controls or step-level prompt injection.

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
- **Estimated Upstream Diff:** `+5 / -1` lines.

---

### Rewrite 06: Granular Hunk Staging, Partial Diffs & Inline Diff Commenting

#### Problem
The review panel (`review-panel-v2.tsx` / `session-diff.ts`) treats file changes as monolithic units. A developer can accept or reject an entire file's changes, but cannot stage hunk #1 and reject hunk #2. Furthermore, developers cannot click a specific line on a modified diff to add an inline review comment that directly feeds into the agent's next steer prompt.

#### Competitive Benchmark
- **Claude Code Diff Review:** Interactive hunk-by-hunk review with `y` (accept), `n` (reject), `e` (edit), `c` (comment).
- **GitHub PR Review & Cursor:** Side-by-side split diffs, granular hunk staging, and inline line commenting.

#### Root Cause in OpenCode
The Pierre file component (`packages/session-ui/src/components/file.tsx`) renders diffs, but the parent review controller only dispatches whole-file revert/apply actions. `session-revert-dock.tsx` operates at whole-file and whole-session scopes only.

#### Proposed Solution & Architecture
1. Extract hunk parsing and partial patch application logic into a pure policy: `packages/session-ui/src/components/diff-hunk-policy.ts`.
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
- **Estimated Upstream Diff:** `+10 / -2` lines.

---

### Rewrite 07: System Tray Controller & Desktop Background Task Engine with Actionable OS Notifications

#### Problem
When OpenCode Desktop executes long operations (large test suites, multi-step subagents, complex refactors), minimizing the window leaves the developer with no visual progress indicator. In addition:
- `packages/desktop/src/main/menu.ts:22` explicitly disables native menus on Windows and Linux (`if (process.platform !== "darwin") return`).
- Notifications in `packages/app/src/context/notification.tsx` are passive web popups without actionable response buttons.

#### Competitive Benchmark
- **Claude Code Desktop:** Background daemon with system tray icon showing agent activity state, and native OS notifications with action buttons (e.g. "Approve Shell Command", "View Diff", "Dismiss").

#### Root Cause in OpenCode
Electron `Tray` and native notification action listeners are completely unhandled in `packages/desktop/src/main/`.

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
- **Estimated Upstream Diff:** `+13 / -3` lines.

---

### Rewrite 08: Git Worktree & Multi-Branch Session Isolation

#### Problem
All OpenCode sessions currently operate on the same active working copy of the project. If an agent modifies files, installs packages, or runs tests in the background while the developer is writing code in the same repository, file conflicts, lockfile collisions, and dev server reloads disrupt the developer's work.

#### Competitive Benchmark
- **Claude Code Worktrees:** Automatic isolation of tasks into temporary git worktrees (`git worktree add`), allowing the agent to test and compile on an isolated branch before offering a clean merge.
- **Cursor Background Agents:** Sandboxed git branch worktrees for autonomous agents.

#### Root Cause in OpenCode
`packages/app/src/pages/new-session/new-session-workspace-controller.ts` binds sessions strictly to the root project path or directory. There is no automated lifecycle for creating, attaching, and tearing down git worktrees for sessions.

#### Proposed Solution & Architecture
1. Create a pure Git Worktree manager: `packages/core/src/workspace/worktree-manager.ts`.
2. Build a Worktree Switcher component: `packages/app/src/pages/session/worktree-controller.tsx`.
3. Add a "Run in Isolated Git Worktree" toggle on new session creation:
   - Spawns `.git/worktrees/opencode-<session-id>` on a temporary branch `opencode/<session-id>`.
   - Executes all file edits and test commands inside the isolated worktree.
   - Provides a one-click "Merge into Main Branch" or "Create Git Commit / PR" when session succeeds.
   - Automatically cleans up worktree on session archive.

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/core/src/workspace/worktree-manager.ts` (~140 lines)
  - `packages/core/src/workspace/worktree-policy.ts` (~70 lines)
  - `packages/app/src/pages/session/worktree-switcher.tsx` (~95 lines)
- **Upstream Hooks:**
  - `packages/app/src/pages/new-session/new-session-workspace-controller.ts` (+5 lines)
  - `packages/app/src/pages/session/layout.tsx` (+3 lines)
- **Estimated Upstream Diff:** `+8 / -0` lines.

---

### Rewrite 09: Multi-Tab Terminal Multiplexing & Detached Background Process Manager

#### Problem
The session terminal in `packages/app/src/pages/session/terminal-panel-v2.tsx` provides a single terminal instance. Developers cannot split terminals, maintain a long-running dev server in tab 1 while inspecting agent commands in tab 2, nor monitor background process metrics (PID, CPU/RAM, output streams).

#### Competitive Benchmark
- **Claude Code / VS Code Integrated Terminal:** Multi-tab multiplexing, horizontal/vertical terminal split panes, shell profile switcher (PowerShell, WSL, Bash), and background process manager.

#### Root Cause in OpenCode
`terminal-panel-v2.tsx` binds directly to a single terminal buffer per session. It lacks a tab bar, split container, and background process registry interface.

#### Proposed Solution & Architecture
1. Create a terminal multiplexer controller: `packages/app/src/pages/session/terminal/terminal-multiplexer-controller.ts`.
2. Build a multi-pane terminal component: `packages/app/src/pages/session/terminal/terminal-multiplexer.tsx` supporting:
   - Tab bar with "+" for new terminal tabs (Agent Output, User Shell, Dev Server)
   - Vertical & horizontal split panes
   - Process monitor drawer showing detached background jobs, status, and kill/restart actions.

#### Upstream Diff & File Surface
- **New Files:**
  - `packages/app/src/pages/session/terminal/terminal-multiplexer.tsx` (~180 lines)
  - `packages/app/src/pages/session/terminal/terminal-multiplexer-controller.ts` (~110 lines)
  - `packages/app/src/pages/session/terminal/process-inspector.tsx` (~90 lines)
- **Upstream Hook:** `packages/app/src/pages/session/terminal-panel-v2.tsx` (wrapping existing terminal with the multiplexer).
- **Estimated Upstream Diff:** `+9 / -2` lines (following P3 rename-don't-reindent).

---

### Rewrite 10: Rich Artifact & Multi-Format Live Preview Sandbox (HTML, SVG, Mermaid, Sandboxes)

#### Problem
Following Rewrite 001 (Markdown file preview), OpenCode still renders HTML prototypes, SVG vectors, Mermaid charts, and React/Solid web component mockups as raw text. Developers must open external web browsers or preview tools to see visual outputs generated by the agent.

#### Competitive Benchmark
- **Claude Artifacts / v0 / ChatGPT Canvas:** Live interactive sandboxed iframe rendering for HTML/CSS/JS, interactive pan/zoom SVG visualizer, rendered Mermaid diagrams, and formatted JSON/CSV data table viewers.

#### Root Cause in OpenCode
`packages/session-ui/src/components/file.tsx` and `packages/app/src/pages/session/file-tabs.tsx` only branch to Markdown (via Rewrite 001) or Pierre syntax highlighter. There is no pluggable preview dispatcher for rich MIME types and artifacts.

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
- **Estimated Upstream Diff:** `+5 / -1` lines.

---

## 4. Priority Matrix & Phased Implementation Roadmap

To maximize developer velocity and maintain low maintenance overhead, the 10 rewrites are ranked by **DX Impact**, **Upstream Diff Surface**, and **Architectural Risk**:

| Rank | Rewrite ID & Title | DX Impact | Upstream Diff | Risk / Complexity | Recommended Phase |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **1** | **01 — Global Quick-Prompt HUD** | **Critical** | ~3 lines | Low | **Phase 1 (Immediate)** |
| **2** | **04 — Deep "Open in External IDE"** | **High** | ~10 lines | Low | **Phase 1 (Immediate)** |
| **3** | **02 — Context Window Inspector** | **High** | ~4 lines | Low | **Phase 1 (Immediate)** |
| **4** | **10 — Rich Artifact & Preview Sandbox** | **High** | ~5 lines | Low | **Phase 1 (Immediate)** |
| **5** | **05 — Interactive Plan Mode & Checkpoints** | **Critical** | ~5 lines | Medium | **Phase 2 (Core DX)** |
| **6** | **06 — Granular Hunk Staging & Diff Comments** | **High** | ~10 lines | Medium | **Phase 2 (Core DX)** |
| **7** | **03 — Subagent Tree / DAG Visualizer** | **High** | ~6 lines | Medium | **Phase 2 (Core DX)** |
| **8** | **07 — System Tray & Actionable Notifications** | **Medium** | ~13 lines | Medium | **Phase 2 (Core DX)** |
| **9** | **08 — Git Worktree Session Isolation** | **Critical** | ~8 lines | High | **Phase 3 (Isolation)** |
| **10** | **09 — Multi-Tab Terminal Multiplexing** | **Medium** | ~9 lines | Medium | **Phase 3 (Isolation)** |

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
