#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TS=$(date +%F_%H%M%S)
ARTIFACT=${ROOT_DIR}/llm-audit/phase6_alert_smoke_${TS}.txt

mkdir -p "${ROOT_DIR}/llm-audit"

{
  echo "=== PHASE6 ALERT SMOKE CHECK ==="
  echo "timestamp=$TS"

  echo "--- endpoint checks ---"
  for endpoint in \
    "http://127.0.0.1:4000/healthz" \
    "http://127.0.0.1:4100/healthz" \
    "http://127.0.0.1:4173"; do
    code=$(curl -sS -o /dev/null -w "%{http_code}" "$endpoint" || true)
    echo "$endpoint -> HTTP $code"
  done

  echo "--- metrics checks ---"
  metrics=$(curl -sS "http://127.0.0.1:4000/metrics" || true)
  if [[ "$metrics" == *"llm_router_requests_total"* ]]; then
    echo "router_metrics=present"
  else
    echo "router_metrics=missing"
    exit 1
  fi

  echo "alert_rules_file=${ROOT_DIR}/phase6/alert_rules.yml"
  echo "alert_smoke_check=ok"
} | tee "$ARTIFACT"

echo "$ARTIFACT"
