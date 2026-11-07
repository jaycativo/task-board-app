// The due date field's calendar. Click the field (or press the down arrow) to open it.
// It stays open while you pick, so you can try dates, until you press Done or Escape.
// Typing still works, and the calendar follows what you type.
import { formatDate, parseDate, monthGrid, shiftMonth } from './calendar.mjs';
import { fullDate } from './dates.mjs';
import { element } from './dom.js';

export function createDatePicker({ input, panel, dialog }) {
  let view = { year: 0, month: 0 };
  let closedBy = null;

  function render(focusKey) {
    const chosen = parseDate(input.value.trim());
    const now = new Date();
    const today = formatDate(now.getFullYear(), now.getMonth(), now.getDate());
    const button = (text, label, onClick, className = '', key = '') => {
      const node = element('button', className, text);
      node.type = 'button';
      if (label) node.setAttribute('aria-label', label);
      if (key) node.dataset.key = key;
      node.addEventListener('click', onClick);
      return node;
    };
    // Picking a date keeps the calendar open so you can try others. Done (or Escape) closes it.
    const pick = (value, key) => {
      input.value = value;
      const picked = parseDate(value);
      if (picked) view = { year: picked.year, month: picked.month };
      render(key);
    };
    const head = element('div', 'cal-head');
    head.append(
      button('‹', 'Previous month', () => { view = shiftMonth(view.year, view.month, -1); render('previous'); }, '', 'previous'),
      element('span', 'cal-title', new Date(view.year, view.month, 1).toLocaleDateString([], { month: 'long', year: 'numeric' }).toLowerCase()),
      button('›', 'Next month', () => { view = shiftMonth(view.year, view.month, 1); render('next'); }, '', 'next'),
    );
    const grid = element('div', 'cal-grid');
    for (const weekday of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) grid.append(element('span', 'cal-weekday', weekday));
    for (const cell of monthGrid(view.year, view.month)) {
      const day = button(String(cell.day), fullDate(cell.value), () => pick(cell.value, `day-${cell.value}`), `cal-day${cell.inMonth ? '' : ' outside'}${cell.value === today ? ' today' : ''}`, `day-${cell.value}`);
      day.setAttribute('aria-pressed', String(Boolean(chosen) && cell.value === formatDate(chosen.year, chosen.month, chosen.day)));
      grid.append(day);
    }
    const foot = element('div', 'cal-foot');
    foot.append(
      button('Today', '', () => pick(today, 'today'), '', 'today'),
      button('Clear', '', () => pick('', 'clear'), '', 'clear'),
      button('Done', 'Close the calendar', () => { close(); input.focus(); }, 'cal-done'),
    );
    panel.replaceChildren(head, grid, foot);
    // Redrawing removes the button that was pressed, so put the focus back on its twin.
    if (focusKey) panel.querySelector(`[data-key="${focusKey}"]`)?.focus();
  }

  function open() {
    const chosen = parseDate(input.value.trim());
    const now = new Date();
    view = { year: chosen?.year ?? now.getFullYear(), month: chosen?.month ?? now.getMonth() };
    render();
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function close() {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }

  input.addEventListener('click', () => { if (panel.hidden) open(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' && panel.hidden) { event.preventDefault(); open(); }
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); event.stopPropagation(); close(); }
  });
  input.addEventListener('input', () => {
    if (panel.hidden) return;
    const typed = parseDate(input.value.trim());
    if (typed) view = { year: typed.year, month: typed.month };
    render();
  });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); input.focus(); }
  });
  // A click anywhere else in the dialog closes the calendar.
  dialog.addEventListener('click', event => {
    // Read the path now: the month arrows redraw the calendar, which removes the button that was clicked.
    const path = event.composedPath();
    if (panel.hidden || path.includes(panel) || path.includes(input)) return;
    close();
    // Remember which click closed it, so the same click does not also close the dialog.
    closedBy = event;
  });

  return { open, close, closedBy: event => event === closedBy };
}
