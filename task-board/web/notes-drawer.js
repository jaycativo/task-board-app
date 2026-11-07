// The notes drawer: a side panel with one task's notes, and a box to add another.
// Notes the board wrote can be edited or deleted. Notes written by hand in Obsidian are shown as they are.
import { request, post } from './api.js';
import { element, appendText, noteLink, onOutsideClick } from './dom.js';
import { showMessageNodes } from './status.js';
import { state } from './state.js';

export function createNotesDrawer({ rerender }) {
  const dialog = document.querySelector('#note-dialog');
  const text = document.querySelector('#note-text');
  const status = document.querySelector('#note-status');
  const saveButton = document.querySelector('#note-save');
  const closeButton = document.querySelector('#note-cancel');
  const list = document.querySelector('#notes-list');
  let task = null;   // the task whose notes are showing
  let requestId;     // makes saving the same note twice safe
  let saving = false;

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('error', isError);
  };

  async function loadHistory(id) {
    list.textContent = 'Loading notes…';
    try {
      const result = await request(`/api/notes?id=${encodeURIComponent(id)}`);
      if (!dialog.open || task.id !== id) return;
      list.replaceChildren();
      if (!result.notes.length) list.append(element('p', 'note-help', 'No notes for this task yet.'));
      for (const note of result.notes) list.append(entryFor(note, id));
    } catch (error) {
      if (dialog.open && task.id === id) list.textContent = `Cannot load notes: ${error.message}`;
    }
  }

  // The count shown on each card's Notes button.
  async function updateCounts() {
    try { state.noteCounts = (await request('/api/note-counts')).counts; } catch { /* the cards just show no count */ }
    rerender();
  }

  function entryFor(note, id) {
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
    cancel.addEventListener('click', () => loadHistory(id));
    save.addEventListener('click', async () => {
      if (!box.value.trim()) { setStatus("A note can't be empty. Delete it instead.", true); box.focus(); return; }
      save.disabled = cancel.disabled = true;
      try {
        await post('/api/notes/edit', { noteId: note.noteId, text: box.value });
        setStatus('Note saved');
        await loadHistory(id);
      } catch (error) {
        setStatus(error.message, true);
        save.disabled = cancel.disabled = false;
      }
    });
  }

  async function deleteNote(note, id) {
    if (!confirm("Delete this note for good? This can't be undone.")) return;
    try {
      await post('/api/notes/delete', { noteId: note.noteId });
      setStatus('Note deleted');
      await loadHistory(id);
      await updateCounts();
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function open(shown, title) {
    task = shown;
    requestId = crypto.randomUUID();
    text.value = '';
    setStatus('');
    document.querySelector('#note-task').textContent = title;
    dialog.showModal();
    text.focus();
    loadHistory(shown.id);
  }

  closeButton.addEventListener('click', () => dialog.close());
  document.querySelector('#notes-refresh').addEventListener('click', () => loadHistory(task.id));
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  // Clicking outside the drawer closes it, unless that would throw away a draft or an open edit.
  onOutsideClick(dialog, () => {
    if (saving) return;
    if (text.value.trim() || dialog.querySelector('.note-edit')) {
      setStatus('You have an unsaved note. Save it, or press Close to discard.', true);
      return;
    }
    dialog.close();
  });
  document.querySelector('#note-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    if (!text.value.trim()) {
      setStatus('Enter a note before saving.', true);
      text.focus();
      return;
    }
    saving = true;
    saveButton.disabled = true;
    closeButton.disabled = true;
    text.readOnly = true;
    setStatus('Saving to your daily note…');
    try {
      const result = await post('/api/notes', { id: task.id, text: text.value, requestId });
      text.value = '';
      requestId = crypto.randomUUID();
      const link = element('a', 'note-link', result.file);
      link.href = noteLink(result.file.replace(/\.md$/, ''));
      showMessageNodes(document.createTextNode('Saved to '), link);
      setStatus(`Saved to ${result.file}`);
      await loadHistory(task.id);
      await updateCounts();
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      saving = false;
      saveButton.disabled = false;
      closeButton.disabled = false;
      text.readOnly = false;
    }
  });

  return { open, updateCounts, isOpen: () => dialog.open };
}
