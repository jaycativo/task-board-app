import { filterTasks } from './search.mjs';

const boardElement = document.querySelector('#board');
const intakeElement = document.querySelector('#intake');
const message = document.querySelector('#message');
const refreshButton = document.querySelector('#refresh');
const noteDialog = document.querySelector('#note-dialog');
const noteText = document.querySelector('#note-text');
const noteStatus = document.querySelector('#note-status');
const noteSave = document.querySelector('#note-save');
const noteCancel = document.querySelector('#note-cancel');
const notesList = document.querySelector('#notes-list');
const searchInput = document.querySelector('#task-search');
const searchClear = document.querySelector('#search-clear');
const newTaskButton = document.querySelector('#new-task');
const taskDialog = document.querySelector('#task-dialog');
const taskTitle = document.querySelector('#new-task-title');
const taskStatus = document.querySelector('#task-status');
const taskCreate = document.querySelector('#task-create');
const taskCancel = document.querySelector('#task-cancel');
const labels = { Backlog: 'Later', 'In Progress': 'In progress' };
const descriptions = { Backlog: 'Room for a future idea', Next: 'Coming into focus', Now: 'Ready for your attention', 'In Progress': 'Already in motion', Done: 'A little more complete' };
let board;
let busy = false;
let dragging = false;
let noteTask;
let noteRequestId;
let noteSaving = false;
let taskSaving = false;
let taskRevision;
let newTaskId;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function noteLink(note) {
  return `obsidian://open?vault=${encodeURIComponent(board.vault)}&file=${encodeURIComponent(note)}`;
}

