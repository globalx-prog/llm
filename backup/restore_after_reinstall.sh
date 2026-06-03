#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  restore_after_reinstall.sh --backup-dir <path> [--apt-manual-file <path>] [--apply] [--check-only]

Default behavior is dry-run style output (no destructive writes).

Options:
  --backup-dir      Path to backup root containing: projekte/, data/, etc/, var_lib/, usr_local/
  --apt-manual-file Path to apt manual package list snapshot
  --apply           Execute rsync restore commands
  --check-only      Validate inputs only, no command execution
EOF
}

BACKUP_DIR=""
APT_FILE=""
APPLY=false
CHECK_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --apt-manual-file)
      APT_FILE="$2"
      shift 2
      ;;
    --apply)
      APPLY=true
      shift
      ;;
    --check-only)
      CHECK_ONLY=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$BACKUP_DIR" ]]; then
  echo "Missing --backup-dir" >&2
  usage
  exit 1
fi

required=(projekte data etc var_lib usr_local)
for d in "${required[@]}"; do
  if [[ ! -d "$BACKUP_DIR/$d" ]]; then
    echo "Missing required backup path: $BACKUP_DIR/$d" >&2
    exit 1
  fi
done

if [[ -n "$APT_FILE" && ! -f "$APT_FILE" ]]; then
  echo "Apt manual package file not found: $APT_FILE" >&2
  exit 1
fi

echo "[OK] backup directory looks valid: $BACKUP_DIR"

if [[ "$CHECK_ONLY" == true ]]; then
  echo "Check-only mode complete."
  exit 0
fi

if [[ -n "$APT_FILE" ]]; then
  echo "Would run: sudo apt update"
  echo "Would run: sudo xargs -a '$APT_FILE' apt install -y"
fi

echo "Would run rsync restores:"
echo "  sudo rsync -aHAX '$BACKUP_DIR/projekte/' /home/clemi/projekte/"
echo "  sudo rsync -aHAX '$BACKUP_DIR/data/' /data/"
echo "  sudo rsync -aHAX '$BACKUP_DIR/etc/' /etc/"
echo "  sudo rsync -aHAX '$BACKUP_DIR/var_lib/' /var/lib/"
echo "  sudo rsync -aHAX '$BACKUP_DIR/usr_local/' /usr/local/"

echo "Would run service reload:"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable --now llm-router.service llm-rag-api.service llm-model-fast.service llm-model-quality.service"

if [[ "$APPLY" == true ]]; then
  if [[ -n "$APT_FILE" ]]; then
    sudo apt update
    sudo xargs -a "$APT_FILE" apt install -y
  fi

  sudo rsync -aHAX "$BACKUP_DIR/projekte/" /home/clemi/projekte/
  sudo rsync -aHAX "$BACKUP_DIR/data/" /data/
  sudo rsync -aHAX "$BACKUP_DIR/etc/" /etc/
  sudo rsync -aHAX "$BACKUP_DIR/var_lib/" /var/lib/
  sudo rsync -aHAX "$BACKUP_DIR/usr_local/" /usr/local/

  sudo systemctl daemon-reload
  sudo systemctl enable --now llm-router.service llm-rag-api.service llm-model-fast.service llm-model-quality.service

  echo "Restore applied."
else
  echo "Dry-run output only. Use --apply to execute."
fi
