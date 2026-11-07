import { filterTasks, sortTasks } from './search.mjs';

const boardElement = document.querySelector('#board');
const intakeElement = document.querySelector('#intake');
const rejectedElement = document.querySelector('#rejected');
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
const taskDue = document.querySelector('#new-task-due');
const taskPriority = document.querySelector('#new-task-priority');
const paletteButton = document.querySelector('#palette');
const taskDelete = document.querySelector('#task-delete');
const taskHeading = document.querySelector('#task-heading');
const taskHelp = document.querySelector('#task-help');
let editTarget = null;
const labels = { Backlog: 'Later', 'In Progress': 'In progress' };
const descriptions = { Backlog: 'Someday, maybe', Next: 'Coming into focus', Now: 'Ready for you', 'In Progress': 'Already in motion', Done: 'Look at you go' };
let board;
let busy = false;
let dragging = false;
let noteTask;
let noteCounts = {};
let sortMode = 'file';
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
    for (const note of result.notes) notesList.append(noteEntry(note, id));
  } catch (error) {
    if (noteDialog.open && noteTask.id === id) notesList.textContent = `Cannot load notes: ${error.message}`;
  }
}

const post = (url, body) => request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function loadNoteCounts() {
  try { noteCounts = (await request('/api/note-counts')).counts; } catch { /* the cards just show no count */ }
}

async function updateNoteCounts() {
  await loadNoteCounts();
  if (board) render();
}

function setNoteStatus(text, isError = false) {
  noteStatus.textContent = text;
  noteStatus.classList.toggle('error', isError);
}

// Notes the board wrote can be edited or deleted. Notes written by hand in Obsidian are shown as they are.
function noteEntry(note, id) {
  const entry = element('article', 'saved-note');
  const head = element('div', 'saved-note-head');
  const source = element('a', 'note-link', `${note.date}${note.time ? ` · ${note.time}` : ''}`);
  source.href = noteLink(note.file.replace(/\.md$/, ''));
  head.append(source);
  const content = element('p', 'saved-note-text');
  appendText(content, note.text);
  if (note.noteId) {
    const actions = element('div', 'saved-note-actions');
    const edit = element('button', '', 'Edit');
    const remove = element('button', 'note-delete', 'Delete');
    edit.type = remove.type = 'button';
    edit.addEventListener('click', () => editNote(entry, content, actions, note, id));
    remove.addEventListener('click', () => deleteNote(note, id));
    actions.append(edit, remove);
    head.append(actions);
  } else head.append(element('span', 'saved-note-tag', 'written in Obsidian'));
  entry.append(head, content);
  return entry;
}

function editNote(entry, content, actions, note, id) {
  const box = element('textarea', 'note-edit');
  box.value = note.text;
  box.rows = 4;
  box.maxLength = 8000;
  box.setAttribute('aria-label', 'Edit note');
  const save = element('button', '', 'Save');
  const cancel = element('button', '', 'Cancel');
  save.type = cancel.type = 'button';
  const row = element('div', 'note-edit-actions');
  row.append(cancel, save);
  actions.hidden = true;
  content.replaceWith(box);
  entry.append(row);
  box.focus();
  cancel.addEventListener('click', () => loadNoteHistory(id));
  save.addEventListener('click', async () => {
    if (!box.value.trim()) { setNoteStatus("A note can't be empty. Delete it instead.", true); box.focus(); return; }
    save.disabled = cancel.disabled = true;
    try {
      await post('/api/notes/edit', { noteId: note.noteId, text: box.value });
      setNoteStatus('Note saved');
      await loadNoteHistory(id);
    } catch (error) {
      setNoteStatus(error.message, true);
      save.disabled = cancel.disabled = false;
    }
  });
}

async function deleteNote(note, id) {
  if (!confirm("Delete this note for good? This can't be undone.")) return;
  try {
    await post('/api/notes/delete', { noteId: note.noteId });
    setNoteStatus('Note deleted');
    await loadNoteHistory(id);
    await updateNoteCounts();
  } catch (error) {
    setNoteStatus(error.message, true);
  }
}

const priorities = { high: ['▲', 'high'], medium: ['◆', 'med'], low: ['▼', 'low'] };

