// Task notes: where they are saved, and adding, reading, editing, and deleting them.
// Notes live in the vault's daily notes folder as dated files (YYYY-MM-DD.md).
// Only entries the board wrote (they carry a hidden marker) can be edited or deleted.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fail } from './errors.mjs';
import { writeIfUnchanged } from './safe-write.mjs';
import { parseBoard } from './board.mjs';

const dateFile = /^\d{4}-\d{2}-\d{2}\.md$/;
const noteHeading = /^- (\d{2}:\d{2}) — Task note: \[\[TODO#\^([A-Za-z0-9-]+)\]\]\s*$/;
const noteMarker = /^ {2}<!-- task-note:([a-f0-9-]{36}):([a-f0-9]{64}) -->$/;
const fallbackFolder = 'Daily Notes';
const NOTE_CHANGED = 'That daily note changed. Refresh the notes and try again.';

// Returns a folder inside the vault ('' means the vault root), or null if the path would leave the vault.
function cleanFolder(vaultRoot, value) {
  const folder = String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
  const root = resolve(vaultRoot);
  const full = resolve(root, folder);
  return full === root || full.startsWith(root + sep) ? folder : null;
}

// Works out where task notes are saved: --notes-folder, else the vault's Obsidian daily notes
// setting, else "Daily Notes". Only the YYYY-MM-DD date format is supported.
export function notesSettings(vaultRoot, override) {
  if (override) {
    const folder = cleanFolder(vaultRoot, override);
    if (folder === null) throw new Error(`The notes folder must be inside your vault: ${override}`);
    return { folder };
  }
  let config = null;
  try { config = JSON.parse(readFileSync(join(vaultRoot, '.obsidian', 'daily-notes.json'), 'utf8')); } catch { /* no settings file */ }
  if (config) {
    const format = config.format || 'YYYY-MM-DD';
    if (format !== 'YYYY-MM-DD') {
      return { folder: fallbackFolder, message: `Your daily notes use the date format ${format}, which the board cannot read yet. Task notes go to ${fallbackFolder}/ instead.` };
    }
    const folder = cleanFolder(vaultRoot, config.folder);
    if (folder !== null) return { folder };
    return { folder: fallbackFolder, message: `Your daily notes folder is outside the vault. Task notes go to ${fallbackFolder}/ instead.` };
  }
  return { folder: fallbackFolder };
}

const notePath = (folder, name) => (folder ? `${folder}/${name}` : name);

export function appendTaskNote(vaultRoot, { id, text, requestId } = {}, now = new Date(), folder = fallbackFolder) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]+$/.test(id)) throw fail('Choose a task with a stable ID.');
  if (typeof text !== 'string' || !text.trim() || text.length > 8000) throw fail('Enter a note with 1 to 8000 characters.');
  if (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(requestId)) throw fail('Invalid note save ID.');
  const board = parseBoard(readFileSync(join(vaultRoot, 'TODO.md'), 'utf8'));
  if (!board.tasks.some(task => task.id === id)) throw fail('Task not found. Refresh the board.', 404);
  const date = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const file = notePath(folder, `${date}.md`);
  const path = join(vaultRoot, file);
  let current = '';
  try { current = readFileSync(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const digest = createHash('sha256').update(`${id}\0${text}`).digest('hex');
  const marker = `<!-- task-note:${requestId}:${digest} -->`;
  if (current.includes(`<!-- task-note:${requestId}:`)) {
    if (!current.includes(marker)) throw fail('This note was already saved with different text. Start a new note for the change.', 409);
    return { file, taskId: id, saved: true };
  }
  const newline = current.includes('\r\n') ? '\r\n' : '\n';
  const content = text.replace(/\r\n?/g, '\n').split('\n').map(line => `  ${line}`).join(newline);
  const entry = `- ${time} — Task note: [[TODO#^${id}]]${newline}${content}${newline}  ${marker}${newline}`;
  mkdirSync(join(vaultRoot, folder), { recursive: true });
  appendFileSync(path, `${current ? newline + newline : ''}${entry}`, { encoding: 'utf8', mode: 0o600 });
  return { file, taskId: id, saved: true };
}

// Finds every note that links to a task. Notes the board wrote carry a noteId and can be edited or deleted.
// Notes you wrote by hand are listed too, but have no noteId and stay read-only.
function scanNotes(vaultRoot, folder) {
  let files;
  try { files = readdirSync(join(vaultRoot, folder), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const notes = [];
  for (const file of files.filter(file => file.isFile() && dateFile.test(file.name))) {
    const lines = readFileSync(join(vaultRoot, folder, file.name), 'utf8').split(/\r?\n/);
    let fence = null;
    for (let i = 0; i < lines.length; i++) {
      const marker = lines[i].match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
        continue;
      }
      if (fence) continue;
      const ids = [...new Set([...lines[i].matchAll(/\[\[TODO(?:\.md)?#\^([A-Za-z0-9-]+)(?:\|[^\]]*)?\]\]/g)].map(match => match[1]))];
      if (!ids.length) continue;
      const heading = lines[i].match(noteHeading);
      const content = heading ? [] : [lines[i]];
      let end = i + 1;
      while (end < lines.length && /^  /.test(lines[end])) {
        if (noteMarker.test(lines[end])) break;
        content.push(heading ? lines[end].slice(2) : lines[end]);
        end++;
      }
      const noteId = heading && end < lines.length ? lines[end].match(noteMarker)?.[1] || null : null;
      if (!heading && !/^\s*(?:[-*+]|\d+[.)])\s/.test(lines[i])) {
        while (end < lines.length && lines[end].trim() && !/^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|`{3,}|~{3,})/.test(lines[end])) {
          content.push(lines[end++]);
        }
      }
      for (const taskId of ids) {
        notes.push({ taskId, noteId, file: notePath(folder, file.name), date: file.name.slice(0, -3), time: heading?.[1] || null, text: content.join('\n'), line: i + 1 });
      }
      i = end - 1;
    }
  }
  return notes;
}

export function readTaskNotes(vaultRoot, id, folder = fallbackFolder) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]+$/.test(id)) throw fail('Choose a task with a stable ID.');
  const board = parseBoard(readFileSync(join(vaultRoot, 'TODO.md'), 'utf8'));
  if (!board.tasks.some(task => task.id === id)) throw fail('Task not found. Refresh the board.', 404);
  return scanNotes(vaultRoot, folder)
    .filter(note => note.taskId === id)
    .map(({ taskId, ...note }) => note)
    .sort((a, b) => b.date.localeCompare(a.date) || b.line - a.line);
}

// How many notes each task has, for the count on its card.
export function countTaskNotes(vaultRoot, folder = fallbackFolder) {
  const counts = {};
  for (const note of scanNotes(vaultRoot, folder)) counts[note.taskId] = (counts[note.taskId] || 0) + 1;
  return counts;
}

// Finds a note the board wrote, by its hidden marker. Notes edited by hand around the marker are refused.
function locateNote(vaultRoot, noteId, folder) {
  if (typeof noteId !== 'string' || !/^[a-f0-9-]{36}$/.test(noteId)) throw fail('Invalid note.');
  let files;
  try { files = readdirSync(join(vaultRoot, folder), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') throw fail('Note not found. Refresh the notes.', 404); throw error; }
  for (const file of files.filter(file => file.isFile() && dateFile.test(file.name))) {
    const path = join(vaultRoot, folder, file.name);
    const original = readFileSync(path, 'utf8');
    const lines = original.split('\n');
    const marker = lines.findIndex(line => line.replace(/\r$/, '').match(noteMarker)?.[1] === noteId);
    if (marker < 0) continue;
    let heading = marker - 1;
    while (heading >= 0 && /^ {2}/.test(lines[heading])) heading--;
    const parsed = heading >= 0 && lines[heading].replace(/\r$/, '').match(noteHeading);
    if (!parsed) throw fail('This note was changed outside the board, so the board will not edit it. Change it in Obsidian.', 409);
    return { path, original, lines, heading, marker, taskId: parsed[2], cr: lines[marker].endsWith('\r') ? '\r' : '' };
  }
  throw fail('Note not found. Refresh the notes.', 404);
}

export function editTaskNote(vaultRoot, { noteId, text } = {}, folder = fallbackFolder) {
  if (typeof text !== 'string' || !text.trim() || text.length > 8000) throw fail('Enter a note with 1 to 8000 characters.');
  const found = locateNote(vaultRoot, noteId, folder);
  const digest = createHash('sha256').update(`${found.taskId}\0${text}`).digest('hex');
  const content = text.replace(/\r\n?/g, '\n').split('\n').map(line => `  ${line}${found.cr}`);
  const lines = [...found.lines];
  lines.splice(found.heading + 1, found.marker - found.heading, ...content, `  <!-- task-note:${noteId}:${digest} -->${found.cr}`);
  writeIfUnchanged(found.path, found.original, lines.join('\n'), NOTE_CHANGED);
  return { saved: true };
}

export function deleteTaskNote(vaultRoot, { noteId } = {}, folder = fallbackFolder) {
  const found = locateNote(vaultRoot, noteId, folder);
  const lines = [...found.lines];
  let start = found.heading;
  let end = found.marker + 1;
  while (end < lines.length && !lines[end].trim()) end++;
  if (end === lines.length) while (start > 0 && !lines[start - 1].trim()) start--;
  lines.splice(start, end - start);
  if (lines.length && lines.at(-1) !== '') lines.push('');
  writeIfUnchanged(found.path, found.original, lines.join('\n'), NOTE_CHANGED);
  return { deleted: true };
}
