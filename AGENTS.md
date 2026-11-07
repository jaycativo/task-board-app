# AGENTS.md

Instructions for any coding agent, or any person, building on this repo.

A local kanban board over one Obsidian `TODO.md`. Plug and play for other people's vaults, so keep it simple. Users read `README.md`, not this file.

## Ground rules

- Zero dependencies and no build step. Plain Node 18+ and vanilla JS.
- `TODO.md` is the source of truth and the board is a view. Never lose or reorder text the board does not own.
- The server listens on `127.0.0.1` only. Do not loosen its request checks.
- Never test on a real vault, and never commit changes made to the sample `TODO.md` by trying the app.
- Playful, but serious about the work. Sentence case; no "please" or "successfully" in the interface.

## Commands

```sh
bash start.sh                      # sample TODO.md in this folder
bash start.sh "/path/to/vault"     # a vault; add --notes-folder <name> to pick the notes folder
node --test task-board/*.test.mjs  # all tests (list the files; a directory path fails)
# the page has a browser smoke test: .agents/skills/run-and-verify/smoke.js
```

## Layout

- `task-board/`: the server. `server.mjs` only routes requests; the rules live in `board.mjs` (`TODO.md`), `archive.mjs` and `notes.mjs`. One `*.test.mjs` per module.
- `task-board/web/`: everything the browser loads, and nothing else is served. `app.js` connects the pieces; each other file does one job.
- In `web/`, pure logic is `.mjs` so Node can test it. Code that touches the page is `.js`.
- `scripts/`: builds the Mac Dock app and its icon. The built `.app` is never committed.

## Skills

Read the one that matches your task before you start. They live in `.agents/skills/<name>/SKILL.md`; Claude Code finds them through the `.claude/skills` link.

| Skill | Read it when you are |
| --- | --- |
| `add-feature` | adding or changing any behaviour. Start here. |
| `todo-format` | touching the parser, the file format, notes, or the archive |
| `server-safety` | touching the server, its endpoints, or the page's security headers |
| `design-system` | changing how anything looks or reads |
| `run-and-verify` | running the app, testing in a browser, or before saying "done" |

## Working agreements

- Small steps. Tests stay green. Commit each working step with a message that says what changed and why, and push if the owner has asked you to.
- Update `README.md` (for users) and the relevant skill (for builders) in the same change as the behaviour.
- Say what you did not check. Do not report something as working until you have run it.