function appendText(parent, text) {
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

async function loadNoteHistory(id) {
  notesList.textContent = 'Loading notes…';
  try {
    const result = await request(`/api/notes?id=${encodeURIComponent(id)}`);
    if (!noteDialog.open || noteTask.id !== id) return;
    notesList.replaceChildren();
    if (!result.notes.length) notesList.append(element('p', 'note-help', 'No notes for this task yet.'));
    for (const note of result.notes) {
      const entry = element('article', 'saved-note');
      const source = element('a', 'note-link', `${note.date}${note.time ? ` · ${note.time}` : ''}`);
      source.href = noteLink(note.file.replace(/\.md$/, ''));
      const content = element('p', 'saved-note-text');
      appendText(content, note.text);
      entry.append(source, content);
      notesList.append(entry);
    }
  } catch (error) {
    if (noteDialog.open && noteTask.id === id) notesList.textContent = `Cannot load notes: ${error.message}`;
  }
}

function card(task) {
  const node = element('article', `card${task.checked ? ' checked' : ''}`);
  node.draggable = true;
  const title = element('p', 'task-title');
  const split = task.text.lastIndexOf(' — ');
  const hasSources = split >= 0 && /^(\[\[.*?\]\])(,\s*\[\[.*?\]\])*$/.test(task.text.slice(split + 3));
  appendText(title, hasSources ? task.text.slice(0, split) : task.text);
  node.append(title);
  if (task.id) {
    const identity = element('div', 'task-identity');
    const link = element('a', 'task-id', task.id);
    link.href = noteLink(`TODO#^${task.id}`);
    link.title = 'Open this task in Obsidian';
    link.draggable = false;
    const copy = element('button', 'copy-link', 'Copy link');
    copy.type = 'button';
    copy.setAttribute('aria-label', `Copy link to ${task.id}`);
    copy.addEventListener('click', async () => {
      const text = `[[TODO#^${task.id}]]`;
      try {
        await navigator.clipboard.writeText(text);
        message.textContent = `Copied ${text}`;
        message.classList.remove('error');
      } catch {
        message.textContent = `Cannot copy. Select this link and copy it: ${text}`;
        message.classList.add('error');
      }
    });
    identity.append(link, copy);
    node.append(identity);
    const addNote = element('button', 'add-note', 'Notes / Add note');
    addNote.type = 'button';
    addNote.disabled = busy;
    addNote.setAttribute('aria-label', `Notes for ${task.id}`);
    addNote.addEventListener('click', () => {
      noteTask = task;
      noteRequestId = crypto.randomUUID();
      noteText.value = '';
      noteStatus.textContent = '';
      noteStatus.classList.remove('error');
      document.querySelector('#note-task').textContent = task.text;
      noteDialog.showModal();
      noteText.focus();
      loadNoteHistory(task.id);
    });
    node.append(addNote);
  }
  if (hasSources) {
    const sources = element('p', 'sources');
    appendText(sources, task.text.slice(split + 3));
    node.append(sources);
  }
  if (task.end > task.line + 1) node.append(element('p', 'detail-hint', 'More detail in TODO.md'));
  const controls = element('div', 'card-controls');
  controls.append(element('span', 'card-marker', task.checked ? '✓ Complete' : '⋮⋮'));
  const label = element('label', 'move-label', 'Move ');
  const select = element('select');
  select.setAttribute('aria-label', `Move task: ${task.text}`);
  for (const name of board.columns) {
    const option = element('option', '', labels[name] || name);
    option.value = name;
    option.selected = name === task.section;
    select.append(option);
  }
  select.disabled = busy;
  select.addEventListener('change', () => move(task, select.value));
  label.append(select);
  controls.append(label);
  node.append(controls);
  node.addEventListener('dragstart', event => {
    if (busy) { event.preventDefault(); return; }
    dragging = true;
    event.dataTransfer.setData('text/plain', String(task.line));
    event.dataTransfer.effectAllowed = 'move';
    node.classList.add('dragging');
  });
  node.addEventListener('dragend', () => {
    dragging = false;
    node.classList.remove('dragging');
    document.querySelectorAll('.drop-target').forEach(column => column.classList.remove('drop-target'));
  });
  return node;
}

function render() {
  newTaskButton.disabled = busy;
  const active = document.activeElement;
  const focusedTask = active?.getAttribute('aria-label');
  const expanded = new Set([...intakeElement.querySelectorAll('details[open]')].map(node => node.dataset.section));
  boardElement.replaceChildren();
  intakeElement.replaceChildren();
  document.querySelector('#open-note').href = noteLink('TODO');
  const done = board.tasks.filter(task => task.checked).length;
  document.querySelector('#total').textContent = `${board.tasks.length - done} open · ${done} complete`;
  const searching = Boolean(searchInput.value.trim());
  const matching = filterTasks(board.tasks, searchInput.value);
  searchClear.hidden = !searchInput.value;
  document.querySelector('#search-count').textContent = searching ? `${matching.length} of ${board.tasks.length} tasks` : `${board.tasks.length} tasks`;
  document.querySelector('#search-empty').hidden = !searching || matching.length > 0;
  for (const name of board.columns) {
    const intake = ['Inbox', 'Suggestions'].includes(name);
    const column = element(intake ? 'details' : 'section', `column column-${name.toLowerCase().replaceAll(' ', '-')}`);
    const tasks = matching.filter(task => task.section === name);
    const heading = element(intake ? 'summary' : 'div', 'column-heading');
    heading.append(element('span', 'column-dot'), element('h2', '', labels[name] || name), element('span', 'count', String(tasks.length)));
    column.append(heading);
    if (!intake) column.append(element('p', 'column-description', descriptions[name]));
    const list = element('div', 'cards');
    if (!tasks.length) list.append(element('p', 'empty', searching ? 'No matches here.' : intake ? 'All clear here.' : 'A little room to breathe.'));
    for (const task of tasks) list.append(card(task));
    column.append(list);
    column.addEventListener('dragover', event => {
      if (!dragging || busy) return;
      event.preventDefault();
      if (intake) column.open = true;
      column.classList.add('drop-target');
    });
    column.addEventListener('dragleave', event => { if (!column.contains(event.relatedTarget)) column.classList.remove('drop-target'); });
    column.addEventListener('drop', event => {
      event.preventDefault();
      column.classList.remove('drop-target');
      const line = Number(event.dataTransfer.getData('text/plain'));
      const task = board.tasks.find(item => item.line === line);
      dragging = false;
      if (task) move(task, name);
    });
    if (intake) {
      column.dataset.section = name;
      column.open = searching ? tasks.length > 0 : expanded.has(name);
      intakeElement.append(column);
    } else boardElement.append(column);
  }
  if (focusedTask) {
    [...document.querySelectorAll('select')].find(select => select.getAttribute('aria-label') === focusedTask)?.focus({ preventScroll: true });
  }
}

async function request(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed.');
  return result;
}

async function refresh(manual = false) {
  if (busy || dragging || noteDialog.open || taskDialog.open || (!manual && document.activeElement?.tagName === 'SELECT')) return;
  try {
    const result = await request('/api/board');
    if (busy || dragging || noteDialog.open || taskDialog.open) return;
    const changed = result.revision !== board?.revision;
    board = result;
    if (changed) render();
    if (manual || changed || message.classList.contains('error')) {
      message.textContent = `Up to date · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      message.classList.remove('error');
    }
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

async function move(task, target) {
  if (busy) return;
  busy = true;
  refreshButton.disabled = true;
  document.querySelectorAll('select').forEach(select => { select.disabled = true; });
  message.classList.remove('error');
  message.textContent = 'Saving to TODO.md…';
  try {
    board = await request('/api/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: board.revision, id: task.id, line: task.line, target }),
    });
    message.textContent = `Saved to TODO.md · Moved to ${labels[target] || target}`;
  } catch (error) {
    try { board = await request('/api/board'); } catch {}
    message.textContent = error.message;
    message.classList.add('error');
  } finally {
    busy = false;
    refreshButton.disabled = false;
    render();
  }
}

refreshButton.addEventListener('click', () => refresh(true));
newTaskButton.addEventListener('click', () => {
  if (!board || busy) return;
  taskRevision = board.revision;
  do { newTaskId = `task-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`; }
  while (board.tasks.some(task => task.id === newTaskId));
  taskTitle.value = '';
  taskStatus.textContent = '';
  taskStatus.classList.remove('error');
  taskDialog.showModal();
  taskTitle.focus();
});
taskCancel.addEventListener('click', () => taskDialog.close());
taskDialog.addEventListener('cancel', event => { if (taskSaving) event.preventDefault(); });
taskDialog.addEventListener('close', () => { if (board) render(); });
document.querySelector('#task-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (taskSaving) return;
  const title = taskTitle.value.trim();
  if (!title) {
    taskStatus.textContent = 'Enter a task title before saving.';
    taskStatus.classList.add('error');
    taskTitle.focus();
    return;
  }
  taskSaving = true;
  taskCreate.disabled = true;
  taskCancel.disabled = true;
  taskTitle.readOnly = true;
  taskStatus.textContent = 'Saving to TODO.md…';
  taskStatus.classList.remove('error');
  try {
    board = await request('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: taskRevision, id: newTaskId, title }),
    });
    searchInput.value = '';
    taskDialog.close();
    render();
    intakeElement.querySelector('.column-inbox').open = true;
    message.textContent = `Created in Inbox · ${title}`;
    message.classList.remove('error');
  } catch (error) {
    try {
      board = await request('/api/board');
      taskRevision = board.revision;
    } catch {}
    taskStatus.textContent = error.message;
    taskStatus.classList.add('error');
  } finally {
    taskSaving = false;
    taskCreate.disabled = false;
    taskCancel.disabled = false;
    taskTitle.readOnly = false;
  }
});
searchInput.addEventListener('input', () => { if (board) render(); });
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  if (board) render();
  searchInput.focus();
});
searchInput.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    searchInput.value = '';
    if (board) render();
  }
});
noteCancel.addEventListener('click', () => noteDialog.close());
document.querySelector('#notes-refresh').addEventListener('click', () => loadNoteHistory(noteTask.id));
noteDialog.addEventListener('cancel', event => { if (noteSaving) event.preventDefault(); });
document.querySelector('#note-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (noteSaving) return;
  if (!noteText.value.trim()) {
    noteStatus.textContent = 'Enter a note before saving.';
    noteStatus.classList.add('error');
    noteText.focus();
    return;
  }
  noteSaving = true;
  noteSave.disabled = true;
  noteCancel.disabled = true;
  noteText.readOnly = true;
  noteStatus.classList.remove('error');
  noteStatus.textContent = 'Saving to your daily note…';
  try {
    const result = await request('/api/notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: noteTask.id, text: noteText.value, requestId: noteRequestId }),
    });
    noteText.value = '';
    noteRequestId = crypto.randomUUID();
    const link = element('a', 'note-link', result.file);
    link.href = noteLink(result.file.replace(/\.md$/, ''));
    message.replaceChildren(document.createTextNode('Saved to '), link);
    message.classList.remove('error');
    noteStatus.textContent = `Saved to ${result.file}`;
    await loadNoteHistory(noteTask.id);
  } catch (error) {
    noteStatus.textContent = error.message;
    noteStatus.classList.add('error');
  } finally {
    noteSaving = false;
    noteSave.disabled = false;
    noteCancel.disabled = false;
    noteText.readOnly = false;
  }
});
window.addEventListener('focus', () => refresh());
refresh();
setInterval(() => refresh(), 5000);
