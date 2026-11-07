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
