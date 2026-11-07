// Applies the saved colour theme before the page is drawn, so there is no flash of the wrong colours.
// app.js sets up the switch and saves the choice under the same key.
try {
  const theme = localStorage.getItem('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch (error) { /* no saved choice */ }