// Turns a stored YYYY-MM-DD date into a short friendly label, using the viewer's local calendar day.
export function dueLabel(due, today = new Date()) {
  const [year, month, day] = due.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1) return { text: due, late: false };
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((date - start) / 86400000);
  if (days < 0) {
    const ago = -days;
    return { text: ago < 7 ? `${ago}d late` : `${Math.floor(ago / 7)}w late`, late: true };
  }
  if (days === 0) return { text: 'today', late: false };
  if (days === 1) return { text: 'tomorrow', late: false };
  if (days < 7) return { text: date.toLocaleDateString([], { weekday: 'short' }).toLowerCase(), late: false };
  const options = { month: 'short', day: 'numeric', ...(year !== start.getFullYear() && { year: 'numeric' }) };
  return { text: date.toLocaleDateString([], options).toLowerCase(), late: false };
}

function dueChip(due, checked) {
  const full = new Date(...[...due.split('-').map(Number)].map((part, index) => index === 1 ? part - 1 : part));
  const fullText = full.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  if (checked) {
    const chip = element('span', 'chip due-done', due);
    chip.title = fullText;
    return chip;
  }
  const { text, late } = dueLabel(due);
  const chip = element('span', `chip due${late ? ' late' : text === 'today' ? ' today' : ''}`, text);
  chip.title = fullText;
  return chip;
}

// A small menu in the app's own style, in place of the browser's native dropdown.
function moveMenu(task, text) {
  const menu = element('details', 'move-menu');
  const button = element('summary', 'move-button', `Move: ${labels[task.section] || task.section}`);
  button.setAttribute('aria-label', `Move task: ${text}`);
  const list = element('div', 'menu-list');
  for (const name of [...board.columns.filter(column => column !== 'Rejected'), 'Rejected']) {
    const item = element('button', `menu-item column-${name.toLowerCase().replaceAll(' ', '-')}`);
    item.type = 'button';
    const current = name === task.section;
    item.append(element('span', 'column-dot'), element('span', 'menu-name', labels[name] || name));
    if (current) {
      item.append(element('span', 'menu-check', '✓'));
      item.setAttribute('aria-current', 'true');
    }
    item.addEventListener('click', () => {
      menu.open = false;
      if (!current) move(task, name);
    });
    list.append(item);
  }
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { menu.open = false; button.focus(); }
  });
  menu.append(button, list);
  return menu;
}

