// The rules for TODO.md: how it is read, and every change the board can make to it.
// Everything here is a plain function: file text in, new file text out. Nothing touches the disk.
import { createHash, randomBytes } from 'node:crypto';
import { fail } from './errors.mjs';

const startMarker = '<!-- todo-collector:start -->';
const endMarker = '<!-- todo-collector:end -->';
const checkbox = /^([-*+]\s+\[)([ xX-])(\]\s+)(.*)$/;

// The task ID at the end of a line, like " ^task-1a2b3c4d". Group 1 is the ID itself.
export const blockIdAtEnd = /\s+\^([A-Za-z0-9-]+)\s*$/;

// "\r" for a line from a Windows-style file, otherwise "". Lines keep their ending when rewritten.
export const lineEnding = line => (line.endsWith('\r') ? '\r' : '');

// Rejected is optional. It sits after the end marker, and rejected tasks are written as "- [-]" (cancelled in the Tasks plugin).
export const columns = ['Inbox', 'Backlog', 'Next', 'Now', 'In Progress', 'Done', 'Rejected'];

const STALE = 'TODO.md changed. The board has refreshed. Please try again.';

// Due date and priority use the Obsidian Tasks plugin emoji format, e.g. "Title ⏫ 📅 2026-11-14".
const priorityEmoji = { high: '⏫', medium: '🔼', low: '🔽' };
const priorityByEmoji = { '🔺': 'high', '⏫': 'high', '🔼': 'medium', '🔽': 'low', '⏬': 'low' };
const dueToken = /📅️?\s*(\d{4}-\d{2}-\d{2})/u;
const priorityToken = /(🔺|⏫|🔼|🔽|⏬)️?/u;

function validDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Reads the due date and priority from a task line without changing the line itself.
export function readTokens(text) {
  const due = text.match(dueToken)?.[1];
  const emoji = text.match(priorityToken)?.[1];
  const title = text.replace(new RegExp(dueToken, 'gu'), '').replace(new RegExp(priorityToken, 'gu'), '').replace(/\s{2,}/g, ' ').trim();
  return { title, due: due && validDate(due) ? due : null, priority: emoji ? priorityByEmoji[emoji] : null };
}

export function parseBoard(text) {
  const lines = text.split('\n');
  const clean = lines.map(line => line.replace(/\r$/, ''));
  const start = clean.indexOf(startMarker);
  const end = clean.indexOf(endMarker);
  const done = clean.indexOf('## Done', end + 1);
  if (start < 0 || end <= start || done <= end) {
    throw fail('TODO.md needs its collector markers and a Done section.', 422);
  }
  const headings = {};
  const tasks = [];
  const ids = new Set();
  let section = null;
  let fence = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = clean[i];
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    if (i === end) section = null;
    const heading = line.match(/^## (.+?)\s*$/);
    if (heading) {
      const name = heading[1];
      const afterEnd = i > end;
      const allowed = afterEnd ? (name === 'Done' ? i === done : name === 'Rejected') : name !== 'Done' && name !== 'Rejected';
      section = columns.includes(name) && allowed ? name : null;
      if (section) {
        if (headings[section] !== undefined) throw fail(`Repeated ${section} heading.`, 422);
        headings[section] = i;
      }
      continue;
    }
    const match = section && line.match(checkbox);
    if (!match) continue;
    // A task owns the indented lines under it (and a blank line between them).
    let blockEnd = i + 1;
    while (blockEnd < lines.length) {
      if (/^[\t ]+\S/.test(clean[blockEnd])) blockEnd++;
      else if (!clean[blockEnd].trim() && /^[\t ]+\S/.test(clean[blockEnd + 1] || '')) blockEnd++;
      else break;
    }
    const blockId = match[4].match(blockIdAtEnd);
    const id = blockId?.[1] || null;
    if (id && ids.has(id)) throw fail(`Repeated task ID: ${id}. Give each task a unique ID.`, 422);
    if (id) ids.add(id);
    const taskLine = blockId ? match[4].slice(0, blockId.index) : match[4];
    tasks.push({ id, line: i, end: blockEnd, text: taskLine, ...readTokens(taskLine), section, checked: match[2] === 'x' || match[2] === 'X' });
    i = blockEnd - 1;
  }
  for (const name of ['Inbox', 'Backlog', 'Next', 'Now', 'In Progress', 'Done']) {
    if (headings[name] === undefined) throw fail(`TODO.md needs a ${name} section.`, 422);
  }
  return {
    revision: createHash('sha256').update(text).digest('hex'),
    columns: columns.filter(name => headings[name] !== undefined),
    tasks, headings, lines,
  };
}

// Parses the file and checks it is the same version the person was looking at.
export function parseCurrent(text, revision, message = STALE) {
  const board = parseBoard(text);
  if (revision !== board.revision) throw fail(message, 409);
  return board;
}

function findTask(board, { id, line }) {
  const task = board.tasks.find(item => id ? item.id === id : item.line === line);
  if (!task) throw fail('Task not found. Refresh the board.', 404);
  return task;
}

// --- Checks shared by creating and editing a task ---

