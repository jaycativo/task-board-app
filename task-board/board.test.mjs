import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBoard, moveTask, createTask, editTask, deleteTask, clearRejected, readTokens, addSubtask, toggleSubtask, deleteSubtask } from './board.mjs';

const sample = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../TODO.md'), 'utf8');

test('reads due date and priority and leaves the title clean', () => {
  assert.deepEqual(readTokens('Send report ⏫ 📅 2026-11-14'), { title: 'Send report', due: '2026-11-14', priority: 'high', tags: [] });
  assert.equal(readTokens('Plain task').priority, null);
  assert.equal(readTokens('Plain task').due, null);
  assert.equal(readTokens('Low thing 🔽').priority, 'low');
  assert.equal(readTokens('Medium thing 🔼').priority, 'medium');
});

test('ignores an impossible date', () => {
  assert.equal(readTokens('Bad date 📅 2026-02-31').due, null);
});

test('creates a task with due date and priority in the Tasks plugin format', () => {
  const board = parseBoard(sample);
  const updated = createTask(sample, { revision: board.revision, id: 'task-0a1b2c3d', title: 'Write plan', due: '2026-11-20', priority: 'high' });
  assert.match(updated, /- \[ \] Write plan ⏫ 📅 2026-11-20 \^task-0a1b2c3d/);
  const task = parseBoard(updated).tasks.find(item => item.id === 'task-0a1b2c3d');
  assert.equal(task.title, 'Write plan');
  assert.equal(task.due, '2026-11-20');
  assert.equal(task.priority, 'high');
});

test('rejects bad due dates and priorities', () => {
  const { revision } = parseBoard(sample);
  const base = { revision, id: 'task-0a1b2c3d', title: 'Write plan' };
  assert.throws(() => createTask(sample, { ...base, due: '2026-13-01' }), /valid due date/);
  assert.throws(() => createTask(sample, { ...base, due: 'tomorrow' }), /valid due date/);
  assert.throws(() => createTask(sample, { ...base, priority: 'urgent' }), /high, medium, or low/);
});

test('moving a task keeps its due date and priority', () => {
  const board = parseBoard(sample);
  const withTask = createTask(sample, { revision: board.revision, id: 'task-0a1b2c3d', title: 'Write plan', due: '2026-11-20', priority: 'low' });
  const next = parseBoard(withTask);
  const moved = moveTask(withTask, { revision: next.revision, id: 'task-0a1b2c3d', target: 'Done' });
  assert.match(moved, /- \[x\] Write plan 🔽 📅 2026-11-20 \^task-0a1b2c3d/);
});


