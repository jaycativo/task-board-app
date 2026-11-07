---
name: run-and-verify
description: How to run the task board safely on a scratch vault, drive it in a browser, check the files it wrote, and run the tests. Read before you try the app or say a change works.
---

# Run and verify

## Never test on the real thing

- Do not point the app at a real vault. Make a scratch vault.
- Do not run `bash start.sh` with no argument for testing. It edits the repo's
  sample `TODO.md` and creates `Daily Notes/` and `TASK-ARCHIVE.md` in the
  repo. Those files are in `.gitignore`, but `TODO.md` is tracked, so a
  test run shows up as a change. Never commit that.

## 1. Make a scratch vault

```sh
mkdir -p /tmp/board-scratch && cp TODO.md /tmp/board-scratch/
```

Write your own `TODO.md` there when you need particular cases: dates around
today, priorities, details under a task, a Done task, notes. To test the notes
folder lookup, add `.obsidian/daily-notes.json`, e.g.
`{"folder":"journal","format":"YYYY-MM-DD"}`.

## 2. Start the server

```sh
node task-board/server.mjs /tmp/board-scratch
```

It prints a URL on a random port and which notes folder it chose. It also tries
to open your browser. To stop that while an agent drives it, run it with an
empty `PATH`: `env PATH=/nonexistent "$(command -v node)" task-board/server.mjs <vault>`.
Stop it with Ctrl+C or `pkill -f task-board/server.mjs` when you are done.

## 3. Drive the page

- Use a browser tool, or script the page from the console. Stub
  `window.confirm = () => true` to get through confirmation boxes, and read
  what was asked.
- Check **two things** after every action: the page (message, counts, cards)
  and the file on disk (`cat` it). The file is the truth.
- Look at a screenshot at least once per visual change. Check that nothing
  overflows its card or column.
- localStorage keeps `palette` and `sort`. Clear them to see first-run behaviour.
- Dates in labels depend on today. Build test dates relative to the real date.

## 4. Run the tests

```sh
node --test task-board/*.test.mjs
```

All tests must pass. Say how many.

## 5. Finish clean

- Stop the server.
- `git status`: only the files you meant to change are modified. The sample
  `TODO.md` must be untouched (`git diff --quiet TODO.md`).
- When you report, say what you checked and what you did not (for example
  dark mode, another browser, the keyboard).
