#!/bin/bash
# Stop hook for pipeline lead — prevents Claude from stopping while pipeline is active.
# Exit code 2 = "don't stop" (Claude Code hooks protocol).
# Lead writes .pipeline/state.json with complete=false during pipeline execution.
# Phase 5 sets complete=true before cleanup, allowing graceful stop.

PIPELINE_STATE=$(cat .pipeline/state.json 2>/dev/null || echo '{"complete": true}')
COMPLETE=$(echo "$PIPELINE_STATE" | jq -r '.complete')

if [ "$COMPLETE" = "false" ]; then
  echo "Pipeline still running. Check worker statuses and process messages." >&2
  exit 2
fi

exit 0
