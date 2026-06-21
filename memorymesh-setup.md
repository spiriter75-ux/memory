# memorymesh-setup.md - MemoryMesh Setup

Set up this folder as MemoryMesh. MemoryMesh is a shared working memory that lets multiple AI coding agents (Codex, Claude Code, Antigravity, and others) take turns in the same project folder without losing work. Its primary purpose is handoff continuity: when one agent runs out of context or token budget, another agent picks up the full context and continues. Perform the steps below in order.

Operating assumption: this folder is the top-level working directory, and agents always run from here. Work products live outside `.mesh`; all handoff metadata is isolated inside `.mesh`.

Three principles. First, single source of truth (SSOT): the protocol body lives only in `.mesh/PROTOCOL.md`, and root files point to it. Second, separation: `.mesh` holds metadata only. Third, non-destructive: never overwrite or delete existing folders and files. Create only what is missing, and merge only what is needed into what already exists.

Start light, with only the structure needed for handoff continuity. Do not create the knowledge-accumulation areas (wiki, graph) up front. When an agent detects a signal that they are needed, it proposes adding them to the user and creates them non-destructively only after approval. The agent makes that judgment and proposal on its own; the user only answers yes or no.

---

## 0. Inspect existing state

Before doing anything, check the current state of this folder.

- Check whether `.mesh` exists, and whether it already contains `PROTOCOL.md`, `OVERVIEW.md`, `work.log`, `INDEX.md`, and `handoffs/`.
- Check whether the root already has `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md`, and whether they contain a body.

If items already exist, preserve them and, in step 7, append only a `RE_ENGAGED` event to `work.log`. Re-running this setup in the same folder must be safe.

---

## 1. Create the folder structure

In the top-level folder, create `.mesh` and the handoff-continuity structure inside it. Keep what already exists and create only what is missing.

```text
.mesh/
├─ PROTOCOL.md      Shared rules every agent follows
├─ OVERVIEW.md      Onboarding brief for the next agent
├─ work.log         Append-only work event log
├─ INDEX.md         Index for locating older records
├─ handoffs/        Agent-to-agent handoff files
├─ archive/         Rotated-out work logs
└─ cold/            Long-term digests
```

POSIX shell:

```bash
mkdir -p .mesh/handoffs .mesh/archive .mesh/cold
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path .mesh, .mesh/handoffs, .mesh/archive, .mesh/cold
```

Do not create the `context`, `wiki`, or `graph` knowledge folders now. They are added later through the proposal-and-approval flow defined in PROTOCOL.md.

---

## 2. Write PROTOCOL.md

If `.mesh/PROTOCOL.md` does not exist, create it with the content below. If it exists, do not overwrite it; propose adding only the missing items. If existing rules conflict with these, do not merge, report the conflict to the user.

