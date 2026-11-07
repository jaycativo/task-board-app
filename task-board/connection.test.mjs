import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const app = dirname(dirname(fileURLToPath(import.meta.url)));
const server = join(app, 'task-board/server.mjs');

test('connects to the selected vault and saves a move there', async t => {
  const vault = mkdtempSync(join(tmpdir(), 'board vault '));
  const sample = readFileSync(join(app, 'TODO.md'), 'utf8');
  writeFileSync(join(vault, 'TODO.md'), sample);
  const child = spawn(process.execPath, [server, vault], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: '' } });
  t.after(() => { child.kill(); rmSync(vault, { recursive: true, force: true }); });
  const url = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  const board = await (await fetch(`${url}/api/board`)).json();
  const response = await fetch(`${url}/api/move`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: board.revision, id: 'task-ask-a-friend', target: 'Done' }),
  });
  assert.equal(response.status, 200);
  assert.match(readFileSync(join(vault, 'TODO.md'), 'utf8'), /- \[x\] Ask a friend to try the board/);
  assert.equal(readFileSync(join(app, 'TODO.md'), 'utf8'), sample);
});

test('rejects an incompatible file before starting', () => {
  const vault = mkdtempSync(join(tmpdir(), 'board-invalid-'));
  try {
    writeFileSync(join(vault, 'TODO.md'), '# My tasks\n- [ ] A task\n');
    const result = spawnSync(process.execPath, [server, vault], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /collector markers/);
  } finally { rmSync(vault, { recursive: true, force: true }); }
});
