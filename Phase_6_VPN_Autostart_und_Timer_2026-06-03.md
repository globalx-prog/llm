# Phase 6: VPN-Nutzung, Systemstart und Timer-Verhalten (2026-06-03)

## 1) LLM ueber VPN nutzen und Projekte umsetzen
Voraussetzung: Client und Server sind im selben Tailscale-Tailnet.

### Server-Checks
```bash
tailscale status
tailscale ip -4
tailscale status --json | jq -r '.Self.DNSName'
```

### Zugriff vom VPN-Client
- UI: `http://<server-ts-dns>:4173` oder `http://<server-ts-ip>:4173`
- API-Health: `http://<server-ts-dns>:4100/healthz`

Beispiel:
```bash
curl -fsS http://<server-ts-dns>:4100/healthz | jq .ok
```

### Projektarbeit ueber VPN (SSH)
```bash
ssh clemi@<server-ts-dns>
cd /home/clemi/projekte/LLM
git pull
# danach lokal auf dem Server arbeiten (Tests, Commits, Push)
```

## 2) System beim Boot automatisch starten
Automatischer Start wird ueber systemd sichergestellt.

### Einmalige Einrichtung
```bash
cd /home/clemi/projekte/LLM
chmod +x phase6/install_autostart_stack.sh
sudo ./phase6/install_autostart_stack.sh
```

### Aktivierte Units
- `snap.ollama.ollama.service`
- `llm-router.service`
- `llm-rag-api.service`
- `llm-ui.service`
- `llm-backup-daily.timer`

### Nachpruefen
```bash
systemctl is-enabled snap.ollama.ollama.service llm-router.service llm-rag-api.service llm-ui.service llm-backup-daily.timer
systemctl is-active snap.ollama.ollama.service llm-router.service llm-rag-api.service llm-ui.service llm-backup-daily.timer
```

## 3) Was bedeutet timer= / wie aeussert sich das?
Bei systemd-Timern siehst du typischerweise:
- `NEXT`: naechster geplanter Lauf
- `LEFT`: Restzeit bis zum naechsten Lauf
- `LAST`: letzter Laufzeitpunkt
- `PASSED`: wie lange der letzte Lauf her ist
- `UNIT`: der Timer selbst (`*.timer`)
- `ACTIVATES`: welcher Service gestartet wird (`*.service`)

Aktuelle Details anzeigen:
```bash
systemctl list-timers --all | rg llm-backup
systemctl cat llm-backup-daily.timer
systemctl status llm-backup-daily.timer --no-pager
```

Bedeutung der Timer-Felder in `llm-backup-daily.timer`:
- `OnCalendar=*-*-* 02:30:00`: taeglich um 02:30
- `Persistent=true`: wenn der Host aus war, wird der verpasste Lauf nachgeholt
- `RandomizedDelaySec=10m`: zusaetzlicher Zufalls-Delay bis 10 Minuten
- `Unit=llm-backup-daily.service`: genau dieser Service wird gestartet

## 4) Wichtige Dateiorte
- Stack-Autostart Installer: `phase6/install_autostart_stack.sh`
- UI-Service Unit: `phase6/systemd/llm-ui.service`
- RAG-VPN Override: `phase6/systemd/llm-rag-api-vpn.override.conf`
- Backup-Timer Installer: `phase6/install_backup_timer.sh`
- Phase-6 Kern-Doku: `Phase_6_Betrieb_Backup_Governance.md`