function checkTitle(title, idNote) {
  if (typeof title !== 'string' || !title.trim() || title.length > 2000 || /[\r\n]/.test(title)) {
    throw fail('Enter a task title on one line, with 1 to 2000 characters.');
  }
  if (blockIdAtEnd.test(title)) throw fail(`Enter the title only. The board ${idNote} task ID.`);
}

function checkDueAndPriority({ due, priority }) {
  if (due != null && (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !validDate(due))) throw fail('Choose a valid due date.');
  if (priority != null && !priorityEmoji[priority]) throw fail('Choose high, medium, or low priority.');
}

// "Title ⏫ 📅 2026-11-14": the title, then the priority, then the due date.
const composeTaskText = (title, priority, due) =>
  [title.trim(), priority && priorityEmoji[priority], due && `📅 ${due}`].filter(Boolean).join(' ');

// --- The changes ---

export function moveTask(text, { revision, id, line, target }) {
  const board = parseCurrent(text, revision, 'TODO.md changed. The board has refreshed. Please move the task again.');
  if (!columns.includes(target) || (target !== 'Rejected' && board.headings[target] === undefined)) throw fail('Choose a valid column.');
  const task = findTask(board, { id, line });
  if (task.section === target && task.checked === (target === 'Done')) return text;
  const block = board.lines.splice(task.line, task.end - task.line);
  const ending = lineEnding(block[0]);
  block[0] = block[0].replace(/\r$/, '').replace(checkbox, (_, prefix, state, suffix, body) =>
    `${prefix}${target === 'Done' ? 'x' : target === 'Rejected' ? '-' : ' '}${suffix}${body}`) + ending;
  if (board.headings[target] === undefined) {
    // First rejection: add the Rejected heading at the end of the file.
    const cr = text.includes('\r\n') ? '\r' : '';
    while (board.lines.length && !board.lines.at(-1).trim()) board.lines.pop();
    board.lines.push(cr, `## Rejected${cr}`, ...block, '');
    return board.lines.join('\n');
  }
  let destination = board.headings[target] + 1;
  if (task.line < destination) destination -= block.length;
  board.lines.splice(destination, 0, ...block);
  return board.lines.join('\n');
}

export function createTask(text, { revision, id, title, due, priority }) {
  checkTitle(title, 'adds a');
  if (typeof id !== 'string' || !/^task-[a-f0-9]{8}$/.test(id)) throw fail('Invalid new task ID.');
  checkDueAndPriority({ due, priority });
  const taskText = composeTaskText(title, priority, due);
  const board = parseBoard(text);
  // Creating the same task twice (a retried request) is not an error, as long as it is the same task.
  const existing = board.tasks.find(task => task.id === id);
  if (existing) {
    if (existing.text !== taskText) throw fail('This task ID is already in use. Close this form and start a new task.', 409);
    return text;
  }
  if (new RegExp(`\\^${id}\\s*$`, 'm').test(text)) throw fail('This task ID is already in use. Close this form and start a new task.', 409);
  if (revision !== board.revision) throw fail('TODO.md changed. Please try creating the task again.', 409);
  board.lines.splice(board.headings.Inbox + 1, 0, `- [ ] ${taskText} ^${id}${text.includes('\r\n') ? '\r' : ''}`);
  return board.lines.join('\n');
}

// Changes a task's title, due date, and priority. Its ID, checkbox, and indented details stay as they are.
// A task that has no ID is given one.
export function editTask(text, { revision, id, line, title, due, priority }) {
  checkTitle(title, 'keeps the');
  const typed = readTokens(title);
  if (typed.due || typed.priority) throw fail('Use the due date and priority fields instead of typing them in the title.');
  checkDueAndPriority({ due, priority });
  const board = parseCurrent(text, revision);
  const task = findTask(board, { id, line });
  const first = board.lines[task.line];
  const ending = lineEnding(first);
  const match = first.replace(/\r$/, '').match(checkbox);
  const blockId = match[4].match(blockIdAtEnd);
  let suffix = blockId ? blockId[0] : '';
  if (!blockId) {
    // A task without an ID gets one the first time it is edited, so it can have notes and be found reliably.
    let fresh;
    do { fresh = `task-${randomBytes(4).toString('hex')}`; } while (board.tasks.some(item => item.id === fresh));
    suffix = ` ^${fresh}`;
  }
  board.lines[task.line] = `${match[1]}${match[2]}${match[3]}${composeTaskText(title, priority, due)}${suffix}${ending}`;
  return board.lines.join('\n');
}

// Permanently removes one task and its indented details.
export function deleteTask(text, { revision, id, line }) {
  const board = parseCurrent(text, revision);
  const task = findTask(board, { id, line });
  board.lines.splice(task.line, task.end - task.line);
  return board.lines.join('\n');
}

// Permanently removes every task under the Rejected heading.
export function clearRejected(text, { revision }) {
  const board = parseCurrent(text, revision);
  const rejected = board.tasks.filter(task => task.section === 'Rejected').sort((a, b) => b.line - a.line);
  for (const task of rejected) board.lines.splice(task.line, task.end - task.line);
  return rejected.length ? board.lines.join('\n') : text;
}
