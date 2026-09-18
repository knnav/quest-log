---
name: pr-description
description: Draft a pull request description for the current branch of Quest Log, filled in from the actual commits and diff. Use whenever the user asks for a PR description, PR body, PR text, PR summary, "write up this branch", or wants to open a PR — even if they only say "describe my changes" or "what should the PR say". Drafts text only; it never commits, pushes, or opens the PR.
---

# PR description

Write the description in chat as a fenced markdown block the user can paste straight into GitHub. Do not commit, push, or run `gh pr create` — this repo has a hard rule against Claude committing or pushing, and the user opens PRs themselves.

## Gather the facts first

The description must come from the diff, not from memory of the conversation. Read before writing:

1. Find the base and the range. Default to `main`; if the user names another base, use that.
   - On a feature branch: `git log --format='%h %s%n%b' main..HEAD` and `git diff main...HEAD --stat`, then `git diff main...HEAD` for the files that matter.
   - On `main` itself, or with uncommitted work: describe the working tree instead (`git status`, `git diff`, `git diff --cached`) and say so in the summary line of your reply.
2. Skim the changed files enough to explain *why*, not just *what*. A stat line tells you `store.js` changed; only reading it tells you a timestamp rule changed.
3. Note anything that touches the load-bearing parts of this app, because reviewers need those called out: the IPC surface (`main.js` → `preload.js` → feature module), `store.js` timestamps or migrations, `TIER_WORTH`/`TASK_WORTH` (both scoring systems read them), window geometry constants (`BOARD`/`HEARTH`/`PANEL`), the `detailFixture.mjs` mirror of the modal markup, and CLAUDE.md.

## Template

Use this shape. Drop a section entirely when there is nothing to say — an empty "Screenshots" heading on a store-only change is noise, not completeness.

```markdown
## Summary

Two to four sentences: what changed and why it was worth changing. Lead with the user-facing effect if there is one; lead with the motivation if it is internal.

## Changes

- Grouped by layer, in the order a reviewer would read them: main/preload → store → js/core → js/ui → js/features → CSS/themes → tests.
- One bullet per meaningful change, not per file. Name files as `path/file.js` so they are searchable.

## Design notes

Decisions a reviewer could reasonably question, with the reason. New IPC channels, migrations, changes to how timestamps or worth are computed, anything that had to work around Electron/WSLg/Windows quirks, and anything that should probably land in CLAUDE.md. Skip if the change is mechanical.

## Testing

- `npm test` — pass/fail and count. Run it; do not guess.
- Tests added or changed, by file.
- Manual checks worth doing for this change, chosen from: board mode, hearth mode, the In Flight panel, the 420px-wide board, a fresh `quest-log.json`, an existing store (for migrations), each theme if CSS variables changed.

## Screenshots

Only for visible UI changes. Leave a placeholder line per view the user should capture (e.g. "Board, light theme" / "Hearth"), since Claude cannot take them.
```

Title: one line, imperative, under ~60 characters, matching the repo's commit style (`Add archive feature`, `Refactor XP system`). Put it above the block as `**Title:** …`.

## Keep it honest

- Describe what the diff does, not what the branch was meant to do. If a commit message promises something the code doesn't deliver, say so to the user rather than repeating the promise.
- If `npm test` fails, report the failure in the Testing section verbatim rather than leaving it out.
- Do not pad. A three-line change gets a short summary and a short changes list; it does not need design notes.
