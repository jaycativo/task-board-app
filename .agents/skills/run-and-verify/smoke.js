// A smoke test for the page. It uses every feature once and reports what failed.
//
// Run it ONLY on a scratch copy of the sample TODO.md (it creates, moves, edits, and
// deletes tasks, writes notes, and archives). See SKILL.md for how to start one.
// Paste the whole file into the browser console on the board's page, or hand it to a
// browser tool that can run JavaScript. It resolves to { passed, failed, failures }.
(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const results = [];
  const check = (name, ok, detail = '') => results.push(ok ? { name, ok: true } : { name, ok: false, detail: String(detail) });
  const errors = [];
  window.addEventListener('error', event => errors.push(event.message));

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const card = text => $$('.card').find(item => item.textContent.includes(text));
  const columnOf = element => element?.closest('.column')?.querySelector('h2')?.textContent;
  const saved = (ms = 800) => wait(ms);
  // A mouse press and release at a point, as a person clicking the dimmed backdrop would make.
  const clickAt = (element, x, y) => {
    for (const type of ['mousedown', 'mouseup', 'click']) element.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
  };

  async function run() {
    window.confirm = () => true;
    try { localStorage.clear(); } catch { /* fine */ }
    await wait(600);

    // --- The page is drawn
    const headings = $$('h2').map(heading => heading.textContent);
    check('the columns are drawn', ['Later', 'Next', 'Now', 'In progress', 'Done'].every(name => headings.includes(name)), headings);
    check('Inbox has an open/closed arrow', Boolean($('#intake summary .chevron')));
    check('the open and done counts are shown', /\d+ open · \d+ complete/.test($('#total').textContent), $('#total').textContent);
    check('a task with a priority shows its chip', Boolean(card('move a card')?.querySelector('.priority-high')));

    // --- Search
    const search = $('#task-search');
    search.value = 'reading';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(150);
    check('search narrows the cards', $$('.card').length === 1, $$('.card').length);
    $('#search-clear').click();
    await wait(150);
    check('clearing search brings every card back', $$('.card').length > 1);

    // --- Create a task, with the calendar
    $('#new-task').click();
    await wait(200);
    $('#new-task-title').value = 'Smoke test task';
    $('#new-task-due').click();
    await wait(100);
    check('clicking the date field opens the calendar', !$('#calendar').hidden);
    $('[data-key="next"]').click();
    await wait(60);
    $('[data-key="next"]').click();
    await wait(60);
    check('the month arrows keep the calendar open', !$('#calendar').hidden);
    $$('.cal-day:not(.outside)').find(button => button.textContent === '15').click();
    await wait(60);
    check('picking a day fills the field and keeps the calendar open', !$('#calendar').hidden && /^\d{4}-\d{2}-15$/.test($('#new-task-due').value), $('#new-task-due').value);
    $('.cal-done').click();
    await wait(60);
    check('Done closes the calendar but not the dialog', $('#calendar').hidden && $('#task-dialog').open);
    $('#new-task-priority [data-value="high"]').click();
    $('#task-form').requestSubmit();
    await saved();
    const made = card('Smoke test task');
    check('a new task appears in Inbox with its date and priority', made && made.closest('#intake') && made.querySelector('.priority-high') && made.querySelector('.chip.due'), made?.textContent);

    // --- Edit
    made.querySelector('.edit').click();
    await wait(200);
    check('the edit dialog is filled in', $('#new-task-title').value === 'Smoke test task' && $('#new-task-priority [aria-pressed="true"]').dataset.value === 'high');
    $('#new-task-title').value = 'Smoke test task (edited)';
    $('#task-form').requestSubmit();
    await saved();
    check('editing saves', Boolean(card('(edited)')));

    // --- Reject, restore
    const menu = card('(edited)').querySelector('.move-menu');
    menu.open = true;
    check('the Move menu lists Rejected', [...menu.querySelectorAll('.menu-item')].some(item => item.textContent.startsWith('Rejected')));
    [...menu.querySelectorAll('.menu-item')].find(item => item.textContent.startsWith('Rejected')).click();
    await saved();
    const rejected = $('#rejected details');
    check('moving to Rejected opens the Rejected panel', rejected?.open && columnOf(card('(edited)')) === 'Rejected', columnOf(card('(edited)')));
    check('the arrow turns when a panel is open', rejected && getComputedStyle(rejected.querySelector('.chevron')).transform !== 'none');
    card('(edited)').querySelector('.restore').click();
    await saved();
    check('Restore sends it back to Inbox', columnOf(card('(edited)')) === 'Inbox', columnOf(card('(edited)')));

    // --- Drag and drop
    const data = new DataTransfer();
    card('(edited)').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
    const next = $('section.column-next');
    next.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
    next.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
    await saved();
    check('dragging a card to a column moves it', columnOf(card('(edited)')) === 'Next', columnOf(card('(edited)')));

    // --- Sorting (our task goes low, so it sorts after the medium one already in Next)
    card('(edited)').querySelector('.edit').click();
    await wait(200);
    $('#new-task-priority [data-value="low"]').click();
    $('#task-form').requestSubmit();
    await saved();
    const order = () => $$('section.column-next .task-title').map(title => title.textContent);
    const fileOrder = order();
    $('.sort [data-sort="priority"]').click();
    await wait(150);
    const byPriority = order();
    $('.sort [data-sort="file"]').click();
    check('sorting by priority puts medium before low', fileOrder[0].includes('(edited)') && byPriority[byPriority.length - 1].includes('(edited)'), [fileOrder, byPriority]);

    // --- Notes drawer
    card('(edited)').querySelector('.add-note').click();
    await wait(500);
    check('the notes drawer opens', $('#note-dialog').open);
    $('#note-text').value = 'Smoke note';
    $('#note-form').requestSubmit();
    await saved(1000);
    check('a note is saved and counted on the card', card('(edited)').querySelector('.add-note').textContent.includes('1'), card('(edited)').querySelector('.add-note').textContent);
    // Hold on to the note: once Edit is pressed its text moves into a box, so it can no longer be found by its words.
    const entry = $$('.saved-note').find(item => item.textContent.includes('Smoke note'));
    entry.querySelector('.saved-note-actions button').click();
    await wait(100);
    entry.querySelector('.note-edit').value = 'Smoke note, changed';
    entry.querySelector('.note-edit-actions button:last-child').click();
    await saved(1000);
    check('a note can be edited', $$('.saved-note-text').some(text => text.textContent === 'Smoke note, changed'));
    $$('.saved-note').find(item => item.textContent.includes('changed')).querySelector('.note-delete').click();
    await saved(1000);
    check('a note can be deleted and the count clears', $$('.saved-note').length === 0 && card('(edited)').querySelector('.add-note').textContent === 'Notes', card('(edited)').querySelector('.add-note').textContent);
    $('#note-text').value = 'an unsent thought';
    clickAt($('#note-dialog'), 2, 2);
    await wait(150);
    check('an outside click keeps the drawer open when a draft would be lost', $('#note-dialog').open && /unsaved/.test($('#note-status').textContent), $('#note-status').textContent);
    $('#note-text').value = '';
    clickAt($('#note-dialog'), 2, 2);
    await wait(150);
    check('an outside click closes the drawer', !$('#note-dialog').open);

    // --- Pop-ups close one layer at a time
    $('#new-task').click();
    await wait(200);
    $('#new-task-due').click();
    await wait(100);
    clickAt($('#task-dialog'), 2, 2);
    await wait(150);
    check('the first outside click closes only the calendar', $('#calendar').hidden && $('#task-dialog').open);
    clickAt($('#task-dialog'), 2, 2);
    await wait(150);
    check('the next outside click closes the dialog', !$('#task-dialog').open);

    // --- Theme and palette
    const background = () => getComputedStyle(document.body).backgroundColor;
    $('[data-theme-choice="dark"]').click();
    const dark = background();
    $('[data-theme-choice="light"]').click();
    const light = background();
    check('the theme switch changes the colours', dark !== light && document.documentElement.dataset.theme === 'light', [dark, light]);
    $('[data-theme-choice="auto"]').click();
    check('Auto removes the override', !document.documentElement.dataset.theme);
    $('#palette').click();
    check('the colour-blind palette switches on', document.documentElement.dataset.palette === 'cb');
    $('#palette').click();

    // --- Style, clock, and sparkle
    check('the clock shows the time and date', /\d{1,2}:\d{2}/.test($('#clock').textContent) && $('#clock').dateTime, $('#clock').textContent);
    check('Playful greets by the time of day, with a highlight', /^(good morning|good afternoon|good evening|up late), friend$/.test($('#title').textContent) && Boolean($('#title .title-hl')), $('#title').textContent);
    const headingBackground = () => getComputedStyle($('.column-now .column-heading')).backgroundColor;
    const playfulBackground = headingBackground();
    $('[data-style-choice="minimal"]').click();
    await wait(150);
    check('Minimal keeps the plain title and flattens the headings', $('#title').textContent === 'good work, friend' && headingBackground() === 'rgba(0, 0, 0, 0)' && playfulBackground !== 'rgba(0, 0, 0, 0)', [$('#title').textContent, playfulBackground, headingBackground()]);
    $('[data-style-choice="playful"]').click();
    await wait(150);
    check('switching back to Playful brings the colour back', headingBackground() === playfulBackground);
    const finishing = card('Learn how the task file');
    const finishMenu = finishing.querySelector('.move-menu');
    finishMenu.open = true;
    [...finishMenu.querySelectorAll('.menu-item')].find(item => item.textContent.startsWith('Done')).click();
    await saved();
    check('finishing a task sparkles in Playful', card('Learn how the task file')?.classList.contains('just-done'), card('Learn how the task file')?.className);

    // --- Archive, and delete
    check('there is a Done task to archive', Boolean(card('Start with a small problem')));
    $('.archive')?.click();
    await saved();
    check('Archive all empties Done', $$('section.column-done .card').length === 0);
    card('(edited)').querySelector('.edit').click();
    await wait(200);
    $('#task-delete').click();
    await saved();
    check('a task can be deleted from its edit dialog', !card('(edited)'));
  }

  // If something needed is missing, report it with the results so far instead of stopping silently.
  try { await run(); } catch (error) { check('the smoke test ran to the end', false, error.stack || error); }
  check('no script errors were raised', errors.length === 0, errors);
  const failures = results.filter(result => !result.ok);
  return { passed: results.length - failures.length, failed: failures.length, failures };
})()
