import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, appendFileSync, mkdirSync, renameSync, unlinkSync, statSync, realpathSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const directory = dirname(fileURLToPath(import.meta.url));
const startMarker = '<!-- todo-collector:start -->';
const endMarker = '<!-- todo-collector:end -->';
const checkbox = /^([-*+]\s+\[)([ xX-])(\]\s+)(.*)$/;
// Rejected is optional. It sits after the end marker, and rejected tasks are written as "- [-]" (cancelled in the Tasks plugin).
export const columns = ['Inbox', 'Backlog', 'Next', 'Now', 'In Progress', 'Done', 'Rejected'];

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

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
      const after = i > end;
      const allowed = after ? (name === 'Done' ? i === done : name === 'Rejected') : name !== 'Done' && name !== 'Rejected';
      section = columns.includes(name) && allowed ? name : null;
      if (section) {
        if (headings[section] !== undefined) throw fail(`Repeated ${section} heading.`, 422);
        headings[section] = i;
      }
      continue;
    }
    const match = section && line.match(checkbox);
    if (!match) continue;
    let blockEnd = i + 1;
    while (blockEnd < lines.length) {
      if (/^[\t ]+\S/.test(clean[blockEnd])) blockEnd++;
      else if (!clean[blockEnd].trim() && /^[\t ]+\S/.test(clean[blockEnd + 1] || '')) blockEnd++;
      else break;
    }
    const blockId = match[4].match(/\s+\^([A-Za-z0-9-]+)\s*$/);
    const id = blockId?.[1] || null;
    if (id && ids.has(id)) throw fail(`Repeated task ID: ${id}. Give each task a unique ID.`, 422);
    if (id) ids.add(id);
    const text = blockId ? match[4].slice(0, blockId.index) : match[4];
    tasks.push({ id, line: i, end: blockEnd, text, ...readTokens(text), section, checked: match[2] === 'x' || match[2] === 'X' });
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

