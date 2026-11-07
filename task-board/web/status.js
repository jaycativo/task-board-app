// The status line under the search bar ("Saved to TODO.md · ...").
const line = document.querySelector('#message');

export function showMessage(text, isError = false) {
  line.textContent = text;
  line.classList.toggle('error', isError);
}

// A message that holds more than text, such as a link.
export function showMessageNodes(...nodes) {
  line.replaceChildren(...nodes);
  line.classList.remove('error');
}

export const messageIsError = () => line.classList.contains('error');