function card(task) {
  const rejected = task.section === 'Rejected';
  const node = element('article', `card${task.checked ? ' checked' : ''}${rejected ? ' rejected' : ''}`);
  node.draggable = true;
  const text = task.title ?? task.text;
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
  if (task.due || task.priority) {
    const chips = element('div', 'chips');
    if (task.due) {
      const due = dueChip(task.due, task.checked);
      chips.append(due);
    }
    if (task.priority) {
      const [symbol, word] = priorities[task.priority];
      chips.append(element('span', `chip priority-${task.priority}`, `${symbol} ${word}`));
    }
    node.append(chips);
  }
  if (task.end > task.line + 1) node.append(element('p', 'detail-hint', 'More detail in TODO.md'));
  const foot = element('div', 'card-foot');
  const actions = element('div', 'foot-actions');
  if (task.id) {
    const addNote = element('button', 'add-note', noteCounts[task.id] ? `Notes · ${noteCounts[task.id]}` : 'Notes');
    addNote.type = 'button';
    addNote.disabled = busy;
    addNote.setAttribute('aria-label', `Notes for ${text}`);
    addNote.addEventListener('click', () => {
      noteTask = task;
      noteRequestId = crypto.randomUUID();
      noteText.value = '';
      noteStatus.textContent = '';
      noteStatus.classList.remove('error');
      document.querySelector('#note-task').textContent = text;
      noteDialog.showModal();
      noteText.focus();
      loadNoteHistory(task.id);
    });
    actions.append(addNote);
  }
  const edit = element('button', 'edit', 'Edit');
  edit.type = 'button';
  edit.setAttribute('aria-label', `Edit: ${text}`);
  edit.addEventListener('click', () => openEditor(task));
  actions.append(edit);
  if (task.section === 'Inbox') {
    const reject = element('button', 'reject', 'Reject');
    reject.type = 'button';
    reject.setAttribute('aria-label', `Reject: ${text}`);
    reject.addEventListener('click', () => move(task, 'Rejected'));
    actions.append(reject);
  }
  foot.append(actions);
  if (rejected) {
    const restore = element('button', 'restore', '↩ Restore');
    restore.type = 'button';
    restore.setAttribute('aria-label', `Restore to Inbox: ${text}`);
    restore.addEventListener('click', () => move(task, 'Inbox'));
    foot.append(restore);
  } else foot.append(moveMenu(task, text));
  node.append(foot);
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
  const expanded = new Set([...document.querySelectorAll('#intake details[open], #rejected details[open]')].map(node => node.dataset.section));
  boardElement.replaceChildren();
  intakeElement.replaceChildren();
  rejectedElement.replaceChildren();
  document.querySelector('#open-note').href = noteLink('TODO');
  const done = board.tasks.filter(task => task.checked).length;
  const rejectedCount = board.tasks.filter(task => task.section === 'Rejected').length;
  document.querySelector('#total').textContent = `${board.tasks.length - done - rejectedCount} open · ${done} complete`;
  const searching = Boolean(searchInput.value.trim());
  const matching = filterTasks(board.tasks, searchInput.value);
  searchClear.hidden = !searchInput.value;
  document.querySelector('#search-count').textContent = searching ? `${matching.length} of ${board.tasks.length} tasks` : `${board.tasks.length} tasks`;
  document.querySelector('#search-empty').hidden = !searching || matching.length > 0;
  for (const name of board.columns) {
    const intake = name === 'Inbox';
    const collapsible = intake || name === 'Rejected';
    const column = element(collapsible ? 'details' : 'section', `column column-${name.toLowerCase().replaceAll(' ', '-')}`);
    const tasks = sortTasks(matching.filter(task => task.section === name), sortMode);
    const heading = element(collapsible ? 'summary' : 'div', 'column-heading');
    heading.append(element('span', 'column-dot'), element('h2', '', labels[name] || name), element('span', 'count', String(tasks.length)));
    if (name === 'Rejected' && rejectedCount) {
      const trash = element('button', 'trash heading-action', '🗑 Delete all');
      trash.type = 'button';
      trash.setAttribute('aria-label', `Delete all ${rejectedCount} rejected tasks`);
      trash.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); deleteRejected(rejectedCount); });
      heading.append(trash);
    }
    if (name === 'Done' && done) {
      const archive = element('button', 'archive heading-action', '📦 Archive all');
      archive.type = 'button';
      archive.setAttribute('aria-label', `Archive all ${done} done tasks`);
      archive.addEventListener('click', () => archiveDoneTasks(done));
      heading.append(archive);
    }
    column.append(heading);
    if (!collapsible) column.append(element('p', 'column-description', descriptions[name]));
    const list = element('div', 'cards');
    if (!tasks.length) list.append(element('p', 'empty', searching ? 'No matches here.' : collapsible ? 'All clear here.' : 'Nothing here. Enjoy it.'));
    for (const task of tasks) list.append(card(task));
    column.append(list);
    column.addEventListener('dragover', event => {
      if (!dragging || busy) return;
      event.preventDefault();
      if (collapsible) column.open = true;
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
    if (collapsible) {
      column.dataset.section = name;
      column.open = searching ? tasks.length > 0 : expanded.has(name);
      (intake ? intakeElement : rejectedElement).append(column);
    } else boardElement.append(column);
  }
  if (focusedTask) {
    [...document.querySelectorAll('.move-button')].find(button => button.getAttribute('aria-label') === focusedTask)?.focus({ preventScroll: true });
  }
}

async function request(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed.');
  return result;
}

async function refresh(manual = false) {
  if (busy || dragging || noteDialog.open || taskDialog.open || (!manual && document.querySelector('.move-menu[open]'))) return;
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

function move(task, target) {
  return save('/api/move', { id: task.id, line: task.line, target }, `Moved to ${labels[target] || target}`);
}

function deleteRejected(count) {
  if (busy) return;
  const what = count === 1 ? '1 rejected task' : `${count} rejected tasks`;
  if (!confirm(`Delete ${what} for good? This can't be undone. Notes in your daily notes stay.`)) return;
  return save('/api/clear-rejected', {}, `Deleted ${what}`);
}

function archiveDoneTasks(count) {
  if (busy) return;
  const what = count === 1 ? '1 done task' : `${count} done tasks`;
  if (!confirm(`Archive ${what}? They move to TASK-ARCHIVE.md in your vault and leave this board.`)) return;
  return save('/api/archive-done', {}, `Archived ${what} to TASK-ARCHIVE.md`);
}

async function save(url, body, done) {
  if (busy) return;
  busy = true;
  refreshButton.disabled = true;
  document.querySelectorAll('.card-foot button, .heading-action').forEach(button => { button.disabled = true; });
  message.classList.remove('error');
  message.textContent = 'Saving to TODO.md…';
  try {
    board = await request(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: board.revision, ...body }),
    });
    message.textContent = `Saved to TODO.md · ${done}`;
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

