# Fortschritt nach 00 und Phase 0 (2026-06-03)

## Umgesetzt
- Tailscale VPN-first aktiv und stabil.
- Tailnet-Konnektivitaet geprueft:
  - ThinkPad erreichbar (direct).
  - Android erreichbar (DERP/direct gemischt).
- Tailscale SSH aktiviert (`RunSSH=true`).
- Host-Tag gesetzt: `tag:llm-server`.
- UFW gehaertet:
  - default deny incoming
  - default allow outgoing
  - inbound nur auf `tailscale0`
- Fail2ban installiert und aktiv.
- Mountpoint-Verzeichnisse vorbereitet:
  - `/mnt/nas/knowledge`
  - `/mnt/nas/projects`
  - `/mnt/extdisk/knowledge`

## Noch offen (Blocker)
1. Tailscale ACL-Policy in Admin Console speichern/erzwingen.
   - Aktuell meldet `tailscale status` noch SSH-ACL-Warnung.
2. WebUI/API-Dienst ist noch nicht gestartet (keine Listener auf 443/3000 sichtbar).
3. NAS/extdisk sind noch nicht eingehangen (nur Mountpoints vorhanden).

## Nächste konkrete Schritte
1. ACL aus `LLM/tailscale/acl.policy.example.json` im Tailscale Admin einspielen.
2. WebUI/Proxy starten (intern ueber tailnet erreichbar machen).
3. NAS/extdisk in `fstab` eintragen und Mount testen.
4. Phase-0/1 Re-Test durchfuehren und Go/No-Go aktualisieren.
