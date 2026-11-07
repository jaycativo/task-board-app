# AGENTS.md

Instructions for any coding agent, or any person, building on this repo.

## What this is

A local kanban board over one Obsidian `TODO.md`. Plug and play for other
people's vaults, so keep it simple. Users never read this file; they read
`README.md`.

## Ground rules

- Zero dependencies and no build step. Plain Node 18+ and vanilla JS.
- `TODO.md` is the source of truth and the board is a view. Never lose or
  reorder text the board does not own.
- The server listens on `127.0.0.1` only. Do not loosen its request checks.
- Never test on a real vault, and never commit changes made to the sample
  `TODO.md` by trying the app.
- Playful, but serious about the work. Sentence case; no "please" or
  "successfully" in the interface.

## Commands

```sh
bash start.sh                      # sample TODO.md in this folder
bash start.sh "/path/to/vault"     # a vault; add --notes-folder <name> to pick the notes folder
node --test task-board/*.test.mjs  # all tests (list the files; a directory path fails)
```

## Layout

- `task-board/server.mjs`: parser, task and note logic, HTTP API, startup.
- `task-board/app.js`: the whole frontend. `search.mjs` holds search and sorting,
  `calendar.mjs` the date picker's date logic.
- `task-board/style.css`: design tokens at the top.
- `task-board/theme.js`: applies the saved light or dark choice before the page is drawn.
- `scripts/`: builds the Mac Dock app (`make-mac-app.sh`) and its icon (`make-icon.sh`,
  `icon.html`, `task-board.icns`). The built `.app` is never committed.
- `task-board/*.test.mjs`: tests for server logic, search and sorting, notes, dates.

## Skills

Task-specific know-how lives in `.agents/skills/<name>/SKILL.md`, in the open
Agent Skills format (a short front matter, then plain Markdown). Read the one
that matches your task before you start.

| Skill | Read it when you are |
| --- | --- |
| `add-feature` | adding or changing any behaviour. Start here. |
| `todo-format` | touching the parser, the file format, notes, or the archive |
| `server-safety` | touching the server, its endpoints, or the page's security headers |
| `design-system` | changing how anything looks or reads |
| `run-and-verify` | running the app, testing in a browser, or before saying "done" |

Tools that read a different skills folder can point it at `.agents/skills`.
Claude Code finds them through the `.claude/skills` link.

## Working agreements

- Small steps. Tests stay green. Commit each working step with a message that
  says what changed and why, and push if the owner has asked you to.
- Update `README.md` (for users) and the relevant skill (for builders) in the
  same change as the behaviour.
- Say what you did not check. Do not report something as working until you
  have run it.

## Status

Built: the look, due dates and priorities, colour-blind palette, the Rejected
panel (Move, then Rejected; restore; delete all), archive, edit and delete, the
Move menu, a styled calendar and priority control, the notes drawer, sorting,
light and dark mode with an Auto, Light, Dark switch, README screenshots.

Licence: MIT. Phone width is not a priority.