export function moveTask(text, { revision, id, line, target }) {
  const board = parseBoard(text);
  if (revision !== board.revision) throw fail('TODO.md changed. The board has refreshed. Please move the task again.', 409);
  if (!columns.includes(target) || (target !== 'Rejected' && board.headings[target] === undefined)) throw fail('Choose a valid column.');
  const task = board.tasks.find(item => id ? item.id === id : item.line === line);
  if (!task) throw fail('Task not found. Refresh the board.', 404);
  if (task.section === target && task.checked === (target === 'Done')) return text;
  const block = board.lines.splice(task.line, task.end - task.line);
  const ending = block[0].endsWith('\r') ? '\r' : '';
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

function findTask(board, { id, line }) {
  const task = board.tasks.find(item => id ? item.id === id : item.line === line);
  if (!task) throw fail('Task not found. Refresh the board.', 404);
  return task;
}

// Changes a task's title, due date, and priority. Its ID, checkbox, and indented details stay as they are.
export function editTask(text, { revision, id, line, title, due, priority }) {
  if (typeof title !== 'string' || !title.trim() || title.length > 2000 || /[\r\n]/.test(title)) {
    throw fail('Enter a task title on one line, with 1 to 2000 characters.');
  }
  if (/\s\^[A-Za-z0-9-]+\s*$/.test(title)) throw fail('Enter the title only. The board keeps the task ID.');
  const typed = readTokens(title);
  if (typed.due || typed.priority) throw fail('Use the due date and priority fields instead of typing them in the title.');
  if (due != null && (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !validDate(due))) throw fail('Choose a valid due date.');
  if (priority != null && !priorityEmoji[priority]) throw fail('Choose high, medium, or low priority.');
  const board = parseBoard(text);
  if (revision !== board.revision) throw fail('TODO.md changed. The board has refreshed. Please try again.', 409);
  const task = findTask(board, { id, line });
  const first = board.lines[task.line];
  const ending = first.endsWith('\r') ? '\r' : '';
  const match = first.replace(/\r$/, '').match(checkbox);
  const blockId = match[4].match(/\s+\^[A-Za-z0-9-]+\s*$/);
  const body = [title.trim(), priority && priorityEmoji[priority], due && `📅 ${due}`].filter(Boolean).join(' ') + (blockId ? blockId[0] : '');
  board.lines[task.line] = `${match[1]}${match[2]}${match[3]}${body}${ending}`;
  return board.lines.join('\n');
}

// Permanently removes one task and its indented details.
export function deleteTask(text, { revision, id, line }) {
  const board = parseBoard(text);
  if (revision !== board.revision) throw fail('TODO.md changed. The board has refreshed. Please try again.', 409);
  const task = findTask(board, { id, line });
  board.lines.splice(task.line, task.end - task.line);
  return board.lines.join('\n');
}

const archiveFile = 'Task Archive.md';

function localDate(now) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Adds a Tasks plugin completion date (✅) before the block ID, unless the task already has one.
function withDoneDate(line, date) {
  const ending = line.endsWith('\r') ? '\r' : '';
  const bare = line.replace(/\r$/, '');
  if (bare.includes('✅')) return line;
  const id = bare.match(/\s+\^[A-Za-z0-9-]+\s*$/);
  return (id ? `${bare.slice(0, id.index)} ✅ ${date}${id[0]}` : `${bare} ✅ ${date}`) + ending;
}

// Takes every Done task off the board. Returns the new file text and the removed task blocks.
export function archiveDone(text, { revision }, now = new Date()) {
  const board = parseBoard(text);
  if (revision !== board.revision) throw fail('TODO.md changed. The board has refreshed. Please try again.', 409);
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

// Adds archived tasks to Task Archive.md at the vault root, under a dated heading.
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

// Permanently removes every task under the Rejected heading.
export function clearRejected(text, { revision }) {
  const board = parseBoard(text);
  if (revision !== board.revision) throw fail('TODO.md changed. The board has refreshed. Please try again.', 409);
  const rejected = board.tasks.filter(task => task.section === 'Rejected').sort((a, b) => b.line - a.line);
  for (const task of rejected) board.lines.splice(task.line, task.end - task.line);
  return rejected.length ? board.lines.join('\n') : text;
}

export function createTask(text, { revision, id, title, due, priority }) {
  if (typeof title !== 'string' || !title.trim() || title.length > 2000 || /[\r\n]/.test(title)) {
    throw fail('Enter a task title on one line, with 1 to 2000 characters.');
  }
  if (/\s\^[A-Za-z0-9-]+\s*$/.test(title)) throw fail('Enter the title only. The board adds a task ID.');
  if (typeof id !== 'string' || !/^task-[a-f0-9]{8}$/.test(id)) throw fail('Invalid new task ID.');
  if (due != null && (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !validDate(due))) throw fail('Choose a valid due date.');
  if (priority != null && !priorityEmoji[priority]) throw fail('Choose high, medium, or low priority.');
  title = [title.trim(), priority && priorityEmoji[priority], due && `📅 ${due}`].filter(Boolean).join(' ');
  const board = parseBoard(text);
  const existing = board.tasks.find(task => task.id === id);
  if (existing) {
    if (existing.text !== title) throw fail('This task ID is already in use. Close this form and start a new task.', 409);
    return text;
  }
  if (new RegExp(`\\^${id}\\s*$`, 'm').test(text)) throw fail('This task ID is already in use. Close this form and start a new task.', 409);
  if (revision !== board.revision) throw fail('TODO.md changed. Please try creating the task again.', 409);
  const ending = text.includes('\r\n') ? '\r' : '';
  board.lines.splice(board.headings.Inbox + 1, 0, `- [ ] ${title} ^${id}${ending}`);
  return board.lines.join('\n');
}

function publicBoard(text, vaultRoot) {
  const { revision, columns, tasks } = parseBoard(text);
  return { revision, columns, tasks, vault: basename(vaultRoot) };
}

export function appendTaskNote(vaultRoot, { id, text, requestId } = {}, now = new Date()) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]+$/.test(id)) throw fail('Choose a task with a stable ID.');
  if (typeof text !== 'string' || !text.trim() || text.length > 8000) throw fail('Enter a note with 1 to 8000 characters.');
  if (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(requestId)) throw fail('Invalid note save ID.');
  const board = parseBoard(readFileSync(join(vaultRoot, 'TODO.md'), 'utf8'));
  if (!board.tasks.some(task => task.id === id)) throw fail('Task not found. Refresh the board.', 404);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
  const file = `intake/${date}.md`;
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
  mkdirSync(join(vaultRoot, 'intake'), { recursive: true });
  appendFileSync(path, `${current ? newline + newline : ''}${entry}`, { encoding: 'utf8', mode: 0o600 });
  return { file, taskId: id, saved: true };
}

