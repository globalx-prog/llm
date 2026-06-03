#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
UNIT_SRC_DIR="$ROOT_DIR/phase6/systemd"
UNIT_DST_DIR=/etc/systemd/system

sudo install -m 0644 "$UNIT_SRC_DIR/llm-backup-daily.service" "$UNIT_DST_DIR/llm-backup-daily.service"
sudo install -m 0644 "$UNIT_SRC_DIR/llm-backup-daily.timer" "$UNIT_DST_DIR/llm-backup-daily.timer"

sudo chmod 0755 "$ROOT_DIR/phase6/backup_daily.sh"

sudo systemctl daemon-reload
sudo systemctl enable --now llm-backup-daily.timer
sudo systemctl status --no-pager llm-backup-daily.timer
