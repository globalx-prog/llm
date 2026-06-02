# Tailscale Schritte (umgesetzt)

## Ist-Zustand (Host clemi)
- Tailscale verbunden: `tailscale status` OK
- Tailscale IPv4: `100.66.63.118`
- MagicDNS: `clemi.tail47b116.ts.net`
- Tailscale SSH voruebergehend deaktiviert bis ACL-Freigabe final ist.
- Host-Tag gesetzt: `tag:llm-server`
- Firewall VPN-first aktiv: UFW erlaubt inbound nur auf `tailscale0`
- Funnel ist aktiv auf `https://clemi.tail47b116.ts.net` und zeigt auf `http://127.0.0.1:3000`
- Lokaler Platzhalterdienst auf 3000 laeuft persistent als systemd Unit `llm-web-placeholder.service`.

## 1. Interner Zugriff auf WebUI/API nur ueber Tailscale

### Variante A (Reverse Proxy lokal auf 443)
```bash
curl -I https://clemi.tail47b116.ts.net
curl -I https://100.66.63.118
openssl s_client -connect 100.66.63.118:443 -servername clemi.tail47b116.ts.net </dev/null
tailscale ping 100.66.63.118
```

### Variante B (WebUI direkt auf 3000)
```bash
curl -I http://clemi.tail47b116.ts.net:3000
curl -I http://100.66.63.118:3000
nc -vz 100.66.63.118 3000
tailscale ping 100.66.63.118
```

### Variante C (MagicDNS)
```bash
tailscale status --json | jq -r '.Self.DNSName'
getent hosts clemi.tail47b116.ts.net
curl -I https://clemi.tail47b116.ts.net || true
curl -I http://clemi.tail47b116.ts.net:3000 || true
```

## 2. Dienste nicht oeffentlich exponieren
```bash
sudo ss -tulpn | rg ':(22|80|443|3000|4000|6333)\b' || true
sudo ufw status verbose
tailscale serve status
tailscale funnel status
```

Ziel:
- Kein Router-Portforward fuer 443 noetig.
- SSH ueber Tailscale, nicht oeffentlich.

## 3. ACLs im Tailscale Admin absichern
1. Host `clemi` ist bereits mit `tag:llm-server` markiert.
2. ACL-Policy aus `LLM/tailscale/acl.policy.example.json` in den ACL-Editor uebernehmen.
3. Policy speichern und erzwingen.
4. Mit `tailscale status` gegenpruefen, dass der Health-Hinweis zu SSH-ACL verschwindet.
5. SSH/WebUI-Zugriff von ThinkPad/Android erneut testen.

## 4. Optional Funnel (nur wenn spaeter oeffentliche URL benoetigt)
```bash
# Einmalig: lokaler Operator fuer tailscale CLI erlauben
sudo tailscale set --operator=$USER

# Aktuelle Syntax (nicht deprecated)
tailscale funnel --bg --https=443 http://127.0.0.1:3000
tailscale funnel status
tailscale funnel --https=443 off
```

Hinweis:
- Funnel ist oeffentlich erreichbar, ACL/App-Auth strikt halten.
- Der Node muss in der Tailnet-Policy fuer Funnel erlaubt sein.
- Wenn `Access denied: serve config denied` erscheint, erst `--operator` setzen.
- Wenn die URL erreichbar ist, aber Fehler zeigt, zuerst den Zielservice auf Port 3000 starten.
- E2E wurde erfolgreich validiert, sobald ein lokaler Dienst auf Port 3000 lief (HTTP 200 lokal und ueber Funnel).

## 5. Schnelltest Handy (Mobilfunk)
1. Tailscale App aktivieren.
2. URL aufrufen: `https://clemi.tail47b116.ts.net` oder `https://100.66.63.118`.
3. Bei Erfolg ist Remote-Zugriff ohne Router-Firewall-Regeln geloest.