export function readTaskNotes(vaultRoot, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]+$/.test(id)) throw fail('Choose a task with a stable ID.');
  const board = parseBoard(readFileSync(join(vaultRoot, 'TODO.md'), 'utf8'));
  if (!board.tasks.some(task => task.id === id)) throw fail('Task not found. Refresh the board.', 404);
  let files;
  try { files = readdirSync(join(vaultRoot, 'intake'), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const notes = [];
  const link = new RegExp(`\\[\\[TODO(?:\\.md)?#\\^${id}(?:\\|[^\\]]*)?\\]\\]`);
  for (const file of files.filter(file => file.isFile() && /^\d{4}-\d{2}-\d{2}\.md$/.test(file.name))) {
    const lines = readFileSync(join(vaultRoot, 'intake', file.name), 'utf8').split(/\r?\n/);
    let fence = null;
    for (let i = 0; i < lines.length; i++) {
      const marker = lines[i].match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
        continue;
      }
      if (fence || !link.test(lines[i])) continue;
      const heading = lines[i].match(/^- (\d{2}:\d{2}) — Task note: \[\[TODO#\^[A-Za-z0-9-]+\]\]\s*$/);
      const content = heading ? [] : [lines[i]];
      let end = i + 1;
      while (end < lines.length && /^  /.test(lines[end])) {
        if (/^  <!-- task-note:[a-f0-9-]{36}:[a-f0-9]{64} -->$/.test(lines[end])) break;
        content.push(heading ? lines[end].slice(2) : lines[end]);
        end++;
      }
      if (!heading && !/^\s*(?:[-*+]|\d+[.)])\s/.test(lines[i])) {
        while (end < lines.length && lines[end].trim() && !/^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|`{3,}|~{3,})/.test(lines[end])) {
          content.push(lines[end++]);
        }
      }
      notes.push({ file: `intake/${file.name}`, date: file.name.slice(0, -3), time: heading?.[1] || null, text: content.join('\n'), line: i + 1 });
      i = end - 1;
    }
  }
  return notes.sort((a, b) => b.date.localeCompare(a.date) || b.line - a.line);
}

export function createBoardServer(vaultRoot) {
  const note = join(vaultRoot, 'TODO.md');
  return http.createServer(async (request, response) => {
    const address = `127.0.0.1:${request.socket.localPort}`;
    const origin = `http://${address}`;
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      response.writeHead(status, {
        'Content-Type': type, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      });
      response.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
    };
    try {
      if (request.headers.host !== address || (request.headers.origin && request.headers.origin !== origin)) {
        throw fail('This board accepts local requests only.', 403);
      }
      if (request.method === 'GET' && request.url === '/api/board') {
        send(200, publicBoard(readFileSync(note, 'utf8'), vaultRoot));
      } else if (request.method === 'GET' && request.url.startsWith('/api/notes?')) {
        const id = new URL(request.url, origin).searchParams.get('id');
        send(200, { notes: readTaskNotes(vaultRoot, id) });
      } else if (request.method === 'POST' && ['/api/move', '/api/notes', '/api/tasks', '/api/edit', '/api/delete', '/api/clear-rejected', '/api/archive-done'].includes(request.url)) {
        if (request.headers['content-type'] !== 'application/json') throw fail('Send JSON only.', 415);
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 40000) throw fail('Request is too large.', 413);
          chunks.push(chunk);
        }
        let change;
        try { change = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('Invalid JSON.'); }
        if (request.url === '/api/notes') {
          if (!change || typeof change !== 'object') throw fail('Invalid note.');
          send(200, appendTaskNote(vaultRoot, change));
          return;
        }
        if (!change || typeof change !== 'object') throw fail('Invalid task request.');
        if (request.url === '/api/move' && !(typeof change.id === 'string' || Number.isInteger(change.line))) throw fail('Invalid move.');
        const original = readFileSync(note, 'utf8');
        let updated;
        if (request.url === '/api/archive-done') {
          // The archive is written first, so a failure can only duplicate a task, never lose one.
          const result = archiveDone(original, change);
          if (result.blocks.length) appendArchive(vaultRoot, result.blocks);
          updated = result.text;
        } else {
          updated = ({ '/api/tasks': createTask, '/api/edit': editTask, '/api/delete': deleteTask, '/api/clear-rejected': clearRejected }[request.url] || moveTask)(original, change);
        }
        if (updated !== original) {
          const temporary = `${note}.board-${randomBytes(8).toString('hex')}.tmp`;
          try {
            writeFileSync(temporary, updated, { flag: 'wx', mode: statSync(note).mode });
            if (readFileSync(note, 'utf8') !== original) throw fail('TODO.md changed. Refresh the board and try again.', 409);
            renameSync(temporary, note);
          } finally {
            try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
          }
        }
        send(200, publicBoard(updated, vaultRoot));
      } else if (request.method === 'GET' && ['/', '/app.js', '/search.mjs', '/style.css'].includes(request.url)) {
        const file = request.url === '/' ? 'index.html' : request.url.slice(1);
        const type = /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
        send(200, readFileSync(join(directory, file)), `${type}; charset=utf-8`);
      } else send(404, { error: 'Not found.' });
    } catch (error) {
      send(error.status || 500, { error: error.status ? error.message : 'Cannot read or save TODO.md. Check the file and try again.' });
    }
  });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const vaultRoot = resolve(process.argv[2] || dirname(directory));
  try {
    parseBoard(readFileSync(join(vaultRoot, 'TODO.md'), 'utf8'));
  } catch (error) {
    console.error(`Cannot open ${join(vaultRoot, 'TODO.md')}: ${error.message}`);
    process.exit(1);
  }
  const server = createBoardServer(vaultRoot);
  server.on('error', error => { console.error(`Cannot start board: ${error.message}`); process.exitCode = 1; });
  server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    console.log(`Task board: ${url}\nChanges save to ${join(vaultRoot, 'TODO.md')}\nPress Ctrl+C to stop.`);
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
    const browser = spawn(command, [url], { stdio: 'ignore' });
    browser.on('error', () => console.log('Open the link above in your browser.'));
    browser.unref();
  });
}
