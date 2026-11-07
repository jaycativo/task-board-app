// An error with an HTTP status. The server turns it into a plain message for the page.
export function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
