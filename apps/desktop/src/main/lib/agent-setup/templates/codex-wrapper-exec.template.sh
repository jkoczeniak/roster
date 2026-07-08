# Codex exposes completion notifications via notify.
# For per-prompt Start notifications, watch the TUI session log for task_started.
if [ -n "$ROSTER_TAB_ID" ] && [ -f "{{NOTIFY_PATH}}" ]; then
  export CODEX_TUI_RECORD_SESSION=1
  if [ -z "$CODEX_TUI_SESSION_LOG_PATH" ]; then
    _roster_codex_ts="$(date +%s 2>/dev/null || echo "$$")"
    export CODEX_TUI_SESSION_LOG_PATH="${TMPDIR:-/tmp}/roster-codex-session-$$_${_roster_codex_ts}.jsonl"
  fi

  (
    _roster_log="$CODEX_TUI_SESSION_LOG_PATH"
    _roster_notify="{{NOTIFY_PATH}}"
    _roster_last_turn_id=""

    # Wait briefly for codex to create the session log.
    _roster_i=0
    while [ ! -f "$_roster_log" ] && [ "$_roster_i" -lt 200 ]; do
      _roster_i=$((_roster_i + 1))
      sleep 0.05
    done
    [ -f "$_roster_log" ] || exit 0

    tail -n 0 -F "$_roster_log" 2>/dev/null | while IFS= read -r _roster_line; do
      case "$_roster_line" in
        *'"dir":"to_tui"'*'"kind":"codex_event"'*'"type":"task_started"'*)
          _roster_turn_id=$(printf '%s\n' "$_roster_line" | awk -F'"turn_id":"' 'NF > 1 { sub(/".*/, "", $2); print $2; exit }')
          [ -n "$_roster_turn_id" ] || _roster_turn_id="task_started"
          if [ "$_roster_turn_id" != "$_roster_last_turn_id" ]; then
            _roster_last_turn_id="$_roster_turn_id"
            bash "$_roster_notify" '{"hook_event_name":"Start"}' >/dev/null 2>&1 || true
          fi
          ;;
      esac
    done
  ) &
  ROSTER_CODEX_START_WATCHER_PID=$!
fi

"$REAL_BIN" -c 'notify=["bash","{{NOTIFY_PATH}}"]' "$@"
ROSTER_CODEX_STATUS=$?

if [ -n "$ROSTER_CODEX_START_WATCHER_PID" ]; then
  kill "$ROSTER_CODEX_START_WATCHER_PID" >/dev/null 2>&1 || true
  wait "$ROSTER_CODEX_START_WATCHER_PID" 2>/dev/null || true
fi

exit "$ROSTER_CODEX_STATUS"
