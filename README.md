# Local task board for Obsidian

Use this board to view and move tasks in a Markdown file. The app runs on your
computer. It needs Node.js 18 or later. It has no package install or account.

## Try the sample

Open a terminal in this folder and run:

```sh
bash start.sh
```

The board opens in your browser. It saves changes to the sample `TODO.md` in
this folder. Press Ctrl+C in the terminal to stop it.

## Connect your vault

1. Back up your vault and your existing `TODO.md`.
2. Put `TODO.md` at the root of your vault. Its format must match the sample
   `TODO.md`: keep the collector markers and the Inbox, Backlog, Next, Now,
   In Progress, and Done headings. Suggestions is optional. The Done heading
   must follow the end marker. The app does not convert existing files.
3. In a terminal, run the command below from the app folder. Replace the path
   with your vault folder. Keep the quotes if the path contains spaces.

   ```sh
   bash start.sh "/path/to/your/vault"
   ```

4. Open the printed address if your browser does not open. The terminal shows
   which `TODO.md` will receive changes. Press Ctrl+C to stop the app.

The app moves task blocks and keeps their text and indented details. It does
not collect tasks from other notes. Give tasks unique Obsidian block IDs, such
as `^task-first`, to use task links and notes. New tasks made in the board get
an ID automatically. Register the vault in Obsidian under its folder name for
Obsidian links to work.

Task notes are saved in `intake/YYYY-MM-DD.md` in the vault. The app uses
Europe/Lisbon for the date and time. It reads task history from those files.
The board checks for file changes before saving, but it does not share a lock
with Obsidian. Avoid saving the same file in both apps at the same time.

Run the focused checks with `node --test task-board/connection.test.mjs`.