refreshButton.addEventListener('click', () => { refresh(true); updateNoteCounts(); });
newTaskButton.addEventListener('click', () => {
  if (!board || busy) return;
  taskRevision = board.revision;
  do { newTaskId = `task-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`; }
  while (board.tasks.some(task => task.id === newTaskId));
  editTarget = null;
  taskHeading.textContent = 'New task';
  taskHelp.textContent = "New tasks land in Inbox. Move them when you're ready.";
  taskCreate.textContent = 'Create task';
  taskDelete.hidden = true;
  taskTitle.value = '';
  taskDue.value = '';
  taskPriority.value = '';
  taskStatus.textContent = '';
  taskStatus.classList.remove('error');
  taskDialog.showModal();
  taskTitle.focus();
});

function openEditor(task) {
  if (!board || busy) return;
  editTarget = task;
  taskRevision = board.revision;
  taskHeading.textContent = 'Edit task';
  taskHelp.textContent = 'Changes save to TODO.md. Details under the task stay as they are.';
  taskCreate.textContent = 'Save changes';
  taskDelete.hidden = false;
  taskTitle.value = task.title ?? task.text;
  taskDue.value = task.due || '';
  taskPriority.value = task.priority || '';
  taskStatus.textContent = '';
  taskStatus.classList.remove('error');
  taskDialog.showModal();
  taskTitle.focus();
}

taskDelete.addEventListener('click', async () => {
  if (taskSaving || !editTarget) return;
  const task = editTarget;
  const name = task.title ?? task.text;
  if (!confirm(`Delete "${name}" for good? This can't be undone. Notes in your daily notes stay.`)) return;
  taskSaving = true;
  taskDelete.disabled = true;
  taskCreate.disabled = true;
  taskCancel.disabled = true;
  try {
    board = await request('/api/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: taskRevision, id: task.id, line: task.line }),
    });
    taskDialog.close();
    render();
    message.textContent = `Saved to TODO.md · Deleted ${name}`;
    message.classList.remove('error');
  } catch (error) {
    try { board = await request('/api/board'); } catch {}
    taskDialog.close();
    message.textContent = error.message;
    message.classList.add('error');
  } finally {
    taskSaving = false;
    taskDelete.disabled = false;
    taskCreate.disabled = false;
    taskCancel.disabled = false;
  }
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
    const editing = editTarget;
    board = await request(editing ? '/api/edit' : '/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing
        ? { revision: taskRevision, id: editing.id, line: editing.line, title, due: taskDue.value || null, priority: taskPriority.value || null }
        : { revision: taskRevision, id: newTaskId, title, due: taskDue.value || undefined, priority: taskPriority.value || undefined }),
    });
    if (!editing) searchInput.value = '';
    taskDialog.close();
    render();
    if (!editing) intakeElement.querySelector('.column-inbox').open = true;
    message.textContent = editing ? `Saved to TODO.md · Edited ${title}` : `Created in Inbox · ${title}`;
    message.classList.remove('error');
  } catch (error) {
    try {
      board = await request('/api/board');
      taskRevision = board.revision;
    } catch {}
    if (editTarget) {
      // The file changed under the open task, so its position may have moved. Close rather than risk editing the wrong line.
      taskDialog.close();
      message.textContent = error.message;
      message.classList.add('error');
    } else {
      taskStatus.textContent = error.message;
      taskStatus.classList.add('error');
    }
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
    await updateNoteCounts();
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
function setPalette(colourBlind) {
  document.documentElement.dataset.palette = colourBlind ? 'cb' : '';
  paletteButton.setAttribute('aria-pressed', String(colourBlind));
  paletteButton.textContent = `Colour-blind palette: ${colourBlind ? 'on' : 'off'}`;
}
try { setPalette(localStorage.getItem('palette') === 'cb'); } catch { setPalette(false); }
paletteButton.addEventListener('click', () => {
  const next = paletteButton.getAttribute('aria-pressed') !== 'true';
  setPalette(next);
  try { localStorage.setItem('palette', next ? 'cb' : ''); } catch {}
});
function setSort(mode) {
  sortMode = ['file', 'priority', 'due'].includes(mode) ? mode : 'file';
  document.querySelectorAll('.sort button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sort === sortMode)));
}
try { setSort(localStorage.getItem('sort')); } catch { setSort('file'); }
document.querySelectorAll('.sort button').forEach(button => button.addEventListener('click', () => {
  setSort(button.dataset.sort);
  try { localStorage.setItem('sort', sortMode); } catch {}
  if (board) render();
}));
document.addEventListener('click', event => {
  document.querySelectorAll('.move-menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
});
window.addEventListener('focus', () => refresh());
refresh();
updateNoteCounts();
setInterval(() => refresh(), 5000);
