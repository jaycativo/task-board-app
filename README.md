# Good work, friend: a task board for your Obsidian vault

A small kanban board that lives on top of a single `TODO.md` file. Drag a card,
and the file changes. Edit the file in Obsidian, and the board follows.

- No install step, no account, no database. It needs Node.js 18 or later.
- Runs on your computer only. Nothing leaves your vault.
- Your Markdown is the source of truth, so the board is just a view.

## Try the sample

Open a terminal in this folder and run:

```sh
bash start.sh
```

The board opens in your browser and saves changes to the sample `TODO.md` in
this folder. Press Ctrl+C to stop it.

## Connect your vault

1. Back up your vault and your existing `TODO.md`.
2. Put a `TODO.md` at the root of your vault in the format below.
3. Run the app with your vault folder (keep the quotes if the path has spaces):

   ```sh
   bash start.sh "/path/to/your/vault"
   ```

The terminal shows which `TODO.md` will receive changes. The app does not
convert existing files.

## What the board does

- **Move tasks** by dragging a card or using its Move menu, which lists every
  column including Rejected.
- **Add tasks** with the New task button. They land in Inbox.
- **Edit or delete tasks** with a card's Edit button. You can change the title,
  due date, and priority, or delete the task. Indented details under the task
  and any other tokens on the line (like a repeat rule) are kept.
- **Archive finished work.** The Archive all button on Done moves every done
  task to `Task Archive.md` at the vault root, under a dated heading, and takes
  them off the board. The archive keeps each task's details and adds a `✅`
  completion date if it has none.
- **Due dates and priorities.** Cards show a friendly due label (`today`,
  `tomorrow`, `fri`, `20 nov`, `2d late`) and a priority (`▲ high`, `◆ med`,
  `▼ low`). Priority uses a shape and a word as well as a colour, and a footer
  toggle switches to a colour-blind-friendly palette.
- **Reject tasks** from Inbox. Rejected tasks move to a collapsed Rejected
  panel where you can restore them or delete them all with the trash button.
- **Search** by title, ID, priority, date, or a pasted `[[TODO#^task-id]]` link.
- **Task notes.** Each task can have notes, saved to a dated file in your vault
  and linked back to the task.

## The `TODO.md` format

```md
<!-- todo-collector:start -->
## Inbox
- [ ] Try the board ^task-try-board

## Backlog
## Next
## Now
- [ ] Send the report ⏫ 📅 2026-11-14 ^task-send-report

## In Progress

<!-- todo-collector:end -->

## Done
- [x] Start with a small problem ^task-small-problem
```

- Keep the two collector markers and the Inbox, Backlog, Next, Now,
  In Progress, and Done headings. Done must come after the end marker.
- Due dates and priorities use the [Obsidian Tasks](https://publish.obsidian.md/tasks/)
  emoji format: `📅 YYYY-MM-DD` for a due date, and `⏫` high, `🔼` medium,
  `🔽` low for priority. The board changes only these tokens and leaves
  everything else on the line, including indented details, untouched.
- Give tasks a unique block ID such as `^task-first`. Tasks made in the board
  get one automatically.
- The first rejection adds a `## Rejected` heading at the end of the file.
  Rejected tasks are written as `- [-]`, which the Tasks plugin treats as
  cancelled.
- Tasks outside the markers are ignored, and a `## Suggestions` heading from
  older versions is ignored too.

## Notes

Task notes are saved in `intake/YYYY-MM-DD.md` in the vault, using the
Europe/Lisbon time zone for the date and time. Using your Obsidian daily notes
folder and your own time zone instead is planned.

The board checks for file changes before saving, but it does not share a lock
with Obsidian. Avoid saving the same file in both apps at the same moment.

## Is it safe to run?

The server listens on `127.0.0.1` only, on a random port, so other devices on
your network cannot reach it. It checks the Host and Origin of every request,
accepts only JSON for changes, and sends a strict content security policy. It
reads and writes only `TODO.md` and the notes folder. Do not expose its port
with a tunnel or port forwarding.

## Tests

```sh
node --test task-board/*.test.mjs
```

## Status

Work in progress. Planned: a notes drawer with edit and delete, sorting by
priority and due date, and reading the Obsidian daily notes setting.

Good to know: deleting or archiving a task does not touch its notes. Notes link
to `[[TODO#^task-id]]`, so a link to an archived task stops resolving until the
task is back in `TODO.md`.
