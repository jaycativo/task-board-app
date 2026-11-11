// The page's starting point: it creates the pieces, connects them, and keeps the board fresh.
//   state.js         the shared facts          board-view.js    draws the board and its cards
//   api.js           talking to the server     task-dialog.js   new, edit, and delete a task
//   status.js        the status line           notes-drawer.js  the notes panel
//   preferences.js   theme, palette, sort      date-picker.js   the due date's calendar
import { state } from './state.js';
import { request } from './api.js';
import { showMessage, messageIsError } from './status.js';
import { createBoardView, columnLabel } from './board-view.js';
import { createNotesDrawer } from './notes-drawer.js';
import { createTaskDialog } from './task-dialog.js';
import { initPreferences } from './preferences.js';
import { startClock } from './clock.js';

const refreshButton = document.querySelector('#refresh');
const newTaskButton = document.querySelector('#new-task');
const searchInput = document.querySelector('#task-search');
const searchClear = document.querySelector('#search-clear');

const rerender = () => { if (state.board) view.render(); };

const view = createBoardView({
  onMove: move,
  onEdit: task => taskDialog.openEdit(task),
  onNotes: (task, title) => drawer.open(task, title),
  onArchive: archiveDoneTasks,
  onDeleteRejected: deleteRejected,
  onTag: toggleTag,
  onSubtask: changeSubtask,
});
const drawer = createNotesDrawer({ rerender });
const taskDialog = createTaskDialog({
  rerender,
  // A new task starts in Inbox, so clear any search that would hide it and show the Inbox.
  onCreated: () => { searchInput.value = ''; view.showPanel('Inbox'); },
});
initPreferences({ onSortChange: rerender, onStyleChange: rerender });

// Fetches the board. It waits while something else is going on, so it never redraws under the person.
async function refresh(manual = false) {
  if (state.busy || state.dragging || drawer.isOpen() || taskDialog.isOpen() || (!manual && document.querySelector('.move-menu[open]'))) return;
  try {
    const result = await request('/api/board');
    if (state.busy || state.dragging || drawer.isOpen() || taskDialog.isOpen()) return;
    const changed = result.revision !== state.board?.revision;
    state.board = result;
    if (changed) view.render();
    if (manual || changed || messageIsError()) {
      showMessage(`Up to date · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

// Sends one change to TODO.md. Everything that changes the board goes through here.
async function save(url, body, done) {
  if (state.busy) return;
  state.busy = true;
  refreshButton.disabled = true;
  view.disableActions();
  showMessage('Saving to TODO.md…');
  try {
    state.board = await request(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: state.board.revision, ...body }),
    });
    showMessage(`Saved to TODO.md · ${done}`);
  } catch (error) {
    try { state.board = await request('/api/board'); } catch { /* keep what we had */ }
    showMessage(error.message, true);
  } finally {
    state.busy = false;
    refreshButton.disabled = false;
    view.render();
  }
}

function move(task, target) {
  // Show the panel a task lands in, so the person sees where it went.
  if (target === 'Rejected' || target === 'Inbox') view.showPanel(target);
  if (target === 'Done' && state.style === 'playful') view.celebrate(task);
  return save('/api/move', { id: task.id, line: task.line, target }, `Moved to ${columnLabel(target)}`);
}

function toggleTag(tag) {
  state.tagFilter = state.tagFilter.includes(tag) ? state.tagFilter.filter(item => item !== tag) : [...state.tagFilter, tag];
  rerender();
}

const subtaskRoutes = { add: ['/api/subtasks', 'Added a sub-task'], toggle: ['/api/subtasks/toggle', 'Updated a sub-task'], delete: ['/api/subtasks/delete', 'Deleted a sub-task'] };

function changeSubtask(task, action, details) {
  if (action === 'delete' && !confirm(`Delete the sub-task "${details.title}" for good? This can't be undone.`)) return;
  const [url, done] = subtaskRoutes[action];
  return save(url, { id: task.id, line: task.line, ...details }, done);
}

function deleteRejected(count) {
  if (state.busy) return;
  const what = count === 1 ? '1 rejected task' : `${count} rejected tasks`;
  if (!confirm(`Delete ${what} for good? This can't be undone. Notes in your daily notes stay.`)) return;
  return save('/api/clear-rejected', {}, `Deleted ${what}`);
}

function archiveDoneTasks(count) {
  if (state.busy) return;
  const what = count === 1 ? '1 done task' : `${count} done tasks`;
  if (!confirm(`Archive ${what}? They move to TASK-ARCHIVE.md in your vault and leave this board.`)) return;
  return save('/api/archive-done', {}, `Archived ${what} to TASK-ARCHIVE.md`);
}

refreshButton.addEventListener('click', () => { refresh(true); drawer.updateCounts(); });
newTaskButton.addEventListener('click', () => taskDialog.openNew());
searchInput.addEventListener('input', rerender);
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  state.tagFilter = [];
  rerender();
  searchInput.focus();
});
searchInput.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    searchInput.value = '';
    rerender();
  }
});
window.addEventListener('focus', () => refresh());

startClock({ element: document.querySelector('#clock'), onTick: () => view.renderHeader() });
refresh();
drawer.updateCounts();
setInterval(() => refresh(), 5000);
