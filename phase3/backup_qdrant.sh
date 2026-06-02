#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%F_%H%M%S)
SRC=/data/rag/qdrant
DST_DIR=/data/rag/export
DST="$DST_DIR/qdrant_backup_${TS}.tar.gz"
mkdir -p "$DST_DIR"
tar -czf "$DST" -C "$SRC" .
echo "$DST"
