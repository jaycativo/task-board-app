---
name: server-safety
description: Security rules for the local server and the page it serves. Read before adding or changing an endpoint, a file write, a static file, or anything in the response headers.
---

# Keeping the local server safe

The server is a local tool that can write to someone's notes. It is safe
because of the rules below. Do not weaken them to make a feature easier.

## Invariants

- **Loopback only.** Listen on `127.0.0.1`, on a random port. Never `0.0.0.0`.
- **Host and Origin.** The `Host` header must be exactly `127.0.0.1:<port>`.
  If an `Origin` header is present it must be `http://127.0.0.1:<port>`.
  This stops DNS rebinding and other websites calling the API.
- **JSON only for changes.** Every POST needs `Content-Type: application/json`
  (this also forces a CORS preflight from other sites), and a body of at most
  40,000 bytes.
- **Validate everything.** Check every field's type, length, and pattern, with a
  plain message and the right status: 400 bad input, 404 not found, 409 the
  file changed, 413 too large, 415 wrong type, 422 an incompatible file.
  Unexpected errors return one generic message, never a stack trace or a path.
- **Stay in the vault.** The server may touch only `TODO.md`, `TASK-ARCHIVE.md`,
  and the notes folder. Resolve folders and refuse any that leave the vault.
  Never build a path from request input except an ID that matched its pattern.
- **Static files are a fixed list.** Only the files named in `pageFiles` in `server.mjs` are
  served. A new frontend file must be added to that list on purpose.
- **Strict CSP.** `default-src 'self'`, no inline scripts or styles, and
  `img-src 'self'`. That means no `data:` URIs: no inline SVG backgrounds, and
  no external fonts, images, or scripts. Use CSS and plain characters for icons.
- **Safe writes.** Re-read the file just before writing and refuse if it
  changed. Write to a temp file, then rename over the original. Keep the
  file's permissions.
- **Permanent actions are confirmed** in the interface, and the server still
  checks that the request is based on the current revision.

## Checklist for a new endpoint

1. Add the route to the right table in `server.mjs` (`taskChanges` for changes to `TODO.md`,
   `noteChanges` for notes). Unknown routes are 404 by default.
2. Validate each field before reading any file.
3. Make the change a pure function (text in, text out) so it can be tested.
4. Require the current revision for anything that changes `TODO.md`.
5. Add tests for bad input, a stale revision, and a missing task. `server.test.mjs` shows how to
   start a real server on a scratch vault and call it over HTTP.
6. If the endpoint can touch a new file, say so in the README.