```markdown
# MemoryMesh Protocol

This protocol applies to every AI agent working in this folder.
`.mesh` is a shared working memory. It exists so multiple agents can work in one folder,
hand work to each other, and preserve context across sessions. The primary purpose is token-budget handoff.

## Agent identity
Before starting work, identify yourself as precisely as possible. If unsure, do not guess.
- Model-id, Vendor, Harness, Capabilities, Context-window
- If the exact model name is uncertain, use the form vendor-unknown-YYYY-MM and note the uncertainty in work.log.

## Request classification
Before reading or changing any file, classify the nature of the request first.

### Query mode
A request that only seeks information (status, progress, file contents, counts, summaries, opinion, evaluation, yes/no).
- Read only the files needed to answer.
- Skip the session-start checklist.
- Report the answer and stop. Do not anticipate or begin a next action.
- Wait for the user to decide what comes next.

### Status and opinion rule
When the user asks about status, progress, opinion, or evaluation, answer only with observed facts or your assessment, then stop.
Do not move to a next action without an explicit instruction. Acting on your own after a status question
wastes tokens, changes files the user did not approve, and takes control away from the user.

### Question vs. command
An interrogative is a question; only an imperative is an instruction to act. A verb inside a question
(delete, change, move, run, and so on) is something to check, not a command to execute. For example,
"Is file A deleted?" is a question to be answered yes or no by checking whether it exists. Do not delete A,
and do not ask whether to delete it. Asking back is itself a sign of misclassifying a question as the start of an action.
Never treat answering a question as the beginning of a change.

### Read vs. change boundary
Reading is not changing. Reads needed to answer or to gather context (checking file existence, viewing contents,
listing directories) are performed immediately, without asking permission. Do not request permission to read.
Such a request can be mistaken for a permission request for a destructive action like deletion. Permission checks
and explicit commands apply only to changes (write, delete, move, execute). Perform a change only on an explicit command.

### Task mode
When the user requests creation, modification, deletion, move, or execution as an imperative. Run the session-start checklist before changing any file.

## Session-start checklist (task mode only)
1. Read .mesh/PROTOCOL.md.
2. Read .mesh/OVERVIEW.md to understand current state and work in progress.
3. Read the recent tail of .mesh/work.log.
4. If resuming, reviewing, or taking over another agent's work, check .mesh/handoffs/ and .mesh/INDEX.md.
.mesh is a hidden folder; if search tools skip it, read by explicit path.

## work.log rules
An append-only event log. Do not edit old entries in place. Correct mistakes with a CORRECTION event.
Event header: ### YYYY-MM-DD HH:MM | <model-id> | <EVENT>
Event types: PROJECT_BOOTSTRAPPED, RE_ENGAGED, PROMPT, WORK_START, WORK_END,
FILES_CREATED, FILES_MODIFIED, FILES_MOVED, FILES_DELETED, DECISION, NOTE,
HANDOFF, HANDOFF_RECEIVED, HANDOFF_CLOSED, CHECKPOINT, CONTEXT_PRESSURE,
HANDOFF_RECOMMENDED, BLOCKER, CORRECTION
For long content, create a separate file under .mesh and reference it from work.log.

## Safe append
Write each event to work.log with a single append. Do not read-modify-rewrite the file.

POSIX shell:
\`\`\`bash
cat >> .mesh/work.log <<'LOG'
### YYYY-MM-DD HH:MM | <model-id> | WORK_END
Status: complete
Summary: <summary>
LOG
\`\`\`

## Checkpoints
During long work, leave CHECKPOINT events to preserve continuity. Record an obviously useful checkpoint
without asking. Record one when any of these hold:
- Three or more files modified, or any file created, moved, or deleted.
- The task spans multiple phases such as implementation, testing, refactoring, documentation.
- Context has grown large from inspecting many files.
- The user changed direction mid-task.
- There is meaningful intermediate progress that would be hard to resume if lost.
- A risky change or large replacement is about to happen.
Checkpoint format:
### YYYY-MM-DD HH:MM | <model-id> | CHECKPOINT
Summary: <what has been done>
Changed files: <files changed>
Current focus: <what you are doing now>
Remaining: <what is left>
Risks: <context pressure, uncertainties, conflicts, missing tests, blockers>

## Context-pressure detection and handoff
Exact remaining tokens are hard to know, so judge by signals. Context is heavy when two or more hold:
the conversation is long, many files were read, several files were changed, direction changed twice or more,
a full source or large output was requested, many unresolved assumptions are in play,
the next step demands careful continuity, the risk of forgetting earlier constraints is rising,
you are re-reading earlier context repeatedly.
When context pressure is high, leave a CONTEXT_PRESSURE event and consider writing a handoff file.
### YYYY-MM-DD HH:MM | <model-id> | CONTEXT_PRESSURE
Reason: <why the current context is getting risky>
Current state: <short state summary>
Recommendation: <continue | checkpoint | handoff | fresh session>

If the token budget is near, or there is stable intermediate progress with work remaining,
or the next step is separable, recommend handing off to another agent or a fresh session. Leave a HANDOFF_RECOMMENDED event.
Tell the user briefly. Example: I have recorded the current state in .mesh. This is a good point for another agent or a fresh session to continue.

## Handoff files
When another agent should take over or review, create a file in .mesh/handoffs/.
Filename: handoff_<topic>.<from-model-id>.md
Include: work summary, files changed, decisions made, current state, remaining work, known risks, exact next action.
Log HANDOFF when creating it, HANDOFF_RECEIVED when taking it, HANDOFF_CLOSED when done.

## Minimum continuity rule
Before stopping a large task, switching agents, or handing over control after partial progress,
at least one of these must exist: a recent CHECKPOINT, a WORK_END with clear remaining steps,
a HANDOFF event with a handoff file, or a CONTEXT_PRESSURE event stating the reason.

## Tiered memory and rotation
work.log is recent history (hot). When it grows too long, move old entries to .mesh/archive/work-YYYY-MM-DD.log
and record the location in INDEX.md. Move, do not delete. Put monthly digests in .mesh/cold/digest-YYYY-MM.md.
By default, do not read all old records. Use INDEX.md to find only what is needed.

## Maintaining OVERVIEW
When the project purpose, tech stack, core structure, settled decisions, current main work, open handoffs,
or important constraints change, update OVERVIEW.md. Keep it short so a new agent can read it quickly.

## Knowledge-layer expansion proposal
This environment starts with handoff continuity only. When any of the following signals appears, propose once
to the user adding a knowledge layer (context, wiki, graph) to collect reusable knowledge. The agent detects and
proposes first, so the user does not have to judge the timing.
- The same concept or term gets re-explained across multiple sessions.
- The same background knowledge recurs in handoff files or work.log.
- DECISION events have piled up and are hard to see at a glance.
- Stable, reusable concepts or relationships have clearly emerged.
Example proposal: Separately from the continuity log, collecting recurring concepts and decisions in
.mesh/wiki and .mesh/decisions would make handoffs smoother. Shall I add them?
Rules: propose only. Do not create folders before approval. If declined once, do not ask again in the same session.
On approval, non-destructively create whichever of .mesh/context, .mesh/wiki, .mesh/graph, .mesh/decisions are needed,
add those folders to the reading rules in this PROTOCOL, and log a DECISION in work.log.

## Sensitive information
Do not write API keys, passwords, tokens, session cookies, or personal data unnecessary for continuity into .mesh.
If the repository is public, recommend adding .mesh to .gitignore. If the user wants it under version control, leave it.

## When uncertain
If you do not know what to do, leave a NOTE in work.log stating what is uncertain, what you assumed,
and what the next agent should verify, then proceed conservatively.
```

