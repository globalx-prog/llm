#!/usr/bin/env bash
set -euo pipefail

OUT_BASE="/mnt/extdisk/backups/server-preflight"
TS=$(date +%F_%H%M%S)
OUT_DIR="$OUT_BASE/$TS"

sudo mkdir -p "$OUT_DIR"

lsblk -f > "$OUT_DIR/lsblk.txt"
blkid > "$OUT_DIR/blkid.txt"
sudo fdisk -l > "$OUT_DIR/fdisk.txt"

if command -v efibootmgr >/dev/null 2>&1; then
  sudo efibootmgr -v > "$OUT_DIR/efibootmgr.txt" || true
fi

df -hT > "$OUT_DIR/df.txt"
mount > "$OUT_DIR/mount.txt"

cat > "$OUT_DIR/README.txt" <<'EOF'
This preflight snapshot captures disk, filesystem, and boot metadata.
Use this together with full image tools (Clonezilla/ReaR) for 1:1 recovery.
EOF

echo "$OUT_DIR"
