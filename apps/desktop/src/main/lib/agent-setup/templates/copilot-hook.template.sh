#!/bin/bash
{{MARKER}}
# Called by GitHub Copilot CLI hooks to notify Roster of agent lifecycle events
# Events: sessionStart → Start, sessionEnd → Stop, userPromptSubmitted → Start,
#         postToolUse → Start, preToolUse → PermissionRequest
# Copilot CLI hooks receive JSON via stdin and MUST output valid JSON to stdout

# Drain stdin — Copilot pipes JSON context that we don't need, but we must
# consume it to prevent broken-pipe errors from blocking the agent
cat > /dev/null 2>&1

# Event name is passed as $1 from our hooks.json bash command
EVENT_TYPE="$1"

case "$EVENT_TYPE" in
  sessionStart)         EVENT_TYPE="Start" ;;
  sessionEnd)           EVENT_TYPE="Stop" ;;
  userPromptSubmitted)  EVENT_TYPE="Start" ;;
  postToolUse)          EVENT_TYPE="Start" ;;
  preToolUse)           EVENT_TYPE="PermissionRequest" ;;
  *)
    printf '{}\n'
    exit 0
    ;;
esac

# Must output valid JSON to avoid blocking the agent
printf '{}\n'

[ -z "$ROSTER_TAB_ID" ] && exit 0

curl -sG "http://127.0.0.1:${ROSTER_PORT:-{{DEFAULT_PORT}}}/hook/complete" \
  --connect-timeout 1 --max-time 2 \
  --data-urlencode "paneId=$ROSTER_PANE_ID" \
  --data-urlencode "tabId=$ROSTER_TAB_ID" \
  --data-urlencode "workspaceId=$ROSTER_WORKSPACE_ID" \
  --data-urlencode "eventType=$EVENT_TYPE" \
  --data-urlencode "env=$ROSTER_ENV" \
  --data-urlencode "version=$ROSTER_HOOK_VERSION" \
  > /dev/null 2>&1

exit 0
