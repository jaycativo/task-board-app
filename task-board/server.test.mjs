import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBoardServer } from './server.mjs';

const sample = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../TODO.md'), 'utf8');

// Starts a real server on a scratch vault and gives back a helper to talk to it.
async function start(t) {
  const vault = mkdtempSync(join(tmpdir(), 'http-test-'));
  writeFileSync(join(vault, 'TODO.md'), sample);
  const server = createBoardServer(vault, { notesFolder: 'Daily Notes' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.close(); rmSync(vault, { recursive: true, force: true }); });
  const port = server.address().port;
  // http.request, not fetch, so a test can send any Host or Origin header.
  const call = (method, path, { headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method, path, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: response.statusCode, headers: response.headers, text, json });
      });
    });
    request.on('error', reject);
    request.end(body);
  });
  const post = (path, data) => call('POST', path, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return { vault, port, call, post, board: () => call('GET', '/api/board') };
}

test('serves the board as JSON', async t => {
  const { board } = await start(t);
  const result = await board();
  assert.equal(result.status, 200);
  assert.ok(result.json.revision);
  assert.ok(result.json.tasks.length > 0);
  assert.ok(result.json.columns.includes('Inbox'));
  assert.ok(result.json.vault);
});

test('refuses a request with the wrong Host', async t => {
  const { call } = await start(t);
  const result = await call('GET', '/api/board', { headers: { Host: 'evil.example' } });
  assert.equal(result.status, 403);
});

