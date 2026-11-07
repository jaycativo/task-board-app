// The web server: serves the page, answers the page's requests, and starts the board from the command line.
// The rules for TODO.md and for notes live in board.mjs, archive.mjs, and notes.mjs. This file only routes.
import http from 'node:http';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { fail } from './errors.mjs';
import { writeIfUnchanged } from './safe-write.mjs';
import { parseBoard, moveTask, createTask, editTask, deleteTask, clearRejected } from './board.mjs';
import { archiveDone, appendArchive } from './archive.mjs';
import { notesSettings, appendTaskNote, readTaskNotes, countTaskNotes, editTaskNote, deleteTaskNote } from './notes.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 40000;

// The only files ever served to the page (plus index.html at "/"). Nothing else is reachable.
const pageFiles = ['app.js', 'search.mjs', 'calendar.mjs', 'theme.js', 'style.css'];

const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

const mimeType = file => (/\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');

// Changes to TODO.md. Each takes the file text and the request, and returns the new file text.
const taskChanges = {
  '/api/move': moveTask,
  '/api/tasks': createTask,
  '/api/edit': editTask,
  '/api/delete': deleteTask,
  '/api/clear-rejected': clearRejected,
};
const archiveRoute = '/api/archive-done';

function publicBoard(text, vaultRoot) {
  const { revision, columns, tasks } = parseBoard(text);
  return { revision, columns, tasks, vault: basename(vaultRoot) };
}

// Reads a request body that must be small, valid JSON.
async function readJson(request) {
  if (request.headers['content-type'] !== 'application/json') throw fail('Send JSON only.', 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw fail('Request is too large.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('Invalid JSON.'); }
}

export function createBoardServer(vaultRoot, { notesFolder } = {}) {
  const todoPath = join(vaultRoot, 'TODO.md');
  const folder = notesFolder ?? notesSettings(vaultRoot).folder;

  const noteChanges = {
    '/api/notes': change => appendTaskNote(vaultRoot, change, new Date(), folder),
    '/api/notes/edit': change => editTaskNote(vaultRoot, change, folder),
    '/api/notes/delete': change => deleteTaskNote(vaultRoot, change, folder),
  };

  // Applies one change to TODO.md and saves it. Returns the new text.
  function changeTodo(url, change) {
    const original = readFileSync(todoPath, 'utf8');
    let updated;
    if (url === archiveRoute) {
      // The archive is written first, so a failure can only duplicate a task, never lose one.
      const result = archiveDone(original, change);
      if (result.blocks.length) appendArchive(vaultRoot, result.blocks);
      updated = result.text;
    } else {
      updated = taskChanges[url](original, change);
    }
    if (updated !== original) writeIfUnchanged(todoPath, original, updated, 'TODO.md changed. Refresh the board and try again.');
    return updated;
  }

  return http.createServer(async (request, response) => {
    const address = `127.0.0.1:${request.socket.localPort}`;
    const origin = `http://${address}`;
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      response.writeHead(status, { 'Content-Type': type, ...securityHeaders });
      response.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
    };
    try {
      // Only this computer's own page may talk to the board. This stops other websites and DNS tricks.
      if (request.headers.host !== address || (request.headers.origin && request.headers.origin !== origin)) {
        throw fail('This board accepts local requests only.', 403);
      }
      const { method, url } = request;

      if (method === 'GET') {
        if (url === '/api/board') return send(200, publicBoard(readFileSync(todoPath, 'utf8'), vaultRoot));
        if (url === '/api/note-counts') return send(200, { counts: countTaskNotes(vaultRoot, folder) });
        if (url.startsWith('/api/notes?')) {
          const id = new URL(url, origin).searchParams.get('id');
          return send(200, { notes: readTaskNotes(vaultRoot, id, folder) });
        }
        const file = url === '/' ? 'index.html' : pageFiles.find(name => `/${name}` === url);
        if (file) return send(200, readFileSync(join(directory, file)), `${mimeType(file)}; charset=utf-8`);
      }

      if (method === 'POST' && Object.hasOwn(noteChanges, url)) {
        const change = await readJson(request);
        if (!change || typeof change !== 'object') throw fail('Invalid note.');
        return send(200, noteChanges[url](change));
      }

      if (method === 'POST' && (Object.hasOwn(taskChanges, url) || url === archiveRoute)) {
        const change = await readJson(request);
        if (!change || typeof change !== 'object') throw fail('Invalid task request.');
        if (url === '/api/move' && !(typeof change.id === 'string' || Number.isInteger(change.line))) throw fail('Invalid move.');
        return send(200, publicBoard(changeTodo(url, change), vaultRoot));
      }

      throw fail('Not found.', 404);
    } catch (error) {
      send(error.status || 500, { error: error.status ? error.message : 'Cannot read or save TODO.md. Check the file and try again.' });
    }
  });
}

// Starts the board: bash start.sh ["/path/to/vault"] [--notes-folder name]
function main() {
  const args = process.argv.slice(2);
  const flag = args.indexOf('--notes-folder');
  const notesOverride = flag >= 0 ? args.splice(flag, 2)[1] : undefined;
  const vaultRoot = resolve(args[0] || dirname(directory));
  try {
    parseBoard(readFileSync(join(vaultRoot, 'TODO.md'), 'utf8'));
  } catch (error) {
    console.error(`Cannot open ${join(vaultRoot, 'TODO.md')}: ${error.message}`);
    process.exit(1);
  }
  let notes;
  try { notes = notesSettings(vaultRoot, notesOverride); } catch (error) { console.error(error.message); process.exit(1); }
  const server = createBoardServer(vaultRoot, { notesFolder: notes.folder });
  server.on('error', error => { console.error(`Cannot start board: ${error.message}`); process.exitCode = 1; });
  server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    console.log(`Task board: ${url}\nChanges save to ${join(vaultRoot, 'TODO.md')}\nTask notes save to ${notes.folder ? `${notes.folder}/` : 'the vault folder'}${notes.message ? `\n${notes.message}` : ''}\nPress Ctrl+C to stop.`);
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
    const browser = spawn(command, [url], { stdio: 'ignore' });
    browser.on('error', () => console.log('Open the link above in your browser.'));
    browser.unref();
  });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
