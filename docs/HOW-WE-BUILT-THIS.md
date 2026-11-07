# How we built this

A short story of how "Good work, friend" got built, for anyone who looks at it
and thinks "ooh, I want to make my own."

It was one long working session between a person (Jay) and an AI coding
assistant (Claude Code). Jay steered, and the assistant wrote and tested the
code. Everything below really happened, including the mistakes.

## Where we started

A small working app of about 600 lines: a Node server and one page that showed
a `TODO.md` as a kanban board. It worked, but it was plain. The goals were
prettier, easier to use, more personal, and, above all, **simple**.

## Three rules before any new code

1. **Your Markdown is the source of truth.** The board is a view. It never
   loses or reorders text it does not own.
2. **No dependencies and no build step.** Plain Node and vanilla JavaScript.
   That makes it easy to read, easy to trust, and easy to clone.
3. **Local only.** The server listens on `127.0.0.1`, checks every request, and
   writes files safely.

Writing these down first gave every later decision something to be checked
against. "Should we add a library for the date picker?" answered itself.

## The loop

Every feature went through the same loop:

1. **Ask for an overview before changing anything.** The first prompt was
   "give me a technical overview of what is already done, and what we should do."
2. **See options before choosing.** Three looks were mocked up as pictures. Jay
   liked one's style and another's colours, so we mixed them, then refined.
3. **Build one small step.** The logic first, as a plain function. Then tests.
   Then the page.
4. **Try it for real.** On a scratch copy of a vault, with real mouse clicks,
   looking at screenshots.
5. **Say what feels wrong.** A screenshot and one sentence did most of the work:
   "the dropdown should match the app," "the calendar closes when I go to the
   next month."
6. **Commit and push.** Small commits meant any mistake was cheap to undo.

## What got built, in order

A restyle and simpler cards, then due dates and priorities (written in the
Obsidian Tasks format, so they also work in Obsidian's own queries), a
colour-blind palette, a Rejected section, edit and delete, archiving finished
work, a custom Move menu, a notes drawer that uses your vault's daily notes
folder, sorting, a styled calendar, and finally the harness you can see in this
repo (`AGENTS.md` and `.agents/skills/`).

## What made it go well

- **Pure functions for anything that touches the file.** Text in, text out. They
  are easy to test, which is why there are 39 tests and the file format stayed safe.
- **A scratch vault for every test.** Never the real one.
- **Looking instead of assuming.** Screenshots and real clicks found bugs that
  reading the code did not.
- **A small design vocabulary, written down.** Ink outlines, one colour per
  column, and no column ever uses a priority colour.
- **A harness.** What we learned went into `AGENTS.md` and five short skills, so
  the next session, or the next person, starts with it.

## Mistakes we kept in on purpose

- **A misread request.** "We don't need the Reject button" became "remove the
  whole Rejected feature." We caught it before committing and restored it from
  git. Lesson: say exactly which thing, and commit small so undoing is cheap.
- **A calendar that closed when you pressed the next-month arrow.** The redraw
  removed the clicked button before the "click outside" check ran, so it looked
  like a click elsewhere. The fix was to read `event.composedPath()`.
- **Two pop-ups closing at once.** We tried to close the calendar first and the
  dialog second, but browsers run microtasks between event listeners, so our
  flag was cleared too early. The fix was to compare the event itself.
- **Clicks made by code look like they came from the corner.** A programmatic
  `click()` reports position (0, 0). Test with real mouse clicks.
- **The browser's own date picker and dropdown cannot be styled.** We built our
  own, small ones.
- **The page's security headers block `data:` images.** So no inline SVG icons;
  plain characters and CSS shapes instead.
- **Trying the app on the sample file edits the sample.** Test on a copy, and
  keep the test leftovers out of git.

## Make your own

1. Decide what your source of truth is and what must never be lost.
2. Write your rules down in one short file (`AGENTS.md` here).
3. Have the assistant read what exists and tell you what is done.
4. Ask for options as pictures before you pick a look.
5. Build in small steps: logic, tests, page, try it, commit.
6. Test on scratch data. Look at it, click it, break it.
7. Write what you learned into skills, so it does not have to be learned twice.

A starter prompt, to adapt:

```text
I want to build a small local app that shows [my file or folder] as
[a board, a list, a calendar]. Before writing any code:

1. Ask me what the file looks like and what must never be lost or changed.
2. Read what already exists and tell me what is done and what we should do.
3. Show me three looks as mockups and wait for my pick.

Rules: no dependencies, no build step, runs on localhost only, and my file is
the source of truth. Work in small steps: plain functions for anything that
writes to my file, tests for each, try it on a scratch copy, show me
screenshots, then commit. Write what you learn into AGENTS.md and a skills
folder.
```

## By the numbers

21 commits, all dated the same day. About 1,650 lines of app code and 425 lines
of tests (39 tests). No dependencies. Five skills.

## Where to look next

- [`AGENTS.md`](../AGENTS.md) and [`.agents/skills/`](../.agents/skills): the
  harness itself.
- [`task-board/board.mjs`](../task-board/board.mjs): the rules for `TODO.md`, as plain functions.
- [`README.md`](../README.md): how to use the board, and a prompt for bringing
  your own tasks over.
