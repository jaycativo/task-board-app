---
name: design-system
description: The look, colours, accessibility rules, and voice of the task board ("ink and sunshine"). Read before changing any style, colour, control, or piece of interface text.
---

# Ink and sunshine

Playful, but serious about the work. Warm colour, firm outlines, plain words.

## Look

- Tan page, cream panels, white cards. Colours are CSS variables at the top of
  `style.css`; use them, never raw hex in a rule. Light and dark follow the system.
- Everything is outlined in ink at `1.5px`. Column panels and dialogs get a
  thicker `5px` bottom edge. Corners are `6px` (controls) to `8px` (panels).
- Headings, labels, chips, and buttons use the monospace stack in bold at
  11–12px. Body text is the system sans at 15px.
- Buttons are cream with an ink outline and go butter on hover. The one main
  action on a screen (New task, Create task, Save to daily note) is tangerine.
- Done cards are dashed with strikethrough. Overdue is solid red with white text.

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
- Dark mode redefines the variables under `prefers-color-scheme: dark`. Column
  tabs use `--tab-ink` so their text stays readable on both.

## Controls

- Do not use a native `<select>` for anything on the board: its menu cannot be
  styled. The Move control is a `<details>` menu with coloured dots, a ✓ on the
  current column, Escape to close, and a click outside to close. Rejected is
  its last item, and the only way to reject a task.
  (The priority field in the task form is the one native select.)
- Buttons inside a `<summary>` must call `preventDefault()` and
  `stopPropagation()`, or they also toggle the section.
- Dialogs are `<dialog>` elements opened with `showModal()`. The notes drawer
  is the same element styled as a side panel. Clicking outside it closes it,
  unless that would lose a draft or an open edit.
- No icon fonts or images. Use plain characters and the odd emoji.

## Accessibility

- Every button whose text is not enough gets an `aria-label` that names the
  task (`Edit: <title>`).
- Keep the 3px tangerine focus ring. Status messages use `role="status"`.
- Respect `prefers-reduced-motion`: animate only inside
  `@media (prefers-reduced-motion: no-preference)`.
- Phone width is not a priority, but cards must never overflow their column:
  button rows wrap.

## Voice

Sentence case. Short and warm. Say what happened, then what to do.
Skip "please", "successfully", and exclamation marks on system messages.
Empty states invite ("Nothing here. Enjoy it."). Permanent actions say so:
"Delete … for good? This can't be undone."
