# HTTPS Weboberflaeche (Nginx Reverse Proxy)

Diese Anleitung stellt die UI auf HTTPS bereit und proxyt API-Aufrufe ueber denselben Host (`/api`).

## Voraussetzungen
- Laufende Dienste:
  - UI: `127.0.0.1:4173`
  - RAG API: `127.0.0.1:4100`
- DNS/FQDN zeigt auf den Server (nur fuer Let's Encrypt Modus)
- Sudo auf dem Host

## Schnelle Inbetriebnahme

1. Script ausfuehrbar machen:
```bash
chmod +x /home/clemi/projekte/LLM/phase6/install_https_proxy.sh
```

2. Let's Encrypt (empfohlen):
```bash
sudo /home/clemi/projekte/LLM/phase6/install_https_proxy.sh \
  --server-name llm.example.com \
  --email admin@example.com \
  --mode letsencrypt
```

3. Alternativ Self-Signed (intern/lab):
```bash
sudo /home/clemi/projekte/LLM/phase6/install_https_proxy.sh \
  --server-name llm.local \
  --mode selfsigned
```

## Ergebnis
- UI: `https://<server-name>/`
- API Health: `https://<server-name>/api/healthz`

## Konfigurationsdateien
- Nginx Template: `phase6/nginx/llm-control-deck.conf`
- Installer: `phase6/install_https_proxy.sh`

## Wichtige Hinweise
- Bei HTTPS darf die UI nicht direkt auf `http://<host>:4100` zugreifen (Mixed Content).
- Deshalb nutzt die Frontend-Logik bei HTTPS automatisch `https://<host>/api`.
- Zertifikats-Erneuerung bei Let's Encrypt laeuft ueber den systemweiten certbot-timer.