test('rejecting a task adds a Rejected section and marks it cancelled', () => {
  const board = parseBoard(sample);
  const rejected = moveTask(sample, { revision: board.revision, id: 'task-ask-a-friend', target: 'Rejected' });
  assert.match(rejected, /## Rejected\n- \[-\] Ask a friend to try the board \^task-ask-a-friend\n$/);
  const task = parseBoard(rejected).tasks.find(item => item.id === 'task-ask-a-friend');
  assert.equal(task.section, 'Rejected');
  assert.equal(task.checked, false);
  assert.ok(!parseBoard(rejected).tasks.some(item => item.section === 'Inbox' && item.id === 'task-ask-a-friend'));
});

test('restoring a rejected task puts it back in Inbox as open', () => {
  const rejected = moveTask(sample, { revision: parseBoard(sample).revision, id: 'task-ask-a-friend', target: 'Rejected' });
  const restored = moveTask(rejected, { revision: parseBoard(rejected).revision, id: 'task-ask-a-friend', target: 'Inbox' });
  assert.match(restored, /## Inbox\n- \[ \] Ask a friend to try the board \^task-ask-a-friend/);
  assert.equal(parseBoard(restored).tasks.find(item => item.id === 'task-ask-a-friend').section, 'Inbox');
});

test('rejecting a second task reuses the Rejected heading', () => {
  const first = moveTask(sample, { revision: parseBoard(sample).revision, id: 'task-ask-a-friend', target: 'Rejected' });
  const second = moveTask(first, { revision: parseBoard(first).revision, id: 'task-reading-list', target: 'Rejected' });
  assert.equal(second.match(/## Rejected/g).length, 1);
  assert.equal(parseBoard(second).tasks.filter(item => item.section === 'Rejected').length, 2);
});

test('clearing rejected removes only rejected tasks', () => {
  const first = moveTask(sample, { revision: parseBoard(sample).revision, id: 'task-ask-a-friend', target: 'Rejected' });
  const cleared = clearRejected(first, { revision: parseBoard(first).revision });
  assert.ok(!cleared.includes('task-ask-a-friend'));
  assert.ok(cleared.includes('task-small-problem'));
  assert.ok(cleared.includes('task-first-move'));
  assert.equal(parseBoard(cleared).tasks.filter(item => item.section === 'Rejected').length, 0);
});

test('clearing rejected refuses a stale revision', () => {
  const first = moveTask(sample, { revision: parseBoard(sample).revision, id: 'task-ask-a-friend', target: 'Rejected' });
  assert.throws(() => clearRejected(first, { revision: 'stale' }), /changed/);
});


const detailed = sample.replace(
  '- [ ] Open the board and move a card ⏫ ^task-first-move',
  '- [ ] Open the board and move a card 🔁 every week ⏫ 📅 2026-11-14 ^task-first-move\n  - a detail line\n  - another detail'
);

test('editing changes the title, due date, and priority and keeps everything else', () => {
  const board = parseBoard(detailed);
  const edited = editTask(detailed, { revision: board.revision, id: 'task-first-move', title: 'Move a card 🔁 every week', due: '2026-12-01', priority: 'low' });
  assert.match(edited, /- \[ \] Move a card 🔁 every week 🔽 📅 2026-12-01 \^task-first-move\n  - a detail line\n  - another detail/);
  const task = parseBoard(edited).tasks.find(item => item.id === 'task-first-move');
  assert.equal(task.section, 'Now');
  assert.equal(task.due, '2026-12-01');
  assert.equal(task.priority, 'low');
});

test('editing can clear the due date and priority', () => {
  const board = parseBoard(detailed);
  const edited = editTask(detailed, { revision: board.revision, id: 'task-first-move', title: 'Move a card', due: null, priority: null });
  assert.match(edited, /- \[ \] Move a card \^task-first-move\n  - a detail line/);
});

test('editing keeps a done task done and rejects bad input', () => {
  const { revision } = parseBoard(sample);
  const edited = editTask(sample, { revision, id: 'task-small-problem', title: 'Start small' });
  assert.match(edited, /- \[x\] Start small \^task-small-problem/);
  const base = { revision, id: 'task-small-problem' };
  assert.throws(() => editTask(sample, { ...base, title: '  ' }), /task title/);
  assert.throws(() => editTask(sample, { ...base, title: 'Hi ⏫' }), /fields/);
  assert.throws(() => editTask(sample, { ...base, title: 'Hi', due: '2026-02-31' }), /valid due date/);
  assert.throws(() => editTask(sample, { ...base, title: 'Hi', priority: 'urgent' }), /high, medium, or low/);
  assert.throws(() => editTask(sample, { ...base, title: 'Hi', id: 'task-nope' }), /not found/);
  assert.throws(() => editTask(sample, { ...base, title: 'Hi', revision: 'stale' }), /changed/);
});

test('deleting removes the task and its details only', () => {
  const board = parseBoard(detailed);
  const result = deleteTask(detailed, { revision: board.revision, id: 'task-first-move' });
  assert.ok(!result.includes('task-first-move'));
  assert.ok(!result.includes('a detail line'));
  assert.ok(result.includes('task-learn-the-flow'));
  assert.equal(parseBoard(result).tasks.length, board.tasks.length - 1);
  assert.throws(() => deleteTask(detailed, { revision: 'stale', id: 'task-first-move' }), /changed/);
  assert.throws(() => deleteTask(detailed, { revision: board.revision, id: 'task-nope' }), /not found/);
});


test('editing a task without an ID gives it one and keeps its details', () => {
  const noId = sample.replace('- [ ] Open the board and move a card ⏫ ^task-first-move', '- [ ] A task with no ID ⏫\n  - keep me');
  const board = parseBoard(noId);
  const line = board.tasks.find(item => item.text.startsWith('A task with no ID')).line;
  const edited = editTask(noId, { revision: board.revision, line, title: 'A task with no ID, edited' });
  assert.match(edited, /- \[ \] A task with no ID, edited \^task-[a-f0-9]{8}\n  - keep me/);
  const task = parseBoard(edited).tasks.find(item => item.title === 'A task with no ID, edited');
  assert.match(task.id, /^task-[a-f0-9]{8}$/);
  assert.equal(task.section, 'Now');
});

test('editing a task that has an ID leaves the ID alone', () => {
  const { revision } = parseBoard(sample);
  const edited = editTask(sample, { revision, id: 'task-first-move', title: 'Move a card' });
  assert.match(edited, /- \[ \] Move a card \^task-first-move/);
});

// --- Tags ---

test('reads tags and keeps wiki-link headings and web addresses out of them', () => {
  const read = readTokens('Call #mum about #work/report ⏫ [[Note#Heading]] https://x.com/#top #2026');
  assert.deepEqual(read.tags, ['mum', 'work/report']);
  assert.equal(read.title, 'Call about [[Note#Heading]] https://x.com/#top #2026');
});

test('creates and edits a task with tags, written after the title', () => {
  const { revision } = parseBoard(sample);
  const created = createTask(sample, { revision, id: 'task-0a1b2c3d', title: 'Buy milk', tags: ['#errands', 'home'], priority: 'low', due: '2026-11-20' });
  assert.match(created, /- \[ \] Buy milk #errands #home 🔽 📅 2026-11-20 \^task-0a1b2c3d/);
  const task = parseBoard(created).tasks.find(item => item.id === 'task-0a1b2c3d');
  assert.deepEqual(task.tags, ['errands', 'home']);
  assert.equal(task.title, 'Buy milk');
  const edited = editTask(created, { revision: parseBoard(created).revision, id: task.id, title: 'Buy oat milk', tags: ['errands'], priority: 'low', due: '2026-11-20' });
  assert.match(edited, /Buy oat milk #errands 🔽 📅 2026-11-20 \^task-0a1b2c3d/);
});

test('rejects bad tags and tags typed into the title', () => {
  const { revision } = parseBoard(sample);
  const base = { revision, id: 'task-0a1b2c3d', title: 'Buy milk' };
  assert.throws(() => createTask(sample, { ...base, tags: ['two words'] }), /Tags use letters/);
  assert.throws(() => createTask(sample, { ...base, tags: ['123'] }), /Tags use letters/);
  assert.throws(() => createTask(sample, { ...base, tags: 'home' }), /up to 20 tags/);
  assert.throws(() => createTask(sample, { ...base, title: 'Buy milk #home' }), /tags field/);
});

// --- Sub-tasks ---

const withParent = sample.replace('## Inbox\n', '## Inbox\n- [ ] Plan trip ^task-aaaa1111\n  - a detail line\n');
const idOf = text => parseBoard(text).tasks.find(item => item.id === 'task-aaaa1111');

test('adds sub-tasks under the task, after its details, and reads them back', () => {
  let text = addSubtask(withParent, { revision: parseBoard(withParent).revision, id: 'task-aaaa1111', title: 'Book flights' });
  text = addSubtask(text, { revision: parseBoard(text).revision, id: 'task-aaaa1111', title: 'Pack' });
  assert.match(text, /- \[ \] Plan trip \^task-aaaa1111\n  - a detail line\n  - \[ \] Book flights\n  - \[ \] Pack\n/);
  const parent = idOf(text);
  assert.deepEqual(parent.subtasks.map(item => [item.index, item.text, item.checked]), [[0, 'Book flights', false], [1, 'Pack', false]]);
});

test('ticks, unticks, and deletes a sub-task without touching anything else', () => {
  const added = addSubtask(withParent, { revision: parseBoard(withParent).revision, id: 'task-aaaa1111', title: 'Book flights' });
  const ticked = toggleSubtask(added, { revision: parseBoard(added).revision, id: 'task-aaaa1111', index: 0 });
  assert.match(ticked, /  - \[x\] Book flights/);
  assert.equal(idOf(ticked).subtasks[0].checked, true);
  assert.equal(idOf(ticked).checked, false);
  const unticked = toggleSubtask(ticked, { revision: parseBoard(ticked).revision, id: 'task-aaaa1111', index: 0 });
  assert.equal(unticked, added);
  const removed = deleteSubtask(added, { revision: parseBoard(added).revision, id: 'task-aaaa1111', index: 0 });
  assert.equal(removed, withParent);
});

test('sub-tasks move with their task and keep the file ending style', () => {
  const crlf = withParent.replaceAll('\n', '\r\n');
  const added = addSubtask(crlf, { revision: parseBoard(crlf).revision, id: 'task-aaaa1111', title: 'Book flights' });
  assert.match(added, /  - \[ \] Book flights\r\n/);
  const moved = moveTask(added, { revision: parseBoard(added).revision, id: 'task-aaaa1111', target: 'Now' });
  const parent = idOf(moved);
  assert.equal(parent.section, 'Now');
  assert.equal(parent.subtasks.length, 1);
});

test('sub-task changes check input, revision, and that the task exists', () => {
  const { revision } = parseBoard(withParent);
  assert.throws(() => addSubtask(withParent, { revision, id: 'task-aaaa1111', title: '  ' }), /task title/);
  assert.throws(() => addSubtask(withParent, { revision: 'old', id: 'task-aaaa1111', title: 'x' }), /changed/);
  assert.throws(() => addSubtask(withParent, { revision, id: 'task-nope', title: 'x' }), /not found/);
  assert.throws(() => toggleSubtask(withParent, { revision, id: 'task-aaaa1111', index: 0 }), /Sub-task not found/);
  assert.throws(() => toggleSubtask(withParent, { revision, id: 'task-aaaa1111', index: 'a' }), /Sub-task not found/);
});
