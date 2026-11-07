import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, unlinkSync, statSync } from 'node:fs';
import { fail } from './errors.mjs';

// Replaces a file only if nobody changed it since it was read: write the new text
// to a temporary file, check the original is untouched, then rename over it.
// The file keeps its permissions. If it changed, nothing is written (409).
export function writeIfUnchanged(path, original, updated, conflictMessage) {
  const temporary = `${path}.board-${randomBytes(8).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, updated, { flag: 'wx', mode: statSync(path).mode });
    if (readFileSync(path, 'utf8') !== original) throw fail(conflictMessage, 409);
    renameSync(temporary, path);
  } finally {
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
