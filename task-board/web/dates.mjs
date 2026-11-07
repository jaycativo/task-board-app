// Turning stored YYYY-MM-DD dates into words. Everything uses the viewer's own calendar day,
// built from local year, month, and day, so a date never shifts by a day.
// The optional locale is only for tests; the page uses the browser's own.
import { parseDate } from './calendar.mjs';

// A short friendly label: "today", "tomorrow", "fri", "20 nov", "2d late".
export function dueLabel(due, today = new Date(), locale = []) {
  const [year, month, day] = due.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1) return { text: due, late: false };
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((date - start) / 86400000);
  if (days < 0) {
    const ago = -days;
    return { text: ago < 7 ? `${ago}d late` : `${Math.floor(ago / 7)}w late`, late: true };
  }
  if (days === 0) return { text: 'today', late: false };
  if (days === 1) return { text: 'tomorrow', late: false };
  if (days < 7) return { text: date.toLocaleDateString(locale, { weekday: 'short' }).toLowerCase(), late: false };
  const options = { month: 'short', day: 'numeric', ...(year !== start.getFullYear() && { year: 'numeric' }) };
  return { text: date.toLocaleDateString(locale, options).toLowerCase(), late: false };
}

// The whole date in words, for tooltips and screen readers: "Saturday, 7 November 2026".
export function fullDate(value, locale = []) {
  const parsed = parseDate(value);
  if (!parsed) return value;
  return new Date(parsed.year, parsed.month, parsed.day).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
