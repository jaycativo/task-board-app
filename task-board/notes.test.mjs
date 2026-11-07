import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendTaskNote, readTaskNotes, editTaskNote, deleteTaskNote, countTaskNotes, notesSettings } from './notes.mjs';

const sample = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../TODO.md'), 'utf8');
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const day = new Date(2026, 10, 7, 9, 5);

function withVault(run) {
  const vault = mkdtempSync(join(tmpdir(), 'notes-test-'));
  writeFileSync(join(vault, 'TODO.md'), sample);
  try { run(vault); } finally { rmSync(vault, { recursive: true, force: true }); }
}

test('a note is saved to the notes folder with local date and time, and read back', () => {
  withVault(vault => {
    const saved = appendTaskNote(vault, { id: 'task-first-move', text: 'Line one\nLine two', requestId: ids[0] }, day, 'intake');
    assert.equal(saved.file, 'intake/2026-11-07.md');
    const [note] = readTaskNotes(vault, 'task-first-move', 'intake');
    assert.equal(note.text, 'Line one\nLine two');
    assert.equal(note.time, '09:05');
    assert.equal(note.noteId, ids[0]);
    assert.equal(readTaskNotes(vault, 'task-first-move', 'Daily Notes').length, 0);
  });
});

test('editing a note replaces its text and keeps its place', () => {
  withVault(vault => {
    appendTaskNote(vault, { id: 'task-first-move', text: 'First', requestId: ids[0] }, day);
    appendTaskNote(vault, { id: 'task-first-move', text: 'Second', requestId: ids[1] }, day);
    editTaskNote(vault, { noteId: ids[0], text: 'First, changed\nwith two lines' });
    const notes = readTaskNotes(vault, 'task-first-move');
    assert.deepEqual(notes.map(note => note.text).sort(), ['First, changed\nwith two lines', 'Second']);
    const file = readFileSync(join(vault, 'Daily Notes/2026-11-07.md'), 'utf8');
    assert.ok(file.indexOf('First, changed') < file.indexOf('Second'));
    assert.throws(() => editTaskNote(vault, { noteId: ids[0], text: '  ' }), /1 to 8000/);
    assert.throws(() => editTaskNote(vault, { noteId: ids[2], text: 'x' }), /not found/);
    assert.throws(() => editTaskNote(vault, { noteId: 'nope', text: 'x' }), /Invalid note/);
  });
});

test('deleting a note removes only that note and tidies the blank lines', () => {
  withVault(vault => {
    for (const [index, text] of ['One', 'Two', 'Three'].entries()) appendTaskNote(vault, { id: 'task-first-move', text, requestId: ids[index] }, day);
    deleteTaskNote(vault, { noteId: ids[1] });
    assert.deepEqual(readTaskNotes(vault, 'task-first-move').map(note => note.text).sort(), ['One', 'Three']);
    deleteTaskNote(vault, { noteId: ids[2] });
    const file = readFileSync(join(vault, 'Daily Notes/2026-11-07.md'), 'utf8');
    assert.ok(file.endsWith('-->\n'));
    assert.ok(!file.includes('Two') && !file.includes('Three'));
    deleteTaskNote(vault, { noteId: ids[0] });
    assert.equal(readFileSync(join(vault, 'Daily Notes/2026-11-07.md'), 'utf8').trim(), '');
    assert.throws(() => deleteTaskNote(vault, { noteId: ids[0] }), /not found/);
  });
});

test('notes you wrote by hand are listed but cannot be edited', () => {
  withVault(vault => {
    mkdirSync(join(vault, 'Daily Notes'));
    writeFileSync(join(vault, 'Daily Notes/2026-11-06.md'), '- Talked it over with Sam [[TODO#^task-first-move]]\n');
    const [note] = readTaskNotes(vault, 'task-first-move');
    assert.equal(note.noteId, null);
    assert.match(note.text, /Talked it over/);
  });
});

test('a note changed around its marker is refused instead of rewritten', () => {
  withVault(vault => {
    appendTaskNote(vault, { id: 'task-first-move', text: 'Original', requestId: ids[0] }, day);
    const path = join(vault, 'Daily Notes/2026-11-07.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace('- 09:05 — Task note:', '- Edited by hand:'));
    assert.throws(() => deleteTaskNote(vault, { noteId: ids[0] }), /outside the board/);
  });
});

test('note counts are grouped by task', () => {
  withVault(vault => {
    appendTaskNote(vault, { id: 'task-first-move', text: 'A', requestId: ids[0] }, day);
    appendTaskNote(vault, { id: 'task-first-move', text: 'B', requestId: ids[1] }, day);
    appendTaskNote(vault, { id: 'task-next-change', text: 'C', requestId: ids[2] }, day);
    assert.deepEqual(countTaskNotes(vault), { 'task-first-move': 2, 'task-next-change': 1 });
  });
});

test('the notes folder comes from the Obsidian daily notes setting', () => {
  withVault(vault => {
    assert.deepEqual(notesSettings(vault), { folder: 'Daily Notes' });
    mkdirSync(join(vault, '.obsidian'));
    const config = join(vault, '.obsidian/daily-notes.json');
    writeFileSync(config, JSON.stringify({ folder: 'intake', format: 'YYYY-MM-DD' }));
    assert.deepEqual(notesSettings(vault), { folder: 'intake' });
    writeFileSync(config, JSON.stringify({ folder: '/journal/' }));
    assert.deepEqual(notesSettings(vault), { folder: 'journal' });
    writeFileSync(config, JSON.stringify({ folder: '' }));
    assert.deepEqual(notesSettings(vault), { folder: '' });
    writeFileSync(config, JSON.stringify({ folder: 'intake', format: 'DD-MM-YYYY' }));
    assert.match(notesSettings(vault).message, /DD-MM-YYYY/);
    assert.equal(notesSettings(vault).folder, 'Daily Notes');
    writeFileSync(config, JSON.stringify({ folder: '../outside' }));
    assert.match(notesSettings(vault).message, /outside the vault/);
  });
});

test('an override folder wins, and one outside the vault is refused', () => {
  withVault(vault => {
    assert.deepEqual(notesSettings(vault, 'journal'), { folder: 'journal' });
    assert.throws(() => notesSettings(vault, '../elsewhere'), /inside your vault/);
  });
});
