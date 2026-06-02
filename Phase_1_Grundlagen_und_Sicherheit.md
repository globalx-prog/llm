# Phase 1: Grundlagen und Sicherheit

## Ziel
Eine sichere, remote erreichbare Basisplattform mit sauberem Netzwerk- und Zugriffsmodell.

Kurzfassung Abschluss (ohne NAS): `Phase_1_Abschluss_ohne_NAS_2026-06-03.md`.

## Umsetzungsstand (2026-06-03)
- Host-Hardening umgesetzt: `ufw`, `fail2ban`, `unattended-upgrades`, `auditd` aktiv.
- SSH-Server installiert und gehaertet:
	- `PasswordAuthentication no`
	- `PermitRootLogin prohibit-password`
- VPN-first Netzwerk aktiv: UFW laesst inbound nur auf `tailscale0` zu.
- Tailscale/Funnel erreichbar (HTTPS 200 auf `https://clemi.tail47b116.ts.net`).
- IAM-Basis angelegt:
	- Gruppen: `llm-admin`, `llm-service`, `llm-review`
	- Service-Account: `llm-svc`
- Tailscale SSH ist aktiviert (`RunSSH=true`), ACL/Tags sind ausgerollt.

## Umsetzungsschritte
1. Host vorbereiten
- Ubuntu aktualisieren, Zeitsync aktivieren, minimale Pakete.
- SSH absichern (Key-Only, kein Passwort-Login).

2. Netzwerk und Entry Point
- Tailscale als Standard-Entry aktivieren (MagicDNS + ACL + optional Tailscale SSH).
- Keine WAN-Portfreigabe im VPN-first-Modus.
- Reverse Proxy nur intern (tailnet/LAN) betreiben.
- Optional Public-Mode: 443 extern mit Reverse Proxy nur bei explizitem Bedarf.

3. IAM und Rollen
- Benutzergruppen fuer Admin-Owner und Service-Account anlegen.
- Optional read-only Reviewer fuer spaetere Audits vorsehen.
- MFA/SSO vorbereiten, falls verfuegbar.

4. Session- und Zugriffsschutz fuer UI
- Sitzungslaufzeiten, Logout und Basis-Ratenlimits festlegen.
- Schreibende Endpunkte nur fuer Admin-Owner freigeben.

5. NAS-Mounts
- /mnt/nas/knowledge read-only.
- /mnt/nas/projects read-write pro Projekt mit ACL.

6. Basishardening
- Automatische Security-Updates.
- Fail2ban/aehnliche Schutzmechanismen.
- Audit-Logging aktivieren.

## DoD (Definition of Done)
- [x] Extern ist kein WAN-Port offen (VPN-first) oder alternativ nur 443 im Public-Mode.
- [x] Interne Ports sind nicht oeffentlich.
- [x] Tailnet-ACLs greifen wie definiert (nur autorisierte Geraete/Users).
- [x] Rollenbasis ist technisch angelegt (Gruppen + Service-Account).
- [ ] NAS-Rechte entsprechen Rollenmodell.
- [x] Security-Baseline protokolliert.
- [ ] Schreibende UI/API-Aktionen sind nur mit passender Rolle erlaubt.

## Checkblatt Phase 1
- [x] Tailscale Status ist stabil (Server + Clients online).
- [x] Tailscale SSH ist aktiv (RunSSH=true).
- [x] ACLs und Tags in Tailnet-Policy ausgerollt.
- [x] SSH-Hardening getestet.
- [x] Externe Erreichbarkeit entspricht Betriebsmodus (VPN-first ohne WAN-Open-Port).
- [ ] Mount nach Reboot stabil vorhanden.
- [x] Session-Policy und Zugriffsschutz fuer UI dokumentiert.

## Nachweise
- `llm-audit/phase1_precheck_2026-06-03.txt`
- `llm-audit/phase1_execution_2026-06-03.txt`
- `llm-audit/phase1_service_and_funnel_apply.txt`
- `llm-audit/phase1_acl_ssh_recheck_2026-06-03.txt`
- `llm-audit/phase1_acl_ssh_recheck_post_acl_2026-06-03.txt`
- `llm-audit/phase1_ui_access_snapshot_2026-06-03.txt`
- `Phase_1_Session_und_Zugriffsschutz_Policy.md`

## Konkrete Umsetzung (Beispiele)
1. Basis-Hardening auf Host
```bash
sudo apt update && sudo apt -y upgrade
sudo timedatectl set-timezone Europe/Berlin
sudo apt -y install ufw fail2ban curl jq
```

2. SSH absichern
```bash
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

3. Firewall gemaess Single-Entry
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
# VPN-first: nur tailnet-Zugriff zulassen (Interface tailscale0)
sudo ufw allow in on tailscale0
# Optional Public-Mode (nur falls aktiv):
# sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

4. NAS-Mounts in fstab absichern
```fstab
# knowledge nur lesend
nas:/knowledge /mnt/nas/knowledge nfs ro,noexec,nofail,_netdev 0 0
# projects mit kontrolliertem Schreibzugriff
nas:/projects /mnt/nas/projects nfs rw,nofail,_netdev 0 0
```

5. Session- und API-Zugriffsschutz pruefen
```bash
curl -I https://<server>.tailnet.ts.net
curl -s https://<server>.tailnet.ts.net/v1/models -H "Authorization: Bearer INVALID" | jq .
```

6. Tailscale SSH und Policy absichern
```bash
sudo tailscale set --ssh
tailscale debug prefs | jq -r '.RunSSH'
tailscale status
```

7. Tailnet ACL/Tags ausrollen (Admin Console)
- Tag `tag:llm-server` fuer den Host `clemi` setzen.
- Nur eigene Identitaet/Geraete fuer `tag:llm-server` erlauben.
- Beispiel-Policy siehe `LLM/tailscale/acl.policy.example.json`.
- Status: Tag und ACL sind aktiv.

8. Optional: Public URL ohne Router-Freigabe (Funnel)
```bash
# Einmalig: lokalen User als Tailscale-Operator erlauben
sudo tailscale set --operator=$USER

# Beispiel: lokaler Dienst auf 3000 (aktuelle Syntax)
tailscale funnel --bg --https=443 http://127.0.0.1:3000
tailscale funnel status
tailscale funnel reset
```

9. Router-Hinweis
- Im VPN-first-Modus sind keine WAN-Portfreigaben erforderlich.
- 22/tcp und interne Service-Ports bleiben ohne WAN-Freigabe.

http://192.168.0.1 