The user's personal working style, common rules, and fixed background should not be written directly into PROTOCOL.md. Keep them in files under the `.mesh/context` folder, added later through the knowledge-layer expansion flow.

---

## 3. Write OVERVIEW.md

If `.mesh/OVERVIEW.md` does not exist, create it with the content below. If it exists, preserve it.

```markdown
# Project Overview

A short onboarding brief for the agent taking over.

## Purpose
TBD. Fill in by inspecting the project or asking the user.

## Tech stack or nature of work
TBD.

## Current state
.mesh initialized. Details not yet captured.

## Settled decisions
None yet.

## Current work
None yet.

## Open handoffs
None yet.

## Important constraints
- Read .mesh/PROTOCOL.md before working.
- Read the recent entries of .mesh/work.log before changing files.
- Log meaningful work in .mesh/work.log.
- Leave checkpoints during long work so another agent can safely continue.
```

---

## 4. Write work.log

If `.mesh/work.log` does not exist, create it with the header below. If it exists, preserve it.

```text
# MemoryMesh work.log
#
# Append-only event log. Add new events at the bottom.
# Event header: ### YYYY-MM-DD HH:MM | <model-id> | <EVENT>
# Read the recent tail before new work. Do not edit old entries in place; append a new event to correct.
# Full rules in .mesh/PROTOCOL.md.
# ============================================================
```

---

## 5. Write INDEX.md

If `.mesh/INDEX.md` does not exist, create it with the content below. If it exists, preserve it.

```markdown
# MemoryMesh Index

An index for locating old or related records. Use it to find only what is needed instead of reading every old log.

## Topic index
| Topic | File | Notes |
|---|---|---|

## Open handoffs
| Handoff | From | To | Status | Notes |
|---|---|---|---|---|

## Recent archives
| Date | File | Topic |
|---|---|---|
```

---

## 6. Log the bootstrap or re-engage event

Append exactly one event to `.mesh/work.log`. Use `PROJECT_BOOTSTRAPPED` for a first install, or `RE_ENGAGED` if files already existed. Use the current local date and time.

```text
### YYYY-MM-DD HH:MM | <model-id> | PROJECT_BOOTSTRAPPED
Vendor: <vendor>
Harness: <harness>
Capabilities: <capabilities>
Context-window: <context-window>
Notes: .mesh initialized. Root instruction files point to .mesh/PROTOCOL.md.
```

---

## 7. Create or merge root entry points

Agents read the root instruction file automatically at session start. Keep no body in the root, only a short entry point pointing to `.mesh/PROTOCOL.md`. If a file already exists, merge instead of overwriting.

The block below is called the managed block.

```markdown
<!-- MEMORYMESH:START -->
## MemoryMesh
This folder runs as a MemoryMesh shared working memory.
All operating rules live in .mesh/PROTOCOL.md.
Read .mesh/PROTOCOL.md first and follow its rules before starting work.
If the request asks about status or opinion, answer with facts only, then stop.
Do not mistake a verb inside a question for a command. An interrogative is a question; only an imperative is an instruction.
Reads are performed without asking permission. Changes (write, delete, move, execute) only on an explicit command.
<!-- MEMORYMESH:END -->
```

### AGENTS.md
- If it does not exist, create it with the managed block.
- If it exists and already contains the managed block, update only the content inside the block and leave the rest untouched.
- If it exists without the block, preserve existing content and append the managed block at the end. If existing instructions conflict, report to the user.

### CLAUDE.md, GEMINI.md
Keep these as pointers to AGENTS.md. Codex and OpenCode read AGENTS.md, Claude Code reads CLAUDE.md, Antigravity reads GEMINI.md.

- If a file does not exist, create it with only this line:
  `This project's instructions follow AGENTS.md. Read AGENTS.md and .mesh/PROTOCOL.md first.`
- If it exists with a body, preserve the body and append that line at the end. Do not replace the body with a pointer.
- If that line already exists, do nothing.

Do not create opencode.md. OpenCode does not read that file as a standard instruction file; it reads AGENTS.md.

---

## 8. Report completion

When the steps are done, report to the user. Distinguish what was newly created, what was preserved, and what was merged, and flag any conflicts or points needing confirmation. Do not claim to have created a file that already existed. If unsure, write "created or verified" instead of "created".
