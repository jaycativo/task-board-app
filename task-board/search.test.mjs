import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortTasks, filterTasks } from './search.mjs';

const task = (line, title, priority = null, due = null) => ({ line, title, priority, due });
const tasks = [
  task(1, 'plain'),
  task(2, 'low soon', 'low', '2026-11-08'),
  task(3, 'high later', 'high', '2026-12-01'),
  task(4, 'high soon', 'high', '2026-11-08'),
  task(5, 'medium', 'medium'),
  task(6, 'dated only', null, '2026-11-01'),
  task(7, 'high undated', 'high'),
];
const titles = list => list.map(item => item.title);

test('file order is left alone', () => {
  assert.deepEqual(titles(sortTasks(tasks, 'file')), titles(tasks));
  assert.equal(sortTasks(tasks, 'file'), tasks);
});

test('priority puts high first, then breaks ties by due date', () => {
  assert.deepEqual(titles(sortTasks(tasks, 'priority')), ['high soon', 'high later', 'high undated', 'medium', 'low soon', 'dated only', 'plain']);
});

test('due date puts the earliest first, then breaks ties by priority', () => {
  assert.deepEqual(titles(sortTasks(tasks, 'due')), ['dated only', 'high soon', 'low soon', 'high later', 'high undated', 'medium', 'plain']);
});

test('sorting does not change the original list', () => {
  const before = titles(tasks);
  sortTasks(tasks, 'priority');
  assert.deepEqual(titles(tasks), before);
});

test('search still finds tasks by priority and date', () => {
  assert.deepEqual(titles(filterTasks(tasks, 'high 2026-12')), ['high later']);
});
