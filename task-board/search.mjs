export function filterTasks(tasks, query) {
  const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const text = query.trim().replace(/^\[\[TODO(?:\.md)?#\^([A-Za-z0-9-]+)(?:\|.*?)?\]\]$/i, '$1').replace(/^\^/, '');
  if (!text) return tasks;
  const terms = normalize(text).split(/\s+/);
  return tasks.filter(task => {
    const content = normalize(`${task.title ?? task.text} ${task.id || ''} ${task.priority || ''} ${task.due || ''}`);
    return terms.every(term => content.includes(term));
  });
}

const priorityOrder = { high: 0, medium: 1, low: 2 };
const byPriority = task => priorityOrder[task.priority] ?? 3;
const byDue = task => task.due ?? '9999-99-99';

// Orders cards for display only. "file" keeps the order in TODO.md.
// "priority" puts high first and breaks ties by due date. "due" puts the earliest first and breaks ties by priority.
// Tasks without a priority or due date go last, and anything still tied keeps its order in the file.
export function sortTasks(tasks, mode) {
  if (mode !== 'priority' && mode !== 'due') return tasks;
  const keys = mode === 'priority' ? [byPriority, byDue] : [byDue, byPriority];
  return [...tasks].sort((a, b) => {
    for (const key of keys) {
      const left = key(a);
      const right = key(b);
      if (left < right) return -1;
      if (left > right) return 1;
    }
    return a.line - b.line;
  });
}
