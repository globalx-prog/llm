# Phase 6: Betrieb, Backup und Governance

## Ziel
Produktionsreifer Dauerbetrieb mit Monitoring, Alarmierung, Backup/Restore und klaren Verantwortlichkeiten.

## Umsetzungsstand (2026-06-03)
- SLO/SLA in einer versionierten Policy definiert.
- Prometheus-Scrape- und Alert-Regeln fuer API, RAG, UI und Backup-Staleness erstellt.
- Taeglicher Backup-Job als systemd Service/Timer vorbereitet (produktionsbereit als Unit-Dateien).
- DR-Runbook-Test als ausfuehrbares Skript umgesetzt und erfolgreich im check-only Modus getestet.
- Alert-Smoke-Test gegen laufende Services erfolgreich (4000/4100/4173 erreichbar, Metrics vorhanden).

## Umgesetzte Artefakte
- `LLM/phase6/slo_sla.yaml`
- `LLM/phase6/alert_rules.yml`
- `LLM/phase6/prometheus_scrape.yml`
- `LLM/phase6/backup_daily.sh`
- `LLM/phase6/systemd/llm-backup-daily.service`
- `LLM/phase6/systemd/llm-backup-daily.timer`
- `LLM/phase6/install_backup_timer.sh`
- `LLM/phase6/dr_runbook_test.sh`
- `LLM/phase6/alert_smoke_check.sh`
- `LLM/phase6/incident_runbook.md`

## Nachweise
- `LLM/llm-audit/phase6_alert_smoke_2026-06-03_020920.txt`
- `LLM/llm-audit/phase6_dr_runbook_test_2026-06-03_020920.txt`
- `LLM/llm-audit/phase6_timer_install_manual_required_2026-06-03_020926.txt`

## Offene Produktiv-Aktion
- Timer-Aktivierung braucht sudo-Rechte auf dem Host:
  - `sudo /home/clemi/projekte/LLM/phase6/install_backup_timer.sh`

## Umsetzungsschritte
1. Monitoring
- Metriken: Latenz, Tokens/s, GPU/RAM, Fehlerquote.
- Dashboards fuer API, Modellserver, Qdrant, NAS-I/O.
- UI-Metriken: Login-Fehlerrate, Chat-Fehlerquote, Job-Abbruchrate, Frontend-Latenz.

2. Alerting
- Kritische Alarme: Dienst down, Speicher voll, hohe Fehlerquote.
- Eskalationskette und Rufbereitschaft.

3. Backup und Restore
- Sicherung von Qdrant, Konfigurationen, Prompts, Workspaces.
- Regelmaessiger Restore-Test.

4. Governance
- Rechte-Review in festem Intervall.
- Modellfreigabeprozess (neues Modell -> Test -> Freigabe).
- Datenlebenszyklus und Retention.
- Regel fuer UI-Aenderungen: sicherheitsrelevante Flows nur mit Review und Testnachweis.

5. Runbooks
- Incident-Runbook.
- Kapazitaets-Runbook.
- Sicherheitsvorfall-Runbook.

## DoD
- [x] Kritische Alarme loesen und werden bearbeitet.
- [ ] Backup taeglich, Restore-Test erfolgreich.
- [x] Runbooks sind aktuell und auffindbar.
- [ ] Rechte-Review durchgefuehrt und protokolliert.
- [x] Kritische UI-Nutzerpfade sind messbar und alarmierbar.

## Checkblatt Phase 6
- [x] SLA/SLO definiert.
- [ ] Kapazitaetsgrenzen dokumentiert.
- [x] Incident-Kommunikationsplan erstellt.
- [ ] Wartungsfenster geplant.
- [x] DR-Szenario mindestens einmal geprobt.
- [x] Dashboard enthaelt getrennte Sicht auf API-, RAG- und UI-Fehler.

## Konkrete Umsetzung (Beispiele)
1. Prometheus Healthcheck fuer API und Qdrant
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'litellm'
    static_configs:
      - targets: ['litellm:4000']
  - job_name: 'qdrant'
    static_configs:
      - targets: ['qdrant:6333']
```

2. Backup-Skript fuer Qdrant und Konfiguration
```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%F_%H-%M)
BACKUP_DIR="/data/backups/$TS"
mkdir -p "$BACKUP_DIR"
tar czf "$BACKUP_DIR/qdrant.tgz" /data/qdrant
tar czf "$BACKUP_DIR/configs.tgz" /data/litellm /data/webui
echo "backup_complete=$TS"
```

3. Restore-Test (stichprobenartig)
```bash
mkdir -p /tmp/restore-test
tar xzf /data/backups/<timestamp>/qdrant.tgz -C /tmp/restore-test
test -d /tmp/restore-test/data/qdrant && echo "restore-ok"
```

4. Rechte-Review protokollieren
```markdown
# Rechte-Review 2026-06-02
- Geprueft: Admin-Owner, Service-Account
- Aenderungen: keine
- Offene Risiken: keine kritischen
- Naechster Termin: +90 Tage
```
