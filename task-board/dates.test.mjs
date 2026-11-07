import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueLabel, fullDate } from './web/dates.mjs';

// Saturday 7 November 2026, at lunchtime. A time of day must never move the labels.
const today = new Date(2026, 10, 7, 13, 30);
const label = due => dueLabel(due, today, 'en-US');

test('today and tomorrow', () => {
  assert.deepEqual(label('2026-11-07'), { text: 'today', late: false });
  assert.deepEqual(label('2026-11-08'), { text: 'tomorrow', late: false });
});

test('the next six days show the weekday', () => {
  assert.deepEqual(label('2026-11-09'), { text: 'mon', late: false });
  assert.deepEqual(label('2026-11-13'), { text: 'fri', late: false });
});

test('a week or more away shows the date, with the year only when it is another year', () => {
  assert.deepEqual(label('2026-11-14'), { text: 'nov 14', late: false });
  assert.deepEqual(label('2026-12-25'), { text: 'dec 25', late: false });
  assert.deepEqual(label('2027-01-05'), { text: 'jan 5, 2027', late: false });
});

test('past dates are late, in days and then weeks', () => {
  assert.deepEqual(label('2026-11-06'), { text: '1d late', late: true });
  assert.deepEqual(label('2026-11-01'), { text: '6d late', late: true });
  assert.deepEqual(label('2026-10-31'), { text: '1w late', late: true });
  assert.deepEqual(label('2026-10-08'), { text: '4w late', late: true });
});

test('the label does not move across midnight or a month end', () => {
  assert.equal(dueLabel('2026-12-01', new Date(2026, 10, 30, 23, 59), 'en-US').text, 'tomorrow');
  assert.equal(dueLabel('2026-12-01', new Date(2026, 11, 1, 0, 1), 'en-US').text, 'today');
  assert.equal(dueLabel('2027-01-01', new Date(2026, 11, 31, 12), 'en-US').text, 'tomorrow');
});

test('an impossible date is shown as it was written', () => {
  assert.deepEqual(label('2026-02-31'), { text: '2026-02-31', late: false });
});

test('the full date reads as words', () => {
  assert.equal(fullDate('2026-11-07', 'en-US'), 'Saturday, November 7, 2026');
  assert.equal(fullDate('2026-02-31', 'en-US'), '2026-02-31');
});
