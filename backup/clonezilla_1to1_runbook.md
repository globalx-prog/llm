# Clonezilla 1:1 Runbook

## Ziel
Ein komplettes 1:1 Abbild (inkl. Boot/Partition/UUID) erstellen und wiederherstellen.

## Vorbereitung
1. Externe Festplatte einhaengen und freien Platz pruefen.
2. Preflight-Metadaten erzeugen:
```bash
/home/clemi/projekte/LLM/backup/preflight_image_backup.sh
```
3. Clonezilla Live USB erstellen.

## Vollbackup erstellen
1. Von Clonezilla Live booten.
2. Mode: device-image.
3. Ziel: externe Festplatte.
4. Task: savedisk fuer Systemdisk auswaehlen.
5. Kompression aktivieren, Checksum-Verification aktivieren.
6. Nach Abschluss Image-Integrity pruefen.

## Wiederherstellung
1. Clonezilla Live booten.
2. Mode: device-image.
3. Task: restoredisk mit passendem Image.
4. Nach Restore Reboot und Healthchecks.

## Healthchecks nach Restore
```bash
systemctl is-active llm-router.service || true
systemctl is-active llm-rag-api.service || true
curl -sS http://127.0.0.1:4000/healthz | jq .
curl -sS http://127.0.0.1:4100/healthz | jq .
```
