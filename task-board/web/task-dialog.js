// The dialog for creating a task, and for editing or deleting one.
import { request, post } from './api.js';
import { onOutsideClick } from './dom.js';
import { parseDate } from './calendar.mjs';
import { createDatePicker } from './date-picker.js';
import { showMessage } from './status.js';
import { state } from './state.js';

export function createTaskDialog({ rerender, onCreated }) {
  const dialog = document.querySelector('#task-dialog');
  const heading = document.querySelector('#task-heading');
  const help = document.querySelector('#task-help');
  const title = document.querySelector('#new-task-title');
  const due = document.querySelector('#new-task-due');
  const status = document.querySelector('#task-status');
  const createButton = document.querySelector('#task-create');
  const cancelButton = document.querySelector('#task-cancel');
  const deleteButton = document.querySelector('#task-delete');
  const priorityGroup = document.querySelector('#new-task-priority');
  const picker = createDatePicker({ input: due, panel: document.querySelector('#calendar'), dialog });

  // The priority control is a row of toggle buttons; this lets the code below read and set it like a field.
  const priority = {
    get value() { return priorityGroup.querySelector('[aria-pressed="true"]')?.dataset.value ?? ''; },
    set value(chosen) { priorityGroup.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === (chosen || '')))); },
  };
  priorityGroup.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button) priority.value = button.dataset.value;
  });

  let editTarget = null;   // the task being edited, or null when creating
  let revision;            // the version of the file this dialog was opened on
  let newTaskId;
  let saving = false;
  let snapshot = '';       // what the fields held when the dialog opened, to tell if anything was typed
  const fieldsNow = () => JSON.stringify([title.value, due.value, priority.value]);

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('error', isError);
  };

  function show({ heading: headingText, help: helpText, createLabel, canDelete }) {
    heading.textContent = headingText;
    help.textContent = helpText;
    createButton.textContent = createLabel;
    deleteButton.hidden = !canDelete;
    picker.close();
    setStatus('');
    snapshot = fieldsNow();
    dialog.showModal();
    title.focus();
  }

  function openNew() {
    if (!state.board || state.busy) return;
    revision = state.board.revision;
    do { newTaskId = `task-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`; }
    while (state.board.tasks.some(task => task.id === newTaskId));
    editTarget = null;
    title.value = '';
    due.value = '';
    priority.value = '';
    show({ heading: 'New task', help: "New tasks land in Inbox. Move them when you're ready.", createLabel: 'Create task', canDelete: false });
  }

  function openEdit(task) {
    if (!state.board || state.busy) return;
    editTarget = task;
    revision = state.board.revision;
    title.value = task.title ?? task.text;
    due.value = task.due || '';
    priority.value = task.priority || '';
    show({ heading: 'Edit task', help: 'Changes save to TODO.md. Details under the task stay as they are.', createLabel: 'Save changes', canDelete: true });
  }

  deleteButton.addEventListener('click', async () => {
    if (saving || !editTarget) return;
    const task = editTarget;
    const name = task.title ?? task.text;
    if (!confirm(`Delete "${name}" for good? This can't be undone. Notes in your daily notes stay.`)) return;
    saving = true;
    deleteButton.disabled = createButton.disabled = cancelButton.disabled = true;
    try {
      state.board = await post('/api/delete', { revision, id: task.id, line: task.line });
      dialog.close();
      rerender();
      showMessage(`Saved to TODO.md · Deleted ${name}`);
    } catch (error) {
      try { state.board = await request('/api/board'); } catch { /* keep what we had */ }
      dialog.close();
      showMessage(error.message, true);
    } finally {
      saving = false;
      deleteButton.disabled = createButton.disabled = cancelButton.disabled = false;
    }
  });

  document.querySelector('#task-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    const text = title.value.trim();
    if (!text) {
      setStatus('Enter a task title before saving.', true);
      title.focus();
      return;
    }
    if (due.value.trim() && !parseDate(due.value.trim())) {
      setStatus('Use the format YYYY-MM-DD, or pick a date.', true);
      due.focus();
      return;
    }
    saving = true;
    createButton.disabled = cancelButton.disabled = true;
    title.readOnly = true;
    setStatus('Saving to TODO.md…');
    try {
      const editing = editTarget;
      state.board = editing
        ? await post('/api/edit', { revision, id: editing.id, line: editing.line, title: text, due: due.value.trim() || null, priority: priority.value || null })
        : await post('/api/tasks', { revision, id: newTaskId, title: text, due: due.value.trim() || undefined, priority: priority.value || undefined });
      if (!editing) onCreated();
      dialog.close();
      rerender();
      showMessage(editing ? `Saved to TODO.md · Edited ${text}` : `Created in Inbox · ${text}`);
    } catch (error) {
      try {
        state.board = await request('/api/board');
        revision = state.board.revision;
      } catch { /* keep what we had */ }
      const stillThere = editTarget?.id && state.board.tasks.find(task => task.id === editTarget.id);
      if (stillThere) {
        // The task is found by its ID, so saving again with the fresh revision cannot hit the wrong task.
        editTarget = stillThere;
        setStatus(`${error.message} Your changes are still here; save again to apply them.`, true);
        rerender();
      } else if (editTarget) {
        // No ID to find it by, so its line may have moved. Close rather than risk editing the wrong line.
        dialog.close();
        showMessage(error.message, true);
      } else {
        setStatus(error.message, true);
      }
    } finally {
      saving = false;
      createButton.disabled = cancelButton.disabled = false;
      title.readOnly = false;
    }
  });

  cancelButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', rerender);
  // Clicking the backdrop closes the dialog, one layer at a time (the calendar first), unless that would lose what you typed.
  onOutsideClick(dialog, event => {
    if (saving || picker.closedBy(event)) return;
    if (fieldsNow() !== snapshot) {
      setStatus('You have unsaved changes. Save them, or press Cancel to discard.', true);
      return;
    }
    dialog.close();
  });

  return { openNew, openEdit, isOpen: () => dialog.open };
}
