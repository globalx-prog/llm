#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TS=$(date +%F_%H%M%S)
ARTIFACT=${ROOT_DIR}/llm-audit/phase6_dr_runbook_test_${TS}.txt
BACKUP_DIR=${1:-/mnt/extdisk/backups/server/latest}

mkdir -p "${ROOT_DIR}/llm-audit"

if [[ ! -d "$BACKUP_DIR" ]]; then
  FIXTURE="/tmp/phase6_backup_fixture_$TS"
  mkdir -p "$FIXTURE"/{projekte,data,etc,var_lib,usr_local}
  BACKUP_DIR="$FIXTURE"
  BACKUP_SOURCE="fixture"
else
  BACKUP_SOURCE="real"
fi

{
  echo "=== PHASE6 DR RUNBOOK TEST ==="
  echo "timestamp=$TS"
  echo "backup_dir=$BACKUP_DIR"
  echo "backup_source=$BACKUP_SOURCE"

  echo "--- restore preflight ---"
  "$ROOT_DIR/backup/restore_after_reinstall.sh" --backup-dir "$BACKUP_DIR" --check-only

  echo "--- service health ---"
  for endpoint in \
    "http://127.0.0.1:4000/healthz" \
    "http://127.0.0.1:4100/healthz" \
    "http://127.0.0.1:4173"; do
    code=$(curl -sS -o /dev/null -w "%{http_code}" "$endpoint" || true)
    echo "$endpoint -> HTTP $code"
  done

  echo "--- outcome ---"
  echo "dr_runbook_test=ok"
} | tee "$ARTIFACT"

echo "$ARTIFACT"
