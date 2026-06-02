# Phase 1: Session- und Zugriffsschutz Policy

## Geltungsbereich
- Gilt fuer den aktuellen VPN-first Betrieb ueber Tailscale.
- Gilt fuer WebUI/API Zugriff ueber `https://clemi.tail47b116.ts.net`.
- Aktueller Dienst ist ein Platzhalter; Policy ist als Soll fuer den produktiven WebUI/API-Stack definiert.

## Zugriffsebene
1. Netzebene:
- Zugriff nur fuer autorisierte Tailnet-Identitaeten via ACL.
- Kein offener WAN-Port erforderlich.

2. Anwendungszugriff:
- UI-Zugriff nur fuer authentifizierte Benutzer.
- Schreibende Funktionen nur fuer Rolle Admin-Owner.
- Service-Account nur fuer Systemprozesse, nicht fuer interaktive Logins.

## Session-Policy (Soll)
- Idle Timeout: 30 Minuten.
- Absolute Session Lifetime: 8 Stunden.
- Erneute Authentifizierung bei kritischen Schreibaktionen.
- Logout invalidiert Session serverseitig sofort.

## Mindestschutz API/UI
- Ungueltige Tokens liefern 401/403, nie 200.
- Basales Rate Limiting fuer Login- und Schreibendpunkte aktiv.
- Audit-Log mit Zeit, User, Aktion, Ziel, Ergebnis.

## Rollenmodell (Phase 1)
- Admin-Owner: Vollzugriff, inklusive schreibender Aktionen.
- Service-Account (`llm-svc`): nur technisch notwendige Dienste.
- Reviewer (optional): lesender Zugriff fuer Audits.

## Verifikation (aktueller Stand)
```bash
# Netz-/Entry-Pfad
 tailscale status
 tailscale funnel status
 curl -I -m 10 https://clemi.tail47b116.ts.net/

# Hostschutz
 sudo ufw status verbose
 systemctl is-active fail2ban

# SSH-Hardening
 sudo /usr/sbin/sshd -T | rg 'passwordauthentication|permitrootlogin'
```

## Offene Punkte bis produktiver Abschluss
1. Produktive WebUI/API mit echter Authentifizierung ausrollen.
2. Session-Timeouts und Rollen in der produktiven App aktiv setzen.
3. API-Ratenlimits und Audit-Events fuer schreibende Endpunkte produktiv pruefen.
