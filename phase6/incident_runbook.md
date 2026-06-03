# Incident Runbook (Phase 6)

## Trigger
- Alarm from Prometheus (critical or warning).
- Service health endpoint non-200.

## Sofortmassnahmen (0-15 Minuten)
1. Pruefe Dienste:
   - `systemctl status llm-router llm-rag-api snap.ollama.ollama.service`
2. Pruefe Ports:
   - `ss -ltnp | rg ':4000|:4100|:4173|:11434'`
3. Pruefe Health:
   - `curl -fsS http://127.0.0.1:4000/healthz`
   - `curl -fsS http://127.0.0.1:4100/healthz`
4. Pruefe letzte Backups:
   - `ls -lah /mnt/extdisk/backups/server | tail`

## Eskalation
- P1 (kompletter Ausfall): sofort an Platform-Admin + Rufbereitschaft.
- P2 (degradierte Antwortzeit): ML-Ops innerhalb 60 Minuten.

## Kommunikation
- Incident-Ticket mit Startzeit, Impact, betroffenen Services.
- Status-Update alle 30 Minuten bis Stabilisierung.

## Abschluss
- Root-Cause-Analyse innerhalb 24h.
- Konkrete Folgeaktion mit Owner und Faelligkeit dokumentieren.
