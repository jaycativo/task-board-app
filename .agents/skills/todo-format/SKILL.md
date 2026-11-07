---
name: todo-format
description: The contract for TODO.md, task lines, the archive file, and task notes. Read before changing the parser, any write to a vault file, or anything that reads task text.
---

# The TODO.md contract

The board is a view of one Markdown file. These rules say what the board may
read, what it may change, and what it must leave alone.

## Shape of the file

```md
<!-- todo-collector:start -->
## Inbox
- [ ] Send the report ⏫ 📅 2026-11-14 ^task-1a2b3c4d
  - details stay with the task

## Backlog
## Next
## Now
## In Progress

<!-- todo-collector:end -->

## Done
- [x] Start with a small problem ^task-small-problem
```

- Both collector markers must exist. `## Done` must come after the end marker.
- Inbox, Backlog, Next, Now, In Progress, and Done must each appear once.
  A repeated heading is an error (422). Unknown headings are ignored.
- Tasks outside the markers, inside code fences, or under unknown headings are ignored.
- Old `## Suggestions` headings are ignored, not migrated.
- The file's revision is the SHA-256 of its text. Every change carries the
  revision it was based on. A mismatch is a 409 and nothing is written.

## A task line

`- [ ] <title> [priority] [📅 date] ^block-id`, then optional indented lines.

- **The board owns** only: the checkbox state, the priority emoji, the `📅`
  due date, and the `^block-id`.
- **The board must keep** everything else on the line (repeat rules like `🔁`,
  tags, links, ` — [[source]]` suffixes) and every indented line under it.
  Indented lines are the task's details and move, archive, and delete with it.
- Priority emoji (Obsidian Tasks format): read `🔺` `⏫` as high, `🔼` as
  medium, `🔽` `⏬` as low. Write `⏫` `🔼` `🔽`.
- Dates are `YYYY-MM-DD` and must be real dates. `2026-02-31` is ignored when
  reading and rejected when writing.
- IDs match `[A-Za-z0-9-]+`. New ones are `task-` plus 8 hex characters.
  A task without an ID can be moved and edited by line number, and gets an ID
  the first time it is edited. Notes need an ID.
- Keep the file's line endings (`\n` or `\r\n`) when you rewrite lines.

## Rejected

- `## Rejected` is optional and sits after the end marker, below Done. The
  first time a task is moved to Rejected, the board adds the heading at the end
  of the file.
- Rejected tasks are written `- [-]` (cancelled in the Obsidian Tasks plugin)
  and do not count as open. Moving one out reopens it as `- [ ]`; Restore
  sends it to Inbox.
- The trash button on the Rejected panel permanently deletes every rejected
  task with its details, after a confirmation. `- [-]` tasks anywhere else are ignored.
- There is no Reject button. People reject a task with Move, then Rejected.

## Done, and the archive

- Done tasks are `- [x]`. Moving a task out of Done reopens it.
- Archive all moves every Done task, with its details, to `TASK-ARCHIVE.md`
  at the vault root: a `# Task archive` title once, then a
  `## Archived YYYY-MM-DD` heading for each archive run. A `✅ YYYY-MM-DD`
  completion date is added if the task has none.
- Order matters: write the archive first, then `TODO.md`. A failure may
  duplicate a task but must never lose one.

## Task notes

- Folder: `--notes-folder`, else `folder` from `.obsidian/daily-notes.json`,
  else `Daily Notes/`. Only the `YYYY-MM-DD` date format is supported; any other
  falls back to `Daily Notes/` with a message. Folders outside the vault are refused.
- Files are `YYYY-MM-DD.md`, using the computer's local time.
- An entry the board writes:

  ```md
  - 09:05 — Task note: [[TODO#^task-1a2b3c4d]]
    the note text, indented two spaces
    <!-- task-note:<uuid>:<sha256 of id + text> -->
  ```

- Only entries with that exact heading and marker can be edited or deleted. If
  the heading was changed by hand, refuse (409) and tell the person to change
  it in Obsidian. Never rewrite text the board did not write.
- Lines you did not write that link to `[[TODO#^id]]` are listed read-only.
- Deleting a task or archiving it does not touch its notes.
