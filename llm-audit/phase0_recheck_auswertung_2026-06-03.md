# Phase 0 Recheck Auswertung (2026-06-03)

## Durchgefuehrte Schritte
1. Lokalen Zielservice auf Port 3000 gestartet (Platzhalter fuer WebUI/API).
2. Funnel auf den lokalen Zielservice gelegt.
3. End-to-End Erreichbarkeit geprueft (lokal + Funnel URL).
4. Phase-0-VPN-first Recheck fuer Tailnet, Security und Storage ausgefuehrt.

## Ergebnis
- Tailnet ist aktiv und stabil.
- MagicDNS ist aktiv (`clemi.tail47b116.ts.net`).
- Tailscale SSH ist aktiviert (`RunSSH=true`).
- Funnel ist aktiv und liefert HTTP 200.
- UFW ist im VPN-first-Modus aktiv (inbound nur `tailscale0`).
- fail2ban ist aktiv.
- `/data` ist vorhanden und gemountet.

## Offene Punkte / Blocker
1. NAS/extdisk sind nur als Verzeichnisse vorbereitet, aber noch nicht eingehangen.
2. Tailscale Health-Warnung bleibt: SSH-ACL erlaubt derzeit keinen Zugriff.
3. Aktueller Port-3000-Dienst ist ein Platzhalter (python http.server), nicht die produktive WebUI/API.

## Phase-0 Entscheidung (aktuell)
- Go fuer VPN-first Basisbetrieb (NAS/extdisk bewusst zurueckgestellt).

## Entscheidungsrahmen
- Auf Wunsch wurde NAS/extdisk in diesem Schritt explizit aus dem Abschlussumfang ausgeklammert.
- VPN-first Zugriff, Security-Baseline und erreichbarer Dienstpfad sind erfolgreich umgesetzt.
- Tailscale SSH wurde voruebergehend deaktiviert, bis ACLs final ausgerollt werden.

## Nächste zwingende Schritte
1. Produktive WebUI/API statt Platzhalterdienst deployen.
2. Optional: Tailscale SSH mit finaler ACL wieder aktivieren.
3. Spaeter (auf Anweisung): NAS/extdisk in fstab eintragen und Reboot-Stabilitaet pruefen.
