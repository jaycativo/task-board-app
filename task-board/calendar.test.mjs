import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, parseDate, monthGrid, shiftMonth } from './calendar.mjs';

test('formats a date with padded month and day', () => {
  assert.equal(formatDate(2026, 10, 7), '2026-11-07');
  assert.equal(formatDate(2026, 0, 31), '2026-01-31');
});

test('parses real dates and rejects anything else', () => {
  assert.deepEqual(parseDate('2026-11-07'), { year: 2026, month: 10, day: 7 });
  assert.deepEqual(parseDate('2028-02-29'), { year: 2028, month: 1, day: 29 });
  for (const bad of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-00-10', '2026-1-1', 'tomorrow', '', null, undefined, 20261107]) {
    assert.equal(parseDate(bad), null, String(bad));
  }
});

test('a month grid has six weeks, starts on a Monday, and marks the month', () => {
  const grid = monthGrid(2026, 10);
  assert.equal(grid.length, 42);
  assert.equal(grid[0].value, '2026-10-26');
  assert.equal(new Date(2026, 9, 26).getDay(), 1);
  assert.equal(grid.filter(cell => cell.inMonth).length, 30);
  assert.deepEqual(grid.filter(cell => cell.inMonth).map(cell => cell.day).slice(0, 3), [1, 2, 3]);
  assert.equal(grid.find(cell => cell.value === '2026-11-01').inMonth, true);
  assert.equal(grid.at(-1).value, '2026-12-06');
});

test('a month that starts on a Monday has no leading days', () => {
  const grid = monthGrid(2026, 5);
  assert.equal(grid[0].value, '2026-06-01');
  assert.equal(grid[0].inMonth, true);
});

test('shifting a month wraps across the year', () => {
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, month: 11 });
  assert.deepEqual(shiftMonth(2026, 5, 0), { year: 2026, month: 5 });
});
