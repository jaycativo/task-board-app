// Talking to the board's server.

export async function request(url, options) {
  let response;
  try { response = await fetch(url, options); }
  catch { throw new Error("Can't reach the board's server. If you closed it, start it again with bash start.sh."); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request failed.');
  return result;
}

export const post = (url, body) => request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
