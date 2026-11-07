#!/usr/bin/env bash
# Builds "Task Board.app", a small Mac app you can keep in the Dock.
#
#   bash scripts/make-mac-app.sh                              # the sample in this folder
#   bash scripts/make-mac-app.sh "/path/to/your/vault"        # your vault
#   bash scripts/make-mac-app.sh "/path/to/your/vault" "/folder/for/the/app"
#
# The app starts the board and opens it in your browser. Click its Dock icon again
# to reopen the page, and Quit (right-click the icon) to stop the board.
# It remembers where this folder, your vault, and Node.js are. If you move any of
# them, or change your Node version, run this script again.
set -euo pipefail

REPO="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT="${1:-$REPO}"
DEST="${2:-$HOME/Applications}"
NAME="Task Board"

[ "$(uname)" = "Darwin" ] || { echo "This builds a Mac app, so it only runs on macOS." >&2; exit 1; }
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "Node.js was not found. Install Node.js 18 or later, then run this again." >&2; exit 1; }
[ -f "$VAULT/TODO.md" ] || { echo "No TODO.md in: $VAULT" >&2; exit 1; }
VAULT="$(cd -- "$VAULT" && pwd)"
mkdir -p "$DEST"
DEST="$(cd -- "$DEST" && pwd)"
APP="$DEST/$NAME.app"

# AppleScript strings need backslashes and quotes escaped.
as_escape() { local s="${1//\\/\\\\}"; printf '%s' "${s//\"/\\\"}"; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cat > "$WORK/app.applescript" <<'APPLESCRIPT'
property serverPid : ""
property logFile : "/tmp/task-board.log"

on run
	set repo to "@REPO@"
	set vault to "@VAULT@"
	set nodePath to "@NODE@"
	if (do shell script "test -x " & quoted form of nodePath & " && echo yes || echo no") is "no" then
		display dialog "Node.js was not found at:" & return & nodePath & return & return & "Run scripts/make-mac-app.sh again to rebuild this app." buttons {"OK"} default button "OK" with icon caution
		quit
		return
	end if
	set startCommand to "cd " & quoted form of repo & " && (" & quoted form of nodePath & " task-board/server.mjs " & quoted form of vault & " > " & quoted form of logFile & " 2>&1 & echo $!)"
	set serverPid to do shell script startCommand
	delay 1
	if (do shell script "kill -0 " & serverPid & " 2>/dev/null && echo up || echo down") is "down" then
		set problem to do shell script "cat " & quoted form of logFile
		display dialog "The board could not start:" & return & return & problem buttons {"OK"} default button "OK" with icon caution
		quit
	end if
end run

-- Clicking the Dock icon again opens the page again.
on reopen
	try
		open location (do shell script "grep -o 'http://127.0.0.1:[0-9]*' " & quoted form of logFile & " | head -1")
	end try
end reopen

-- Quitting the app stops the board.
on quit
	try
		do shell script "kill " & serverPid
	end try
	continue quit
end quit
APPLESCRIPT

SCRIPT="$(<"$WORK/app.applescript")"
SCRIPT="${SCRIPT//@REPO@/$(as_escape "$REPO")}"
SCRIPT="${SCRIPT//@VAULT@/$(as_escape "$VAULT")}"
SCRIPT="${SCRIPT//@NODE@/$(as_escape "$NODE")}"
printf '%s\n' "$SCRIPT" > "$WORK/app.applescript"

rm -rf "$APP"
osacompile -s -o "$APP" "$WORK/app.applescript"

# Use the board's icon instead of the default scroll.
if [ -f "$REPO/scripts/task-board.icns" ]; then
  cp "$REPO/scripts/task-board.icns" "$APP/Contents/Resources/applet.icns"
  /usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null || true
fi
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true
touch "$APP"

echo "Built: $APP"
echo "Board folder: $REPO"
echo "Vault:        $VAULT"
echo "Node:         $NODE"
echo
echo "Drag it to your Dock to keep it there."
