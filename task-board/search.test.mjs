import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortTasks, filterTasks, filterByTags, tagCounts } from './web/search.mjs';

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

const tagged = [
  { line: 1, title: 'milk', tags: ['errands', 'home'] },
  { line: 2, title: 'taxes', tags: ['admin'] },
  { line: 3, title: 'bins', tags: ['home'], subtasks: [{ text: 'blue bin' }] },
  { line: 4, title: 'plain' },
];

test('counts tags, most used first', () => {
  assert.deepEqual(tagCounts(tagged), [{ tag: 'home', count: 2 }, { tag: 'admin', count: 1 }, { tag: 'errands', count: 1 }]);
});

test('filters by one tag, or by all chosen tags', () => {
  assert.deepEqual(titles(filterByTags(tagged, ['home'])), ['milk', 'bins']);
  assert.deepEqual(titles(filterByTags(tagged, ['home', 'errands'])), ['milk']);
  assert.equal(filterByTags(tagged, []), tagged);
});

test('search finds tags and sub-task text', () => {
  assert.deepEqual(titles(filterTasks(tagged, '#admin')), ['taxes']);
  assert.deepEqual(titles(filterTasks(tagged, 'blue')), ['bins']);
});
