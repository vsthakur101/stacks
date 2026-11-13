#!/bin/sh
# Start Stacks (production build) automatically when you log in to this Mac.
#   npm run autostart:on    build, install the login item and start it now
#   npm run autostart:off   stop it and remove the login item
# Logs: ~/Library/Logs/stacks.log
set -eu

LABEL="local.stacks.app"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
NEXT="$DIR/node_modules/next/dist/bin/next"
LOG="$HOME/Library/Logs/stacks.log"

case "${1:-}" in
  on)
    if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
      echo "Something is already running on port 3000 (probably 'npm run dev' or 'npm run app'). Stop it first." >&2
      exit 1
    fi
    (cd "$DIR" && npm run build)
    mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string><string>$NEXT</string><string>start</string>
    <string>--hostname</string><string>127.0.0.1</string><string>--port</string><string>3000</string>
  </array>
  <key>EnvironmentVariables</key><dict><key>NODE_ENV</key><string>production</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "Stacks will now start at login. Open http://127.0.0.1:3000"
    echo "After pulling new code, run 'npm run autostart:on' again to rebuild."
    ;;
  off)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Stacks will no longer start at login."
    ;;
  *)
    echo "usage: $0 on|off" >&2
    exit 2
    ;;
esac