test('refuses a request from another website', async t => {
  const { call, post, port } = await start(t);
  const read = await call('GET', '/api/board', { headers: { Origin: 'http://evil.example' } });
  assert.equal(read.status, 403);
  const write = await call('POST', '/api/tasks', { headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' }, body: '{}' });
  assert.equal(write.status, 403);
  const same = await call('GET', '/api/board', { headers: { Origin: `http://127.0.0.1:${port}` } });
  assert.equal(same.status, 200);
  assert.equal((await post('/api/tasks', {})).status, 400);
});

test('changes must be JSON, valid, and small', async t => {
  const { call } = await start(t);
  const form = await call('POST', '/api/move', { headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(form.status, 415);
  const broken = await call('POST', '/api/move', { headers: { 'Content-Type': 'application/json' }, body: '{nope' });
  assert.equal(broken.status, 400);
  assert.equal(broken.json.error, 'Invalid JSON.');
  const notAnObject = await call('POST', '/api/move', { headers: { 'Content-Type': 'application/json' }, body: '5' });
  assert.equal(notAnObject.status, 400);
  const huge = await call('POST', '/api/tasks', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x'.repeat(50000) }) });
  assert.equal(huge.status, 413);
});

test('only the page files are served, never server code, tests, or paths outside', async t => {
  const { call } = await start(t);
  for (const path of ['/', '/app.js', '/style.css', '/search.mjs', '/calendar.mjs', '/dates.mjs', '/board-view.js', '/task-dialog.js', '/theme.js', '/favicon.svg', '/favicon.png']) {
    assert.equal((await call('GET', path)).status, 200, path);
  }
  for (const path of ['/server.mjs', '/board.mjs', '/notes.mjs', '/archive.mjs', '/errors.mjs', '/safe-write.mjs', '/web/app.js', '/web', '/server.test.mjs', '/connection.test.mjs', '/../TODO.md', '/%2e%2e/TODO.md', '/..%2fTODO.md', '/TODO.md', '/index.html', '//etc/passwd', '/nope', '/api/nope']) {
    assert.equal((await call('GET', path)).status, 404, path);
  }
});

test('every response carries the security headers', async t => {
  const { call } = await start(t);
  for (const path of ['/', '/app.js', '/api/board', '/nope']) {
    const { headers } = await call('GET', path);
    assert.match(headers['content-security-policy'], /default-src 'self'/);
    assert.match(headers['content-security-policy'], /script-src 'self'/);
    assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['cache-control'], 'no-store');
  }
  assert.match((await call('GET', '/')).headers['content-type'], /text\/html/);
  assert.match((await call('GET', '/app.js')).headers['content-type'], /text\/javascript/);
  assert.match((await call('GET', '/style.css')).headers['content-type'], /text\/css/);
  assert.equal((await call('GET', '/favicon.svg')).headers['content-type'], 'image/svg+xml');
  assert.equal((await call('GET', '/favicon.png')).headers['content-type'], 'image/png');
});

test('a move is saved to the file, and a stale revision is refused', async t => {
  const { post, board, vault } = await start(t);
  const before = (await board()).json;
  const moved = await post('/api/move', { revision: before.revision, id: 'task-ask-a-friend', target: 'Done' });
  assert.equal(moved.status, 200);
  assert.match(readFileSync(join(vault, 'TODO.md'), 'utf8'), /- \[x\] Ask a friend to try the board/);
  const stale = await post('/api/move', { revision: before.revision, id: 'task-reading-list', target: 'Done' });
  assert.equal(stale.status, 409);
  assert.doesNotMatch(readFileSync(join(vault, 'TODO.md'), 'utf8'), /- \[x\] Try this idea/);
});

test('every task action works over HTTP', async t => {
  const { post, board, vault } = await start(t);
  const rev = async () => (await board()).json.revision;
  const file = () => readFileSync(join(vault, 'TODO.md'), 'utf8');
  assert.equal((await post('/api/tasks', { revision: await rev(), id: 'task-0a1b2c3d', title: 'Over HTTP', due: '2026-12-01', priority: 'high' })).status, 200);
  assert.match(file(), /- \[ \] Over HTTP ⏫ 📅 2026-12-01 \^task-0a1b2c3d/);
  assert.equal((await post('/api/edit', { revision: await rev(), id: 'task-0a1b2c3d', title: 'Over HTTP, edited', due: null, priority: 'low' })).status, 200);
  assert.match(file(), /- \[ \] Over HTTP, edited 🔽 \^task-0a1b2c3d/);
  assert.equal((await post('/api/move', { revision: await rev(), id: 'task-0a1b2c3d', target: 'Rejected' })).status, 200);
  assert.match(file(), /## Rejected\n- \[-\] Over HTTP, edited/);
  assert.equal((await post('/api/clear-rejected', { revision: await rev() })).status, 200);
  assert.doesNotMatch(file(), /Over HTTP/);
  assert.equal((await post('/api/delete', { revision: await rev(), id: 'task-reading-list' })).status, 200);
  assert.doesNotMatch(file(), /task-reading-list/);
  const archived = await post('/api/archive-done', { revision: await rev() });
  assert.equal(archived.status, 200);
  assert.doesNotMatch(file(), /task-small-problem/);
  assert.match(readFileSync(join(vault, 'TASK-ARCHIVE.md'), 'utf8'), /- \[x\] Start with a small problem ✅ \d{4}-\d{2}-\d{2} \^task-small-problem/);
  assert.equal(existsSync(join(vault, 'TASK-ARCHIVE.md')), true);
});

test('a bad task request gets a plain message, not a crash', async t => {
  const { post, board } = await start(t);
  const revision = (await board()).json.revision;
  const noTitle = await post('/api/tasks', { revision, id: 'task-0a1b2c3d', title: '  ' });
  assert.equal(noTitle.status, 400);
  assert.match(noTitle.json.error, /task title/);
  const missing = await post('/api/delete', { revision, id: 'task-nope' });
  assert.equal(missing.status, 404);
  const badMove = await post('/api/move', { revision, target: 'Now' });
  assert.equal(badMove.status, 400);
});

test('notes work over HTTP: add, list, count, edit, delete', async t => {
  const { post, call, vault } = await start(t);
  const requestId = '11111111-1111-4111-8111-111111111111';
  const added = await post('/api/notes', { id: 'task-first-move', text: 'First note', requestId });
  assert.equal(added.status, 200);
  assert.match(added.json.file, /^Daily Notes\/\d{4}-\d{2}-\d{2}\.md$/);
  const list = await call('GET', '/api/notes?id=task-first-move');
  assert.equal(list.json.notes.length, 1);
  assert.equal(list.json.notes[0].text, 'First note');
  assert.equal(list.json.notes[0].noteId, requestId);
  assert.deepEqual((await call('GET', '/api/note-counts')).json.counts, { 'task-first-move': 1 });
  assert.equal((await post('/api/notes/edit', { noteId: requestId, text: 'Changed' })).status, 200);
  assert.equal((await call('GET', '/api/notes?id=task-first-move')).json.notes[0].text, 'Changed');
  assert.equal((await post('/api/notes/delete', { noteId: requestId })).status, 200);
  assert.equal((await call('GET', '/api/notes?id=task-first-move')).json.notes.length, 0);
  assert.equal((await post('/api/notes', { id: 'task-nope', text: 'x', requestId })).status, 404);
  assert.equal((await post('/api/notes', { id: '../../etc', text: 'x', requestId })).status, 400);
  assert.ok(vault);
});

test('a problem reading the file never leaks the file path', async t => {
  const { call, vault } = await start(t);
  rmSync(join(vault, 'TODO.md'));
  const result = await call('GET', '/api/board');
  assert.equal(result.status, 500);
  assert.doesNotMatch(result.text, /http-test-|\/tmp|\/var|ENOENT/);
});
