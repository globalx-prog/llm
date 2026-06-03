#!/usr/bin/env bash
set -euo pipefail
if [ -f /data/agents/STOP ]; then
  sudo rm -f /data/agents/STOP
fi
echo "STOP disabled"
