#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TEMPLATE="$ROOT_DIR/phase6/nginx/llm-control-deck.conf"
TARGET_AVAIL=/etc/nginx/sites-available/llm-control-deck.conf
TARGET_ENABLED=/etc/nginx/sites-enabled/llm-control-deck.conf

SERVER_NAME=""
EMAIL=""
MODE="letsencrypt"

usage() {
  cat <<EOF
Usage:
  $(basename "$0") --server-name <fqdn> [--email <mail>] [--mode letsencrypt|selfsigned]

Examples:
  $(basename "$0") --server-name llm.example.com --email admin@example.com
  $(basename "$0") --server-name llm.local --mode selfsigned
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server-name)
      SERVER_NAME="$2"
      shift 2
      ;;
    --email)
      EMAIL="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$SERVER_NAME" ]]; then
  echo "--server-name is required" >&2
  usage
  exit 1
fi

if [[ "$MODE" != "letsencrypt" && "$MODE" != "selfsigned" ]]; then
  echo "--mode must be letsencrypt or selfsigned" >&2
  exit 1
fi

echo "[1/7] install nginx + cert tools"
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx openssl

echo "[2/7] prepare acme path"
sudo mkdir -p /var/www/certbot

echo "[3/7] install nginx site template"
sudo install -m 0644 "$TEMPLATE" "$TARGET_AVAIL"
sudo sed -i "s|\${SERVER_NAME}|$SERVER_NAME|g" "$TARGET_AVAIL"

if [[ "$MODE" == "selfsigned" ]]; then
  echo "[4/7] provision self-signed certificate"
  sudo mkdir -p /etc/letsencrypt/live/$SERVER_NAME
  sudo openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -keyout /etc/letsencrypt/live/$SERVER_NAME/privkey.pem \
    -out /etc/letsencrypt/live/$SERVER_NAME/fullchain.pem \
    -subj "/CN=$SERVER_NAME"
else
  echo "[4/7] enable temporary HTTP for cert issuance"
  cat <<HTTP_ONLY | sudo tee "$TARGET_AVAIL" >/dev/null
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAME;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
HTTP_ONLY
fi

echo "[5/7] enable site + validate nginx"
sudo ln -sf "$TARGET_AVAIL" "$TARGET_ENABLED"
sudo nginx -t
sudo systemctl reload nginx

if [[ "$MODE" == "letsencrypt" ]]; then
  if [[ -z "$EMAIL" ]]; then
    echo "--email is required for letsencrypt mode" >&2
    exit 1
  fi

  echo "[6/7] obtain certificate via certbot"
  sudo certbot --nginx -d "$SERVER_NAME" --non-interactive --agree-tos -m "$EMAIL" --redirect

  echo "[7/7] restore hardened template and reload"
  sudo install -m 0644 "$TEMPLATE" "$TARGET_AVAIL"
  sudo sed -i "s|\${SERVER_NAME}|$SERVER_NAME|g" "$TARGET_AVAIL"
  sudo nginx -t
  sudo systemctl reload nginx
else
  echo "[6/7] nginx already configured with self-signed cert"
  echo "[7/7] done"
fi

echo
printf 'HTTPS UI : https://%s\n' "$SERVER_NAME"
printf 'HTTPS API: https://%s/api/healthz\n' "$SERVER_NAME"
