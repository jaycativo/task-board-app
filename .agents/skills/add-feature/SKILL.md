---
name: add-feature
description: The step-by-step way to add or change behaviour in the task board, with the mistakes we already made once. Read first for any feature, fix, or refactor.
---

# Adding a feature

Follow these steps in order. Read the other skills they point to.

## 1. Put the logic where it can be tested

- Changes to `TODO.md` are **pure functions in `board.mjs`**: text in, text out,
  exported. Nothing in them touches the network or the disk. The HTTP handler
  (`server.mjs`) reads the file, calls the function, and writes the result safely.
- Notes (`notes.mjs`) and the archive (`archive.mjs`) also write their own files, so
  test them against a scratch folder.
- Display-only behaviour (search, sorting) lives in `search.mjs` as a pure
  function. It must not change what is written to the file.
- Anything that reads or writes vault files: read `todo-format`.
- Anything that adds an endpoint: read `server-safety`.

## 2. Write the tests with it

Put them in `task-board/*.test.mjs` using `node:test`. Cover the happy path,
that unknown content (extra tokens, indented details) survives, bad input, a
stale revision, and a task that does not exist. Run all tests with
`node --test task-board/*.test.mjs`.

## 3. Wire the page

- Changes to `TODO.md` go through `save(url, body, doneMessage)`. It handles
  the busy state, sends the revision, shows the result, and re-renders.
- Notes use `post(url, body)` and reload the drawer.
- Ask for confirmation (`confirm`) before anything permanent, and say it
  cannot be undone.
- Identify a task by its `id`. Use its line number only when it has no ID.
- If the file changed while a dialog was open: for a task with an ID, keep the
  dialog and the typed text, take the new revision, and tell the person to save
  again (the ID finds the task safely). For a task with no ID, **close the dialog
  and show the error**: never retry with an old line number, it can hit the wrong task.
- Build elements with `element(tag, className, text)`. Never put task text
  into `innerHTML`.
- Style and word it using `design-system`.

## 4. Run it for real

Use `run-and-verify`. Do not say a change works until you have run it and
looked at both the page and the file on disk.

## 5. Update the docs in the same change

- `README.md`: what a person can now do, in plain words.
- `AGENTS.md`: the status list.
- The skill that describes the thing you changed.

## 6. Commit and push

One working step per commit. Say what changed and why. Add only the files you
changed. Do not commit the sample `TODO.md` after trying the app on it.

## Mistakes we already made once

- Dates: parse `YYYY-MM-DD` as a local calendar day, never through UTC, or
  tasks flip a day early or late. Labels (`today`, `fri`) are made in the browser.
- The page refreshes every 5 seconds. Refresh must pause while a dialog or an
  open menu is up, or it rebuilds the page under the person.
- A `data:` image or inline style is blocked by the security headers.
- Menus built from `<details>` stay open on outside clicks unless you close them.
- Giving a column the same colour as a priority chip confused people.
- Do not reuse the `column-*` class names on other elements (menu items use
  `accent-*`). A selector like `.column-next` then matches the wrong thing.
- `node --test task-board/` fails; list the files with a glob instead.
- Shell scripts that rewrite many files must be checked afterwards with
  `git grep` for leftovers.
