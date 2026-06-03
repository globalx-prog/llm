#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
UNIT_SRC_DIR="$ROOT_DIR/phase6/systemd"
UNIT_DST_DIR=/etc/systemd/system
OVERRIDE_DIR=/etc/systemd/system/llm-rag-api.service.d

echo "[1/6] install/update ui service"
sudo install -m 0644 "$UNIT_SRC_DIR/llm-ui.service" "$UNIT_DST_DIR/llm-ui.service"

echo "[2/6] install rag-api vpn override"
sudo mkdir -p "$OVERRIDE_DIR"
sudo install -m 0644 "$UNIT_SRC_DIR/llm-rag-api-vpn.override.conf" "$OVERRIDE_DIR/override.conf"

echo "[3/6] make scripts executable"
sudo chmod 0755 "$ROOT_DIR/phase6/backup_daily.sh" "$ROOT_DIR/phase6/install_backup_timer.sh"

echo "[4/6] reload units"
sudo systemctl daemon-reload

echo "[5/6] enable+start full llm stack"
sudo systemctl enable --now \
  llm-model-gemma4.service \
  llm-router.service \
  llm-rag-api.service \
  llm-ui.service \
  llm-backup-daily.timer

echo "[6/6] status"
sudo systemctl --no-pager --full status \
  llm-model-gemma4.service \
  llm-router.service \
  llm-rag-api.service \
  llm-ui.service \
  llm-backup-daily.timer

echo
TS_DNS=$(tailscale status --json 2>/dev/null | jq -r '.Self.DNSName // empty' || true)
TS_IP=$(tailscale ip -4 2>/dev/null | head -n1 || true)

echo "VPN access (client in same tailnet):"
if [[ -n "$TS_DNS" ]]; then
  echo "  UI : http://${TS_DNS}:4173"
  echo "  API: http://${TS_DNS}:4100/healthz"
fi
if [[ -n "$TS_IP" ]]; then
  echo "  UI : http://${TS_IP}:4173"
  echo "  API: http://${TS_IP}:4100/healthz"
fi
