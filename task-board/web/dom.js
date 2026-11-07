// Small helpers for building the page.
import { state } from './state.js';

// Makes an element. Text is always added as text, never as HTML.
export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// An obsidian:// link to a note in this vault.
export function noteLink(note) {
  return `obsidian://open?vault=${encodeURIComponent(state.board.vault)}&file=${encodeURIComponent(note)}`;
}

// Adds text to an element, turning [[wiki links]] into links that open in Obsidian.
export function appendText(parent, text) {
  for (const part of text.split(/(\[\[.*?\]\])/g)) {
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const [target, alias] = part.slice(2, -2).split('|');
      const link = element('a', 'note-link', alias || target.split('/').pop());
      link.href = noteLink(target);
      link.draggable = false;
      parent.append(link);
    } else parent.append(document.createTextNode(part));
  }
}

// Runs handler when a click both starts and ends outside the dialog's box (on the dimmed backdrop).
// Checking where the press began means selecting text and letting go outside never counts.
export function onOutsideClick(dialog, handler) {
  const outside = event => {
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };
  let startedOutside = false;
  dialog.addEventListener('mousedown', event => { startedOutside = outside(event); });
  // A keyboard press has no mouse press before it, so it can never count as an outside click.
  dialog.addEventListener('keydown', () => { startedOutside = false; });
  dialog.addEventListener('click', event => {
    const started = startedOutside;
    startedOutside = false;
    if (started && outside(event)) handler(event);
  });
}
