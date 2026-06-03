#!/usr/bin/env bash
set -euo pipefail

TS=$(date +%F_%H%M%S)
BACKUP_DEST_BASE=${BACKUP_DEST_BASE:-/mnt/extdisk/backups/server}
BACKUP_DEST="$BACKUP_DEST_BASE/$TS"
LATEST_LINK="$BACKUP_DEST_BASE/latest"
RETENTION_DAYS=${RETENTION_DAYS:-14}
LOG_DIR=${LOG_DIR:-/data/logs/ops}
TEXTFILE_DIR=${TEXTFILE_DIR:-/var/lib/node_exporter/textfile_collector}

mkdir -p "$BACKUP_DEST" "$LOG_DIR"
LOG_FILE="$LOG_DIR/phase6_backup_${TS}.log"

on_failure() {
  local now
  now=$(date +%s)
  if [[ -d "$TEXTFILE_DIR" ]]; then
    cat >"$TEXTFILE_DIR/llm_backup.prom" <<EOF
llm_backup_last_success 0
llm_backup_last_failure_unixtime $now
EOF
  fi
}
trap on_failure ERR

{
  echo "[$(date -Is)] backup-start ts=$TS"

  sudo rsync -aHAX --delete /home/clemi/projekte/ "$BACKUP_DEST/projekte/"
  sudo rsync -aHAX --delete /data/ "$BACKUP_DEST/data/"
  sudo rsync -aHAX --delete /etc/ "$BACKUP_DEST/etc/"
  sudo rsync -aHAX --delete /var/lib/ "$BACKUP_DEST/var_lib/"
  sudo rsync -aHAX --delete /usr/local/ "$BACKUP_DEST/usr_local/"

  apt-mark showmanual > "$BACKUP_DEST/apt_manual_${TS}.txt" || true

  ln -sfn "$BACKUP_DEST" "$LATEST_LINK"

  find "$BACKUP_DEST_BASE" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$RETENTION_DAYS" -exec rm -rf {} +

  NOW_UNIX=$(date +%s)
  if [[ -d "$TEXTFILE_DIR" ]]; then
    cat >"$TEXTFILE_DIR/llm_backup.prom" <<EOF
llm_backup_last_success 1
llm_backup_last_success_unixtime $NOW_UNIX
EOF
  fi

  echo "[$(date -Is)] backup-ok dest=$BACKUP_DEST"
} | tee -a "$LOG_FILE"
