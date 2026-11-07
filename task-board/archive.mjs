// Archiving finished work: taking Done tasks off the board and adding them to TASK-ARCHIVE.md.
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCurrent, blockIdAtEnd, lineEnding } from './board.mjs';

export const archiveFile = 'TASK-ARCHIVE.md';

// Today's date as YYYY-MM-DD on this computer's calendar.
function localDate(now) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Adds a Tasks plugin completion date (✅) before the task ID, unless the task already has one.
function withDoneDate(line, date) {
  const ending = lineEnding(line);
  const bare = line.slice(0, line.length - ending.length);
  if (bare.includes('✅')) return line;
  const id = bare.match(blockIdAtEnd);
  return (id ? `${bare.slice(0, id.index)} ✅ ${date}${id[0]}` : `${bare} ✅ ${date}`) + ending;
}

// Takes every Done task off the board. Returns the new file text and the removed task blocks.
export function archiveDone(text, { revision }, now = new Date()) {
  const board = parseCurrent(text, revision);
  const done = board.tasks.filter(task => task.section === 'Done').sort((a, b) => a.line - b.line);
  const date = localDate(now);
  const blocks = done.map(task => {
    const block = board.lines.slice(task.line, task.end);
    block[0] = withDoneDate(block[0], date);
    return block;
  });
  for (const task of [...done].reverse()) board.lines.splice(task.line, task.end - task.line);
  return { text: done.length ? board.lines.join('\n') : text, blocks };
}

// Adds archived tasks to TASK-ARCHIVE.md at the vault root, under a dated heading.
export function appendArchive(vaultRoot, blocks, now = new Date()) {
  const path = join(vaultRoot, archiveFile);
  let current = '';
  try { current = readFileSync(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const newline = current.includes('\r\n') ? '\r\n' : '\n';
  const prefix = current ? (current.endsWith('\n') ? newline : newline + newline) : `# Task archive${newline}${newline}`;
  const body = blocks.map(block => block.map(line => line.replace(/\r$/, '')).join(newline)).join(newline);
  appendFileSync(path, `${prefix}## Archived ${localDate(now)}${newline}${body}${newline}`, { encoding: 'utf8', mode: 0o600 });
  return archiveFile;
}
