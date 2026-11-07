# Project notes for Claude

A local kanban board over one Obsidian `TODO.md`. Built to be plug and play for
other people's vaults, so keep it simple.

## Ground rules

- Zero dependencies and no build step. Plain Node (18+) and vanilla JS.
- `TODO.md` is the source of truth. The board is a view. Never lose or reorder
  text the board does not own: only touch the checkbox state, the due date, the
  priority token, and the block ID. Keep unknown tokens and indented details.
- Everything the server accepts is validated. Writes go through a revision check
  and an atomic temp-file rename.
- The server binds to 127.0.0.1 only. Do not loosen the Host or Origin checks.
- Never write to the user's real vault while testing. Use a copy under the
  scratchpad or a temp folder.

## Run and test

```sh
bash start.sh                      # sample TODO.md in this folder
bash start.sh "/path/to/vault"     # a real vault
node --test task-board/*.test.mjs  # all tests
```

## Layout

- `task-board/server.mjs`: parser, move/create/reject/clear logic, HTTP API.
- `task-board/app.js`: the whole frontend. `search.mjs` is the search filter.
- `task-board/style.css`: tokens at the top. Light and dark follow the system.
- `task-board/*.test.mjs`: tests for the server logic and the connection.

## Decisions so far

- Look: "ink and sunshine". Ink outlines, monospace labels, cream panels, tan page.
- Each column has its own colour. None may match a priority colour
  (tangerine high, butter medium, sage low). Priorities always show a shape and
  a word as well as a colour, and a footer toggle swaps in a colour-blind palette.
- Due date and priority use the Obsidian Tasks emoji format. Dates are stored as
  `YYYY-MM-DD` and turned into friendly labels in the browser, in local time.
- Reject moves a task to an optional `## Rejected` section at the end of the file
  as `- [-]`. Restore sends it back to Inbox. The trash button deletes them all.
- Suggestions was removed. Inbox is for triage.
- Edit changes only the title, due date, and priority. The block ID, checkbox,
  details, and unknown tokens stay. Editing and deleting use a native confirm
  for anything permanent. If the file changed under an open edit, the dialog
  closes instead of retrying, so a stale line number can never edit the wrong task.
- Archive all moves Done tasks to `Task Archive.md` (root of the vault) with a
  `✅` date. The archive is written before `TODO.md`, so a failure can only
  duplicate a task, never lose one.
- The Move control is a custom `<details>` menu, not a native select, so it
  matches the app. The priority field in the task dialog is still a native select.

## Still to do

- Notes: a side drawer with edit and delete for entries the app created, and
  use the vault's Obsidian daily notes folder (`.obsidian/daily-notes.json`)
  instead of the hard-coded `intake/`. Replace the hard-coded Europe/Lisbon time zone.
- Sort cards by priority and due date.
- Check phone width and dark mode by eye.

## Voice

Playful, but serious about the work. Sentence case, no "please" or "successfully".
