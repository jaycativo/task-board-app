// Drawing the board: the header counts, the columns, and the cards.
// It never changes anything itself. When someone acts, it calls one of the handlers it was given.
import { filterTasks, filterByTags, tagCounts, sortTasks } from './search.mjs';
import { dueLabel, fullDate } from './dates.mjs';
import { greeting, summaryLine } from './summary.mjs';
import { element, appendText, noteLink } from './dom.js';
import { state } from './state.js';

const labels = { Backlog: 'Later', 'In Progress': 'In progress' };
const descriptions = { Backlog: 'Someday, maybe', Next: 'Coming into focus', Now: 'Ready for you', 'In Progress': 'Already in motion', Done: 'Look at you go' };
const priorities = { high: ['▲', 'high'], medium: ['◆', 'med'], low: ['▼', 'low'] };

// The name people see for a column ("Later" for Backlog).
export const columnLabel = name => labels[name] || name;
const slug = name => name.toLowerCase().replaceAll(' ', '-');

// handlers: onMove(task, column), onEdit(task), onNotes(task, title), onArchive(count), onDeleteRejected(count),
// onTag(tag) to filter by a tag, onSubtask(task, action, details) with action 'add', 'toggle' or 'delete'
export function createBoardView({ onMove, onEdit, onNotes, onArchive, onDeleteRejected, onTag, onSubtask }) {
  const boardElement = document.querySelector('#board');
  const intakeElement = document.querySelector('#intake');
  const rejectedElement = document.querySelector('#rejected');
  const searchInput = document.querySelector('#task-search');
  const searchClear = document.querySelector('#search-clear');
  const newTaskButton = document.querySelector('#new-task');
  const wantOpen = new Set(); // panels to open on the next draw, so people see where a task went
  const celebrating = new Map(); // tasks that just finished, and when their sparkle ends
  const title = document.querySelector('#title');
  const tagBar = document.querySelector('#tag-bar');
  const keyOf = task => task.id || task.title;

  function dueChip(due, checked) {
    if (checked) {
      const chip = element('span', 'chip due-done', due);
      chip.title = fullDate(due);
      return chip;
    }
    const { text, late } = dueLabel(due);
    const chip = element('span', `chip due${late ? ' late' : text === 'today' ? ' today' : ''}`, text);
    chip.title = fullDate(due);
    return chip;
  }

  // A small menu in the app's own style, in place of the browser's native dropdown.
  function moveMenu(task, text) {
    const menu = element('details', 'move-menu');
    const button = element('summary', 'move-button', `Move: ${columnLabel(task.section)}`);
    button.setAttribute('aria-label', `Move task: ${text}`);
    const list = element('div', 'menu-list');
    for (const name of [...state.board.columns.filter(column => column !== 'Rejected'), 'Rejected']) {
      const item = element('button', `menu-item accent-${slug(name)}`);
      item.type = 'button';
      const current = name === task.section;
      item.append(element('span', 'column-dot'), element('span', 'menu-name', columnLabel(name)));
      if (current) {
        item.append(element('span', 'menu-check', '✓'));
        item.setAttribute('aria-current', 'true');
      }
      item.addEventListener('click', () => {
        menu.open = false;
        if (!current) onMove(task, name);
      });
      list.append(item);
    }
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') { menu.open = false; button.focus(); }
    });
    menu.append(button, list);
    return menu;
  }

  // A tag as a button. Pressing it filters the board by that tag.
  function tagButton(tag, className) {
    const button = element('button', `${className}${state.tagFilter.includes(tag) ? ' active' : ''}`, `#${tag}`);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(state.tagFilter.includes(tag)));
    button.title = state.tagFilter.includes(tag) ? `Stop filtering by #${tag}` : `Show only #${tag}`;
    button.addEventListener('click', () => onTag(tag));
    return button;
  }

  // The sub-tasks under a card: a tick list, and a field to add another.
  function subtaskList(task, taskText) {
    const box = element('div', 'subtasks');
    const subtasks = task.subtasks || [];
    if (subtasks.length) {
      const done = subtasks.filter(item => item.checked).length;
      box.append(element('p', 'subtask-progress', `Sub-tasks · ${done} of ${subtasks.length}`));
      const list = element('ul', 'subtask-list');
      for (const item of subtasks) {
        const row = element('li', `subtask${item.checked ? ' checked' : ''}`);
        const label = element('label');
        const tick = element('input');
        tick.type = 'checkbox';
        tick.checked = item.checked;
        tick.setAttribute('aria-label', `Sub-task: ${item.text}`);
        tick.addEventListener('change', () => onSubtask(task, 'toggle', { index: item.index }));
        const words = element('span', 'subtask-text');
        appendText(words, item.text);
        label.append(tick, words);
        const remove = taskButton('subtask-remove', '×', `Delete sub-task: ${item.text}`, () => onSubtask(task, 'delete', { index: item.index, title: item.text }));
        row.append(label, remove);
        list.append(row);
      }
      box.append(list);
    }
    const form = element('form', 'subtask-add');
    const field = element('input');
    field.type = 'text';
    field.maxLength = 2000;
    field.placeholder = 'Add a sub-task';
    field.dataset.addFor = keyOf(task);
    field.setAttribute('aria-label', `Add a sub-task to: ${taskText}`);
    const add = element('button', '', 'Add');
    add.type = 'submit';
    form.append(field, add);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const title = field.value.trim();
      if (title) onSubtask(task, 'add', { title });
    });
    box.append(form);
    return box;
  }

  function taskButton(className, label, ariaLabel, onClick) {
    const button = element('button', className, label);
    button.type = 'button';
    button.setAttribute('aria-label', ariaLabel);
    button.addEventListener('click', onClick);
    return button;
  }

  function card(task) {
    const rejected = task.section === 'Rejected';
    const node = element('article', `card${task.checked ? ' checked' : ''}${rejected ? ' rejected' : ''}${task.checked && (celebrating.get(keyOf(task)) ?? 0) > Date.now() ? ' just-done' : ''}`);
    node.draggable = true;
    const text = task.title ?? task.text;

    // Title, with " — [[source]]" links shown as a smaller line underneath.
    const title = element('p', 'task-title');
    const split = text.lastIndexOf(' — ');
    const hasSources = split >= 0 && /^(\[\[.*?\]\])(,\s*\[\[.*?\]\])*$/.test(text.slice(split + 3));
    appendText(title, hasSources ? text.slice(0, split) : text);
    node.append(title);
    if (hasSources) {
      const sources = element('p', 'sources');
      appendText(sources, text.slice(split + 3));
      node.append(sources);
    }

    if (task.due || task.priority || task.tags?.length) {
      const chips = element('div', 'chips');
      if (task.due) chips.append(dueChip(task.due, task.checked));
      if (task.priority) {
        const [symbol, word] = priorities[task.priority];
        chips.append(element('span', `chip priority-${task.priority}`, `${symbol} ${word}`));
      }
      for (const tag of task.tags || []) chips.append(tagButton(tag, 'chip tag'));
      node.append(chips);
    }
    node.append(subtaskList(task, text));
    if (task.end - task.line - 1 > (task.subtasks?.length ?? 0)) node.append(element('p', 'detail-hint', 'More detail in TODO.md'));

    const foot = element('div', 'card-foot');
    const actions = element('div', 'foot-actions');
    if (task.id) {
      const count = state.noteCounts[task.id];
      const notes = taskButton('add-note', count ? `Notes · ${count}` : 'Notes', `Notes for ${text}`, () => onNotes(task, text));
      notes.disabled = state.busy;
      actions.append(notes);
    }
    actions.append(taskButton('edit', 'Edit', `Edit: ${text}`, () => onEdit(task)));
    foot.append(actions);
    foot.append(rejected
      ? taskButton('restore', '↩ Restore', `Restore to Inbox: ${text}`, () => onMove(task, 'Inbox'))
      : moveMenu(task, text));
    node.append(foot);

    node.addEventListener('dragstart', event => {
      if (state.busy) { event.preventDefault(); return; }
      state.dragging = true;
      event.dataTransfer.setData('text/plain', String(task.line));
      event.dataTransfer.effectAllowed = 'move';
      node.classList.add('dragging');
    });
    node.addEventListener('dragend', () => {
      state.dragging = false;
      node.classList.remove('dragging');
      document.querySelectorAll('.drop-target').forEach(column => column.classList.remove('drop-target'));
    });
    return node;
  }

  // The greeting and the one-line summary. They change with the clock, so they can be redrawn alone.
  function renderHeader() {
    if (!state.board) return;
    document.querySelector('#total').textContent = summaryLine(state.board.tasks, state.style);
    if (state.style === 'playful') title.replaceChildren(`${greeting()}, `, element('span', 'title-hl', 'friend'));
    else title.textContent = 'good work, friend';
  }

  function headingActions(name, counts) {
    if (name === 'Rejected' && counts.rejected) {
      return taskButton('trash heading-action', '🗑 Delete all', `Delete all ${counts.rejected} rejected tasks`, event => {
        event.preventDefault(); // the button sits in a summary, so it must not also toggle the panel
        event.stopPropagation();
        onDeleteRejected(counts.rejected);
      });
    }
    if (name === 'Done' && counts.done) {
      return taskButton('archive heading-action', '📦 Archive all', `Archive all ${counts.done} done tasks`, () => onArchive(counts.done));
    }
    return null;
  }

  // The row of tags in use. Pressing one filters the board; pressing it again lets go.
  function renderTagBar(tags) {
    tagBar.hidden = !tags.length;
    tagBar.replaceChildren();
    if (!tags.length) return;
    tagBar.append(element('span', 'sort-label', 'Tags'));
    for (const { tag, count } of tags) {
      const button = tagButton(tag, 'tag-filter');
      button.append(element('span', 'tag-count', String(count)));
      tagBar.append(button);
    }
  }

  function render() {
    const { board } = state;
    newTaskButton.disabled = state.busy;
    const focusedTask = document.activeElement?.getAttribute('aria-label');
    const addingTo = document.activeElement?.dataset?.addFor;
    const expanded = new Set([...document.querySelectorAll('#intake details[open], #rejected details[open]')].map(node => node.dataset.section));
    for (const name of wantOpen) expanded.add(name);
    wantOpen.clear();
    boardElement.replaceChildren();
    intakeElement.replaceChildren();
    rejectedElement.replaceChildren();

    const counts = { done: board.tasks.filter(task => task.checked).length, rejected: board.tasks.filter(task => task.section === 'Rejected').length };
    document.querySelector('#open-note').href = noteLink('TODO');
    renderHeader();
    // A tag nobody uses any more cannot filter, so drop it.
    const tags = tagCounts(board.tasks);
    state.tagFilter = state.tagFilter.filter(tag => tags.some(item => item.tag === tag));
    renderTagBar(tags);
    const searching = Boolean(searchInput.value.trim()) || state.tagFilter.length > 0;
    const matching = filterByTags(filterTasks(board.tasks, searchInput.value), state.tagFilter);
    searchClear.hidden = !searchInput.value && !state.tagFilter.length;
    document.querySelector('#search-count').textContent = searching ? `${matching.length} of ${board.tasks.length} tasks` : `${board.tasks.length} tasks`;
    document.querySelector('#search-empty').hidden = !searching || matching.length > 0;

    for (const name of board.columns) {
      const intake = name === 'Inbox';
      const collapsible = intake || name === 'Rejected';
      const column = element(collapsible ? 'details' : 'section', `column column-${slug(name)}`);
      const tasks = sortTasks(matching.filter(task => task.section === name), state.sortMode);

      const heading = element(collapsible ? 'summary' : 'div', 'column-heading');
      if (collapsible) {
        const chevron = element('span', 'chevron');
        chevron.setAttribute('aria-hidden', 'true');
        heading.append(chevron);
      }
      heading.append(element('h2', '', columnLabel(name)), element('span', 'count', String(tasks.length)));
      const action = headingActions(name, counts);
      if (action) heading.append(action);
      column.append(heading);
      if (!collapsible) column.append(element('p', 'column-description', descriptions[name]));

      const list = element('div', 'cards');
      if (!tasks.length) list.append(element('p', 'empty', searching ? 'No matches here.' : collapsible ? 'All clear here.' : 'Nothing here. Enjoy it.'));
      for (const task of tasks) list.append(card(task));
      column.append(list);

      // Dropping a card on a column moves it there.
      column.addEventListener('dragover', event => {
        if (!state.dragging || state.busy) return;
        event.preventDefault();
        if (collapsible) column.open = true;
        column.classList.add('drop-target');
      });
      column.addEventListener('dragleave', event => { if (!column.contains(event.relatedTarget)) column.classList.remove('drop-target'); });
      column.addEventListener('drop', event => {
        event.preventDefault();
        column.classList.remove('drop-target');
        const task = board.tasks.find(item => item.line === Number(event.dataTransfer.getData('text/plain')));
        state.dragging = false;
        if (task) onMove(task, name);
      });

      if (collapsible) {
        column.dataset.section = name;
        column.open = searching ? tasks.length > 0 : expanded.has(name);
        (intake ? intakeElement : rejectedElement).append(column);
      } else boardElement.append(column);
    }
    for (const [key, until] of celebrating) if (until <= Date.now()) celebrating.delete(key);
    if (addingTo) document.querySelector(`.subtask-add input[data-add-for="${CSS.escape(addingTo)}"]`)?.focus({ preventScroll: true });
    else if (focusedTask) {
      [...document.querySelectorAll('.move-button')].find(button => button.getAttribute('aria-label') === focusedTask)?.focus({ preventScroll: true });
    }
  }

  // A click anywhere else closes an open Move menu.
  document.addEventListener('click', event => {
    document.querySelectorAll('.move-menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
  });

  return {
    render,
    renderHeader,
    // Open this panel (Inbox or Rejected) the next time the board is drawn.
    showPanel: name => wantOpen.add(name),
    // Sparkle on this task for a moment (when it has just been finished), however many times the board is redrawn.
    celebrate: task => celebrating.set(keyOf(task), Date.now() + 1200),
    // While a change is being saved, the buttons on the board wait.
    disableActions: () => document.querySelectorAll('.card-foot button, .heading-action, .subtasks input, .subtasks button').forEach(button => { button.disabled = true; }),
  };
}
