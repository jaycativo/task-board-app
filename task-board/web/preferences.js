// The footer's switches and the sort buttons. Each choice is remembered in the browser.
import { state } from './state.js';

// Safe to call even if the browser will not let the page store things.
function remember(key, value) {
  try { localStorage.setItem(key, value); } catch { /* the choice just is not remembered */ }
}
function recall(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function initPreferences({ onSortChange }) {
  // Colour theme: Auto follows the system, Light and Dark override it.
  // (theme.js has already applied a saved choice, before the page was drawn.)
  function setTheme(choice) {
    const theme = choice === 'light' || choice === 'dark' ? choice : 'auto';
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme)));
    return theme;
  }
  setTheme(recall('theme'));
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => {
    remember('theme', setTheme(button.dataset.themeChoice));
  }));

  // The colour-blind palette.
  const paletteButton = document.querySelector('#palette');
  function setPalette(colourBlind) {
    document.documentElement.dataset.palette = colourBlind ? 'cb' : '';
    paletteButton.setAttribute('aria-pressed', String(colourBlind));
    paletteButton.textContent = `Colour-blind palette: ${colourBlind ? 'on' : 'off'}`;
  }
  setPalette(recall('palette') === 'cb');
  paletteButton.addEventListener('click', () => {
    const next = paletteButton.getAttribute('aria-pressed') !== 'true';
    setPalette(next);
    remember('palette', next ? 'cb' : '');
  });

  // How cards are ordered in each column. This only changes the view, never the file.
  function setSort(mode) {
    state.sortMode = ['file', 'priority', 'due'].includes(mode) ? mode : 'file';
    document.querySelectorAll('.sort button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sort === state.sortMode)));
  }
  setSort(recall('sort'));
  document.querySelectorAll('.sort button').forEach(button => button.addEventListener('click', () => {
    setSort(button.dataset.sort);
    remember('sort', state.sortMode);
    onSortChange();
  }));
}
