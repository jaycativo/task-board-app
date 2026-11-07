// A readability check for the page. For every combination of theme (light, dark) and style
// (Playful, Minimal), it opens each overlay (the task dialog with its calendar, a Move menu, the
// notes drawer) and measures the contrast of every piece of visible text against what is behind it.
//
// Run it on a scratch copy of a board that has tasks, a card with a note, and some finished tasks
// (the demo vault used for the README screenshots is a good one). Paste the whole file into the
// browser console on the board's page, or hand it to a browser tool that can run JavaScript.
// It resolves to { checked, failures, lowest }. Expect failures to be empty.
//
// The standard (WCAG AA): at least 4.5 to 1 for text, or 3 to 1 for large text (24px and up).
(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const parse = colour => { const [r, g, b, a = 1] = colour.match(/[\d.]+/g).map(Number); return { r, g, b, a }; };
  const linear = value => { value /= 255; return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
  const luminance = ({ r, g, b }) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  const contrast = (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };
  // What is really behind a piece of text: the nearest ancestor with a solid background.
  const backgroundOf = element => {
    for (let node = element; node; node = node.parentElement) {
      const colour = parse(getComputedStyle(node).backgroundColor);
      if (colour.a > 0.5) return colour;
    }
    return parse(getComputedStyle(document.body).backgroundColor);
  };

  const results = [];
  function measure(where) {
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      const element = walker.currentNode.parentElement;
      if (!text || !element || element.closest('script, style') || element.getClientRects().length === 0) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden') continue;
      const foreground = parse(style.color);
      const background = backgroundOf(element);
      const key = `${element.className}|${style.color}|${background.r},${background.g},${background.b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const needed = parseFloat(style.fontSize) >= 24 ? 3 : 4.5;
      results.push({ where, text: text.slice(0, 26), what: String(element.className || element.tagName).slice(0, 36), size: style.fontSize, ratio: +contrast(foreground, background).toFixed(2), needed });
    }
  }

  window.confirm = () => true;
  try { localStorage.clear(); } catch { /* fine */ }
  await wait(500);
  for (const theme of ['light', 'dark']) {
    for (const mode of ['playful', 'minimal']) {
      $(`[data-theme-choice="${theme}"]`).click();
      $(`[data-style-choice="${mode}"]`).click();
      await wait(150);
      const where = `${theme}/${mode}`;
      $('#intake details').open = true;
      if ($('#rejected details')) $('#rejected details').open = true;
      await wait(100);
      measure(`${where} board`);
      $('#new-task').click();
      await wait(150);
      $('#new-task-title').value = 'A task';
      $('#new-task-due').click();
      await wait(100);
      measure(`${where} task dialog`);
      $('#task-dialog').close();
      const menu = $$('.move-menu')[0];
      menu.open = true;
      await wait(60);
      measure(`${where} move menu`);
      menu.open = false;
      const withNotes = $$('.add-note').find(button => /·/.test(button.textContent)) || $('.add-note');
      withNotes.click();
      await wait(600);
      measure(`${where} notes drawer`);
      $('#note-dialog').close();
    }
  }
  $('[data-theme-choice="auto"]').click();
  $('[data-style-choice="playful"]').click();
  const failures = results.filter(row => row.ratio < row.needed);
  const lowest = [...results].sort((a, b) => a.ratio - b.ratio).slice(0, 6).map(row => `${row.ratio} (${row.where}) ${row.what} "${row.text}" ${row.size}`);
  return { checked: results.length, failures: failures.map(row => `${row.ratio} < ${row.needed} (${row.where}) ${row.what} "${row.text}" ${row.size}`), lowest };
})()
