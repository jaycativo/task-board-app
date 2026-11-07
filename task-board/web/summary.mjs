// The words in the page header: a greeting for the time of day, and a one-line summary of the board.
import { formatDate } from './calendar.mjs';

// "good morning" ... "up late". Only the Playful style uses it.
export function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'good morning';
  if (hour >= 12 && hour < 18) return 'good afternoon';
  if (hour >= 18 && hour < 22) return 'good evening';
  return 'up late';
}

// Minimal: "5 open · 1 complete". Playful adds what needs attention: "2 due today · 1 overdue · 5 open · 1 done".
// Rejected tasks never count as open.
export function summaryLine(tasks, style, now = new Date()) {
  const open = tasks.filter(task => !task.checked && task.section !== 'Rejected');
  const done = tasks.filter(task => task.checked).length;
  if (style !== 'playful') return `${open.length} open · ${done} complete`;
  const today = formatDate(now.getFullYear(), now.getMonth(), now.getDate());
  const dueToday = open.filter(task => task.due === today).length;
  const overdue = open.filter(task => task.due && task.due < today).length;
  const parts = [];
  if (dueToday) parts.push(`${dueToday} due today`);
  if (overdue) parts.push(`${overdue} overdue`);
  parts.push(`${open.length} open`, `${done} done`);
  return parts.join(' · ');
}
