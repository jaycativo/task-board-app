// Applies the saved colour theme and style before the page is drawn, so there is no flash of the wrong ones.
// preferences.js sets up the switches and saves the choices under the same keys.
try {
  const theme = localStorage.getItem('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  if (localStorage.getItem('style') === 'minimal') document.documentElement.dataset.style = 'minimal';
} catch (error) { /* no saved choice */ }
