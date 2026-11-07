---
name: design-system
description: The look, colours, accessibility rules, and voice of the task board ("ink and sunshine"). Read before changing any style, colour, control, or piece of interface text.
---

# Ink and sunshine

Playful, but serious about the work. Warm colour, firm outlines, plain words.

## Look

- Tan page, cream panels, white cards. Colours are CSS variables at the top of
  `web/style.css`; use them, never raw hex in a rule. Light and dark follow the system.
- Everything is outlined at `1.5px` in `--line`. Column panels and dialogs get a
  thicker `5px` bottom edge. **Outlines and raised edges use `--line`, never `--ink`.** `--ink` is for
  text: in dark mode it is bright cream, and cream outlines everywhere made the board glare. In light
  mode the two are the same brown; in dark mode `--line` is a softer tan.
- Text must be readable in every theme and style: at least 4.5 to 1 against what is behind it (3 to 1
  for text 24px and up). Do not put a fixed dark colour on a colour that goes dark in dark mode (that
  made the selected "None" priority unreadable once). Run `contrast.js` after any colour change. Corners are `6px` (controls) to `8px` (panels).
- Headings, labels, chips, and buttons use the monospace stack in bold at
  11–12px. Body text is the system sans at 15px.
- Buttons are cream with an ink outline and go butter on hover. The one main
  action on a screen (New task, Create task, Save to daily note) is tangerine.
- Done cards are dashed with strikethrough. Overdue is solid red with white text.

## Two styles

The footer switches between **Playful** (default) and **Minimal**. It is the `data-style` attribute on
`<html>`, saved as `style`, and applied before the page is drawn by `web/theme.js`. Playful is written
as `:root:not([data-style="minimal"])` so it is the default when nothing is saved.

- **Playful:** a time-of-day greeting with a highlighter swipe on "friend", a summary that says what is
  due today or overdue, buttons with a hard bottom edge that press down (`box-shadow`, so nothing
  shifts), a glyph by each column name, cards that lift on hover, and a sparkle on a card for 1.2
  seconds after it is finished. Motion only inside `prefers-reduced-motion: no-preference`.
- **Minimal:** a plain title, flat column headings with a small colour dot, and no extras.
- Both share every colour, so a colour change is made once. Anything new that moves, sparkles, or
  shows off belongs to Playful only; Minimal stays calm.

## Colour rules

- Each board column has its own colour: Inbox lilac, Later sand, Next sky,
  Now rose, In progress teal, Done slate.
- Rejected is set apart: a dark ink tab with cream text and a dashed panel
  under the board, collapsed until opened.
- **No column colour may match a priority colour.** Priorities own tangerine
  (high), butter (medium), and sage (low). Check this when adding any colour.
- Priority is never colour alone. It always shows a shape and a word:
  `▲ high`, `◆ med`, `▼ low`. A footer toggle swaps in a colour-blind palette
  (blue, yellow, grey) through `data-palette="cb"`, remembered in localStorage.
- Dark mode redefines the variables. A footer switch (Auto, Light, Dark) can
  override the system, so the dark colours live in **two places in `web/style.css`
  that must stay in sync**: `:root:not([data-theme="light"])` inside
  `prefers-color-scheme: dark` (Auto on a dark system), and `:root[data-theme="dark"]`.
  The choice is the `data-theme` attribute on `<html>`, saved in localStorage as
  `theme`. `web/theme.js` is a classic script in the head that sets the attribute
  before the page is drawn, so there is no flash of the wrong colours (the
  security headers forbid inline scripts, so it has to be a file).
  Column tabs use `--tab-ink` so their text stays readable on both.

## Controls

- Do not use a native `<select>` or `<input type="date">`: their pop-ups cannot
  be styled. Build the control instead:
  - Move is a `<details>` menu with coloured dots, a ✓ on the current column,
    Escape to close, and a click outside to close. Rejected is its last item, and
    the only way to reject a task.
  - Priority in the task form is a row of toggle buttons (`role="group"`,
    `aria-pressed`), like the Sort control. Hovering or selecting a priority shows
    its own colour (tangerine, butter, sage), so people see what they will get.
    None is a neutral tan, so butter only ever means medium.
  - Due date is a text field that takes `YYYY-MM-DD`. Clicking it (or pressing ↓)
    opens a small inline calendar (`web/calendar.mjs`: Monday first, today outlined).
    It stays open while you pick, so people can try dates: picking a day, Today,
    Clear, and the month arrows do not close it. Only Done or Escape closes it
    (Escape closes just the calendar, not the dialog). It follows what you type.
    Typing is validated.
- Collapsible panels (Inbox, Rejected) show a triangle drawn in CSS, so it sits
  level with the heading text; it points right when closed and down when open. A panel
  a task has just moved into opens by itself, so the person sees where it went.
- Buttons inside a `<summary>` must call `preventDefault()` and
  `stopPropagation()`, or they also toggle the section.
- Dialogs are `<dialog>` elements opened with `showModal()`. The notes drawer
  is the same element styled as a side panel.
- **The rule: clicking outside any pop-up closes it.** That covers the Move menu,
  the calendar, the task dialog, and the notes drawer. Layers close one at a time
  (a click on the backdrop closes the calendar first, then the dialog on the
  next click). Escape does the same. The one exception: if closing would throw
  away what someone typed (an edited task dialog, a note draft, an open note
  edit), stay open and say why in the dialog's status line.
- Use `onOutsideClick(dialog, handler)` for dialogs. It only fires when the
  press and the release were both on the backdrop, so selecting text and letting
  go outside never closes anything, and a keyboard-triggered click never counts.
- No icon fonts or images. Use plain characters and the odd emoji.

## Accessibility

- Every button whose text is not enough gets an `aria-label` that names the
  task (`Edit: <title>`).
- Keep the 3px tangerine focus ring. Status messages use `role="status"`.
- Respect `prefers-reduced-motion`: animate only inside
  `@media (prefers-reduced-motion: no-preference)`.
- Phone width is not a priority, but it must not look broken: cards never overflow their column
  (button rows wrap), button labels never wrap inside themselves (`white-space: nowrap`), and on
  narrow screens the search field gets its own row and the sort buttons wrap as a group.

## Voice

Sentence case. Short and warm. Say what happened, then what to do.
Skip "please", "successfully", and exclamation marks on system messages.
Empty states invite ("Nothing here. Enjoy it."). Permanent actions say so:
"Delete … for good? This can't be undone."

## Bugs worth remembering

When a click handler redraws the control that was clicked (the calendar's month
arrows), the clicked button is gone by the time a "click outside" check runs, so
`contains(event.target)` says it was outside. Read `event.composedPath()` instead:
it is captured when the click happens.

Browsers run microtasks between event listeners, so a flag cleared with
`queueMicrotask` is gone before the next listener on the same click sees it. To
tell two listeners "this click was already handled", remember the event object
itself and compare it.

A click made in code (`element.click()`) or from the keyboard reports position
(0, 0). Never decide "outside" from the position alone; check that a mouse press
really started outside, and test with real mouse clicks.
