import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBoard } from './board.mjs';
import { archiveDone, appendArchive } from './archive.mjs';

const sample = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../TODO.md'), 'utf8');

const twoDone = sample.replace(
  '- [x] Start with a small problem ^task-small-problem',
  '- [x] Start with a small problem ^task-small-problem\n  - first detail\n- [x] Finish the report ✅ 2026-10-01 ^task-report'
);

test('archiving takes done tasks off the board and dates them', () => {
  const now = new Date(2026, 10, 7, 12);
  const { text, blocks } = archiveDone(twoDone, { revision: parseBoard(twoDone).revision }, now);
  assert.ok(!text.includes('task-small-problem'));
  assert.ok(!text.includes('first detail'));
  assert.ok(text.includes('task-first-move'));
  assert.equal(parseBoard(text).tasks.filter(task => task.section === 'Done').length, 0);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0][0], '- [x] Start with a small problem ✅ 2026-11-07 ^task-small-problem');
  assert.equal(blocks[0][1], '  - first detail');
  assert.equal(blocks[1][0], '- [x] Finish the report ✅ 2026-10-01 ^task-report');
});

test('archiving with nothing done changes nothing, and a stale revision is refused', () => {
  const noneDone = clearDone();
  const result = archiveDone(noneDone, { revision: parseBoard(noneDone).revision });
  assert.equal(result.text, noneDone);
  assert.equal(result.blocks.length, 0);
  assert.throws(() => archiveDone(twoDone, { revision: 'stale' }), /changed/);
  function clearDone() { return sample.replace('- [x] Start with a small problem ^task-small-problem', ''); }
});

test('the archive file gets a title once and a dated section each time', () => {
  const vault = mkdtempSync(join(tmpdir(), 'archive-test-'));
  try {
    const now = new Date(2026, 10, 7, 12);
    appendArchive(vault, [['- [x] One ✅ 2026-11-07 ^task-one']], now);
    appendArchive(vault, [['- [x] Two ✅ 2026-11-07 ^task-two', '  - detail']], now);
    const archive = readFileSync(join(vault, 'TASK-ARCHIVE.md'), 'utf8');
    assert.equal(archive.match(/# Task archive/g).length, 1);
    assert.equal(archive.match(/## Archived 2026-11-07/g).length, 2);
    assert.match(archive, /- \[x\] One ✅ 2026-11-07 \^task-one\n\n## Archived 2026-11-07\n- \[x\] Two[^\n]*\n  - detail\n$/);
  } finally { rmSync(vault, { recursive: true, force: true }); }
});
