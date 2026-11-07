import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greeting, summaryLine } from './web/summary.mjs';

const at = hour => new Date(2026, 10, 7, hour, 30);

test('the greeting follows the time of day', () => {
  assert.equal(greeting(at(5)), 'good morning');
  assert.equal(greeting(at(11)), 'good morning');
  assert.equal(greeting(at(12)), 'good afternoon');
  assert.equal(greeting(at(17)), 'good afternoon');
  assert.equal(greeting(at(18)), 'good evening');
  assert.equal(greeting(at(21)), 'good evening');
  assert.equal(greeting(at(22)), 'up late');
  assert.equal(greeting(at(0)), 'up late');
  assert.equal(greeting(at(4)), 'up late');
});

const now = new Date(2026, 10, 7, 9);
const task = (extra = {}) => ({ checked: false, section: 'Now', due: null, ...extra });

test('the minimal summary counts open and complete, and ignores rejected tasks', () => {
  const tasks = [task(), task(), task({ checked: true, section: 'Done' }), task({ section: 'Rejected' })];
  assert.equal(summaryLine(tasks, 'minimal', now), '2 open · 1 complete');
});

test('the playful summary says what is due today and overdue, when there is any', () => {
  const tasks = [
    task({ due: '2026-11-07' }), task({ due: '2026-11-07' }), task({ due: '2026-11-01' }), task({ due: '2026-11-20' }),
    task({ checked: true, section: 'Done', due: '2026-11-07' }), task({ section: 'Rejected', due: '2026-11-07' }),
  ];
  assert.equal(summaryLine(tasks, 'playful', now), '2 due today · 1 overdue · 4 open · 1 done');
});

test('the playful summary leaves out parts that are zero', () => {
  assert.equal(summaryLine([task(), task({ checked: true, section: 'Done' })], 'playful', now), '1 open · 1 done');
  assert.equal(summaryLine([], 'playful', now), '0 open · 0 done');
});

test('a done task is never overdue or due today', () => {
  const tasks = [task({ checked: true, section: 'Done', due: '2026-11-01' })];
  assert.equal(summaryLine(tasks, 'playful', now), '0 open · 1 done');
});
