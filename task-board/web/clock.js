// The time and date in the page header, in this computer's own time zone and format.
// It ticks right on the minute, and calls onTick so the greeting and "due today" can follow the clock.
export function startClock({ element, onTick }) {
  const time = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' });
  const date = new Intl.DateTimeFormat([], { weekday: 'short', month: 'short', day: 'numeric' });

  function show() {
    const now = new Date();
    element.textContent = `${time.format(now)} · ${date.format(now).toLowerCase()}`;
    element.dateTime = now.toISOString();
    onTick();
  }

  function schedule() {
    // Wake just after the next minute begins, so the clock is never a minute behind.
    setTimeout(() => { show(); schedule(); }, 60000 - (Date.now() % 60000) + 50);
  }

  show();
  schedule();
}
