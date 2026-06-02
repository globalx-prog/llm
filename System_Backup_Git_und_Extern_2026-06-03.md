# Linux-Server sichern: Git + externe Festplatte

Stand: 2026-06-03

## Ziel
Den gesamten Serverzustand reproduzierbar sichern:
- Konfigurationen und IaC in Git
- Daten und Systemabbild auf externer Festplatte

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

sudo rsync -aHAX --delete \
  --exclude='/proc/*' --exclude='/sys/*' --exclude='/dev/*' \
  --exclude='/run/*' --exclude='/tmp/*' --exclude='/mnt/*' \
  --exclude='/media/*' --exclude='/lost+found' \
  / "$DEST/rootfs"

sudo rsync -aHAX /home/clemi/projekte/ "$DEST/projekte"
sudo rsync -aHAX /data/ "$DEST/data"
```

## 4) Git-Only fuer Infrastruktur
```bash
cd /home/clemi/projekte/LLM
git add .
git commit -m "Backup snapshot: configs + docs + scripts"
git push
```

## 5) Wiederherstellung (Kurz)
- Frisches Linux installieren
- Paketlisten einspielen
- Konfigurationen aus Git anwenden
- Daten aus externem Backup mit rsync zurueckspielen
- Services starten und Healthchecks pruefen

## 6) Empfehlung fuer Betrieb
- Taeglich inkrementelles rsync-Backup per systemd timer
- Woechentlich Restore-Test auf Testsystem
- Monatlich Vollsicherung und Hash-Pruefung
