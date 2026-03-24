#!/bin/bash
echo "🚀 SITECHECKER AUDIT - LIVE MONITORING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

BATCH_ID="1774306392009"
TOTAL_URLS=26
START_TIME=$(date +%s)

while true; do
  STATUS=$(curl -s http://localhost:3001/api/queue)
  PENDING=$(echo $STATUS | grep -o '"pending":[0-9]*' | grep -o '[0-9]*$')
  RUNNING=$(echo $STATUS | grep -o '"running":[0-9]*' | grep -o '[0-9]*$')
  COMPLETED=$(echo $STATUS | grep -o '"completed":[0-9]*' | grep -o '[0-9]*$')
  FAILED=$(echo $STATUS | grep -o '"failed":[0-9]*' | grep -o '[0-9]*$')

  ELAPSED=$(($(date +%s) - START_TIME))
  HOURS=$((ELAPSED / 3600))
  MINUTES=$(((ELAPSED % 3600) / 60))
  SECONDS=$((ELAPSED % 60))

  # Calculate percentage
  DONE=$((COMPLETED + FAILED))
  PERCENT=$((DONE * 100 / TOTAL_URLS))
  
  # Progress bar
  FILLED=$((PERCENT / 5))
  EMPTY=$((20 - FILLED))
  PROGRESSBAR="["
  for ((i=0; i<FILLED; i++)); do PROGRESSBAR+="="; done
  for ((i=0; i<EMPTY; i++)); do PROGRESSBAR+="-"; done
  PROGRESSBAR+="]"

  echo -ne "\r⏱️  Elapsed: ${HOURS}h ${MINUTES}m ${SECONDS}s | Progress: ${PERCENT}% ${PROGRESSBAR}"
  echo -ne "\r   Pending: $PENDING | Running: $RUNNING | Completed: $COMPLETED | Failed: $FAILED"

  if [ "$PENDING" = "0" ] && [ "$RUNNING" = "0" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ AUDIT ABGESCHLOSSEN!"
    echo "   Total Time: ${HOURS}h ${MINUTES}m ${SECONDS}s"
    echo "   Completed: $COMPLETED"
    echo "   Failed: $FAILED"
    echo ""
    break
  fi

  sleep 10
done
