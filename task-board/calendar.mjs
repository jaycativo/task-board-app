// Date helpers for the date picker. A date is a calendar day written YYYY-MM-DD.
// They are built from local year, month, and day, never moved through UTC,
// so a day cannot flip early or late.

const pad = number => String(number).padStart(2, '0');

// month is 0 to 11, like the JavaScript Date.
export const formatDate = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

// Returns { year, month, day } for a real date, or null for anything else.
export function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === 'string' ? value : '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? { year, month, day } : null;
}

// Six weeks of days that start on a Monday and include the whole month.
export function monthGrid(year, month) {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month, 1 - offset + index);
    return {
      value: formatDate(date.getFullYear(), date.getMonth(), date.getDate()),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    };
  });
}

export function shiftMonth(year, month, by) {
  const date = new Date(year, month + by, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}
