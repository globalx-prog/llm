# Linux-Server sichern: Git + externe Festplatte

Stand: 2026-06-03

## Ziel
Den gesamten Serverzustand reproduzierbar sichern:
- Konfigurationen und IaC in Git
- Daten und Systemabbild auf externer Festplatte

## Wichtige Klarstellung
Nein: Diese Markdown-Datei allein ist nicht direkt ausfuehrbar und stellt den Server nicht automatisch 1:1 wieder her.

Mit den enthaltenen Befehlen erreichst du eine sehr gute reproduzierbare Wiederherstellung von:
- Projektdaten
- Konfigurationen
- Service-Definitionen
- Paketlisten

Fuer einen wirklich identischen 1:1 Zustand (inkl. Partitionierung, Bootloader, UUIDs, exakte Systemmetadaten)
brauchst du zusaetzlich ein Block-Image-Backup (z. B. Clonezilla oder Relax-and-Recover).

## 1) Was in Git gehoert
- Infrastruktur- und Service-Konfigurationen (`/etc/systemd/system`, Reverse Proxy, UFW-Regeln als Export)
- Projektcode und Dokumentation (`/home/clemi/projekte/LLM`)
- Backup- und Restore-Skripte
- Paketlisten und installierte Versionen als Snapshots

### Snapshot-Befehle
```bash
mkdir -p /home/clemi/projekte/system-snapshots
TS=$(date +%F_%H%M%S)

dpkg -l > /home/clemi/projekte/system-snapshots/dpkg_$TS.txt
apt-mark showmanual > /home/clemi/projekte/system-snapshots/apt_manual_$TS.txt
systemctl list-unit-files > /home/clemi/projekte/system-snapshots/systemd_units_$TS.txt
sudo ufw status numbered > /home/clemi/projekte/system-snapshots/ufw_$TS.txt
```

## 2) Was auf externe Festplatte gehoert
- Datenverzeichnisse (`/data`, ggf. `/var/lib` relevante Dienste)
- Home-/Projektdaten (`/home/clemi/projekte`)
- Optional komplettes Root-FS als Image/rsync-Backup

## 3) Robustes Backup mit rsync (inkrementell)
```bash
sudo mkdir -p /mnt/extdisk/backups/server
TS=$(date +%F_%H%M%S)
DEST=/mnt/extdisk/backups/server/$TS
sudo mkdir -p "$DEST"

# Basis-System ohne volatile Mounts und ohne separat gesicherte Datenpfade
sudo rsync -aHAX --delete \
  --exclude='/proc/*' --exclude='/sys/*' --exclude='/dev/*' \
  --exclude='/run/*' --exclude='/tmp/*' --exclude='/mnt/*' \
  --exclude='/home/*' --exclude='/data/*' \
  --exclude='/media/*' --exclude='/lost+found' \
  / "$DEST/rootfs"

# Explizite Datenpfade
sudo rsync -aHAX /home/clemi/projekte/ "$DEST/projekte"
sudo rsync -aHAX /data/ "$DEST/data"

# Kritische Systemkonfiguration separat
sudo rsync -aHAX /etc/ "$DEST/etc"
sudo rsync -aHAX /var/lib/ "$DEST/var_lib"
sudo rsync -aHAX /usr/local/ "$DEST/usr_local"
```

## 4) Git-Only fuer Infrastruktur
Status: geprueft. Der Ablauf funktioniert, aber `git add .` kann ungewollte Dateien (z. B. Caches) mitnehmen.

Empfohlene Variante:
```bash
cd /home/clemi/projekte/LLM
git status --short
git add 00_Vorbereitung.md Phase_* phase3 phase4 backup llm-audit
git commit -m "Backup snapshot: configs + docs + scripts"
git push
```

## 5) Wiederherstellung (Kurz)
- Frisches Linux installieren
- Paketlisten einspielen
- Konfigurationen aus Git anwenden
- Daten aus externem Backup mit rsync zurueckspielen
- Services starten und Healthchecks pruefen

### Wiederherstellung (konkret, nach Neuinstallation)
```bash
# 1) Grundsystem angleichen
sudo apt update
sudo xargs -a /pfad/zum/backup/apt_manual_YYYY-MM-DD_HHMMSS.txt apt install -y

# 2) Daten und Konfigurationen zurueckspielen
sudo rsync -aHAX /pfad/zum/backup/projekte/ /home/clemi/projekte/
sudo rsync -aHAX /pfad/zum/backup/data/ /data/
sudo rsync -aHAX /pfad/zum/backup/etc/ /etc/
sudo rsync -aHAX /pfad/zum/backup/var_lib/ /var/lib/
sudo rsync -aHAX /pfad/zum/backup/usr_local/ /usr/local/

# 3) Dienste neu laden und starten
sudo systemctl daemon-reload
sudo systemctl enable --now llm-router.service llm-rag-api.service snap.ollama.ollama.service
```

Ausfuehrbares Skript (sicher mit Check/Dry-Run):
```bash
chmod +x /home/clemi/projekte/LLM/backup/restore_after_reinstall.sh
/home/clemi/projekte/LLM/backup/restore_after_reinstall.sh --backup-dir /pfad/zum/backup --check-only
```

Hinweis: Secrets/Schluessel (SSH, TLS, Tokens) bewusst getrennt und sicher sichern. Nicht unverschluesselt in Git ablegen.

## 6) Wenn du wirklich 1:1 willst (inkl. Boot/Partition)
Nutze zusaetzlich ein Image-Backup des kompletten Datentraegers.

Beispiel mit Clonezilla:
- Vollabbild auf externe Festplatte erstellen
- Regelmaessig inkrementelle Dateibackups (oben) weiterfahren
- Restore-Test auf Ersatzsystem durchfuehren

Preflight und Runbook:
```bash
chmod +x /home/clemi/projekte/LLM/backup/preflight_image_backup.sh
/home/clemi/projekte/LLM/backup/preflight_image_backup.sh
```

- Runbook: `/home/clemi/projekte/LLM/backup/clonezilla_1to1_runbook.md`

## 7) Empfehlung fuer Betrieb
- Taeglich inkrementelles rsync-Backup per systemd timer
- Woechentlich Restore-Test auf Testsystem
- Monatlich Vollsicherung und Hash-Pruefung
