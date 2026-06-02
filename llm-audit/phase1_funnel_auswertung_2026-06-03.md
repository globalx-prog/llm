# Funnel Auswertung (2026-06-03)

## Ausgefuehrte Schritte
```bash
tailscale funnel --bg --https=443 http://127.0.0.1:3000
tailscale funnel status
tailscale serve status
```

## Ergebnis
- CLI-Aufruf mit neuer Syntax wurde akzeptiert (kein Deprecated-Fehler).
- Lokaler Target-Dienst auf `127.0.0.1:3000` war nicht erreichbar (`Connection refused`).
- Tailnet meldet Funnel-Policy-Hinweis: Node ist nicht auf Funnel-Allowlist.
- Schreibzugriff auf Serve-Konfiguration abgelehnt:
  - `Access denied: serve config denied`
- Ergebnisstatus:
  - `tailscale funnel status` -> `No serve config`
  - `tailscale serve status` -> `No serve config`

## Re-Test (spaeter am selben Tag)
- `tailscale funnel --bg --https=443 http://127.0.0.1:3000` lief erfolgreich durch.
- `tailscale funnel status` zeigt aktive Konfiguration:
   - `https://clemi.tail47b116.ts.net` -> Proxy auf `http://127.0.0.1:3000`
- Blocker bleibt:
   - Zielservice auf `127.0.0.1:3000` laeuft nicht (`Connection refused`).
   - URL-Test auf `https://clemi.tail47b116.ts.net` zeitweise Timeout.

   ## E2E-Test erfolgreich
   - Fuer den Nachweis wurde temporaer ein lokaler Testdienst gestartet:
      - `python3 -m http.server 3000 --bind 127.0.0.1`
   - Validierung erfolgreich:
      - `curl -I http://127.0.0.1:3000` -> `HTTP/1.0 200 OK`
      - `curl -I https://clemi.tail47b116.ts.net` -> `HTTP/2 200`
   - Damit ist der Funnel-Pfad technisch funktionsfaehig.
   - Der Testdienst ist nur fuer Validierung gedacht und kann danach beendet werden.

## Ursache
1. Backend-Dienst auf Port 3000 laeuft nicht.
2. Externe Erreichbarkeit der Funnel-URL ist noch inkonsistent und muss nach Dienststart erneut geprueft werden.
3. Optional: Operator-Recht bleibt empfohlen fuer spaetere lokale Serve-Aenderungen.

## Naechste Schritte (in Reihenfolge)
1. Zielservice starten (WebUI/Proxy auf 3000 oder Zielport in Funnel anpassen).
2. URL erneut testen:
   ```bash
   curl -I -m 20 https://clemi.tail47b116.ts.net
   curl -I -m 5 http://127.0.0.1:3000
   tailscale funnel status
   ```
3. Optional Operator-Recht setzen:
   ```bash
   sudo tailscale set --operator=$USER
   ```
4. Nach erfolgreichem Test optional wieder deaktivieren:
   ```bash
   tailscale funnel --https=443 off
   ```
