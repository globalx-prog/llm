# Phase 5: Agenten und Dateibearbeitung

## Ziel
Agenten fuer mehrere Projekte sicher betreiben, mit kontrollierter Dateibearbeitung und Review-Prozess.

## Umsetzungsschritte
1. Agenten-Runner
- Laufzeitumgebung je Projekt definieren.
- Allowlist fuer bearbeitbare Pfade setzen.

2. Dateiworkflow
- Agent erstellt Vorschlag als Diff/Patch.
- Automatische Validierung (lint/test/policy).
- Merge nur nach Review/Freigabe.

3. UI-gekoppelter Agentenablauf
- Agentenstart aus der Weboberflaeche nur fuer erlaubte Rollen.
- Vor schreibenden Aktionen Pflichtangabe von Grund/Task-ID.
- Vorschau (Diff) in der UI vor finaler Ausfuehrung.

4. Git-Integration
- Projektbranching-Strategie.
- Commit-Konventionen und PR-Template.

5. Schutzmechanismen
- Schreibsperre fuer kritische Pfade.
- Secrets-Scan vor Merge.
- Auditlog fuer jede Aenderung.

## DoD
- [ ] Agent kann Dateien nur in erlaubten Pfaden aendern.
- [ ] Jeder schreibende Lauf erzeugt Diff und Run-ID.
- [ ] Admin-Owner-Freigabe ist fuer Merge verpflichtend; optional Reviewer Co-Signoff.
- [ ] Rollback auf vorherige Version ist getestet.
- [ ] UI blockiert schreibende Agentenstarts ohne Pflichtmetadaten.

## Checkblatt Phase 5
- [ ] Allowlist/denylist dokumentiert.
- [ ] Validierungspipeline laeuft vor Merge.
- [ ] Audittrail inkl. Nutzerbezug vorhanden.
- [ ] Notfall-Stop fuer Agentenlaeufe verfuegbar.
- [ ] Rechte fuer Branch-Protection aktiv.
- [ ] UI-Diff-Vorschau vor Schreibaktion getestet.

## Konkrete Umsetzung (Beispiele)
0. Voraussetzungen installieren
```bash
sudo apt update
sudo apt -y install npm
# gitleaks installieren (Beispiel ueber Go)
go install github.com/gitleaks/gitleaks/v8@latest
```

1. Allowlist fuer Agentenschreibzugriffe
```yaml
# /data/agents/policy.yaml
write_allowlist:
  - /mnt/nas/projects/mim-llm/**
write_denylist:
  - /etc/**
  - /root/**
  - /data/litellm/**
  - /data/caddy/**
required_metadata:
  - reason
  - task_id
```

2. Agentenlauf mit Diff-Erzeugung
```bash
git checkout -b feat/agent-update-001
# agent schreibt nur in allowlist
git status
git diff > /data/logs/agent_run_001.diff
```

3. Vor-Merge Validierung (Beispiel)
```bash
npm run lint
npm run test
gitleaks detect --source .
```

4. Audit-Eintrag schreiben
```json
{
  "run_id": "agent_run_001",
  "user": "admin-owner",
  "task_id": "TASK-123",
  "reason": "Dokumentation aktualisieren",
  "diff_file": "/data/logs/agent_run_001.diff",
  "timestamp": "2026-06-02T10:45:00Z"
}
```
