# Phase 0: Systemkonfiguration und Kompatibilitaet pruefen

## Ziel
Vor der eigentlichen Umsetzung sicherstellen, dass Firmware, Hardware, Treiber, Netzwerk und Betriebsmodus fuer den Remote-LLM-Dienst geeignet sind.

Kurzfassung mit ausgefuehrten Schritten und Protokoll: `Phase_0_Ausgefuehrte_Schritte_und_Protokoll.md`.

## Ergebnis dieser Phase
- Verbindliche Entscheidung: Go/No-Go fuer Produktivaufbau.
- Liste notwendiger Updates (BIOS, Firmware, Kernel, Treiber).
- Nachweis, wie der Server von Unix-Geraeten und Handy erreichbar ist.
- Nachweis, dass alle LLM-Daten unter /data liegen.
- Technische Grundlage fuer zentrale Weboberflaeche (Single Entry ueber Reverse Proxy) bestaetigt.

## 1. BIOS/UEFI und Hardware-Status

### 1.1 Pruefen
- BIOS/UEFI-Version, Datum und Hersteller erfassen.
- UEFI-Modus aktiv, Secure Boot Status dokumentieren.
- RAM-Gesamtkapazitaet und Stabilitaet (Memtest) pruefen.
- GPU-Modell exakt erfassen und gegen ROCm-Kompatibilitaetsliste pruefen.
- NVMe SMART-Status pruefen.
- Externe Festplatte: SMART-Status, Dateisystem und Mount-Stabilitaet pruefen.

### 1.2 Empfohlene Kommandos
```bash
uname -a
cat /etc/os-release
lscpu
free -h
lspci | rg -i "vga|3d|display"
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL
sudo smartctl -a /dev/nvme0n1
sudo smartctl -a /dev/sdX
sudo dmidecode -t bios
[ -d /sys/firmware/efi ] && echo UEFI || echo Legacy
```

### 1.3 Entscheidungskriterien Update
- BIOS-Update empfohlen, wenn:
  - Changelog Stabilitaets-/Microcode-/PCIe- oder AGESA-Fixes enthaelt.
  - bekannte GPU/Resizable-BAR/ACPI-Probleme bestehen.
- Kein BIOS-Update unmittelbar vor Go-Live ohne Testfenster.

## 2. Treiber und Software-Stack

### 2.1 Kernel und Firmware
- LTS-Kernel aktuell halten (bei neuer AMD-Hardware meist aktueller HWE-Kernel sinnvoll).
- linux-firmware und microcode-Pakete aktuell.

### 2.2 AMD GPU / ROCm
- amdgpu Modul geladen.
- ROCm Runtime und Tools pruefen.
- Funktionstest: rocminfo, hipInfo, kleiner Inferenztest.

### 2.3 Empfohlene Kommandos
```bash
lsmod | rg -i "amdgpu|radeon|nvidia"
apt policy linux-image-generic-hwe-24.04 linux-firmware
rocminfo | head -n 40
hipInfo | head -n 40
```

### 2.4 Entscheidungskriterien Update
- Treiber/Kernel-Update noetig, wenn:
  - GPU nicht sauber erkannt wird.
  - ROCm Tests fehlschlagen.
  - Haeufige GPU-Resets oder Kernel-Fehler in dmesg auftreten.

## 3. Kompatibilitaet fuer Blueprint

### 3.1 Mindestkriterien
- 64 GB RAM vorhanden.
- GPU-Stack fuer mindestens ein grosses + ein kleines Modell parallel stabil.
- Genug schneller Speicher fuer Modelle, Vektordaten und Logs.
- Container-Laufzeit stabil (Docker/Podman) und automatische Neustarts moeglich.
- /data-Partition vorhanden und gross genug fuer Modelle, Caches, Qdrant und WebUI-Daten.
- NAS und externe Festplatte gleichzeitig stabil gemountet.

### 3.2 Abnahmekriterien
- Multi-Modell-Inferenz laeuft > 60 Minuten ohne Fehler.
- RAG-Pipeline kann Daten vom NAS lesen und indexieren.
- WebUI + API ueber Reverse Proxy erreichbar.

## 4. Erreichbarkeit von Unix-Geraeten und Handy
- Nicht "immer" garantiert. Erreichbarkeit haengt von Strom, Internet, DNS, Firewall, ISP (CGNAT), Router/NAT und Dienstzustand ab.

### 4.0 Betriebsmodus (festgelegt)
- VPN-first mit Tailscale ist Standard.
- Public-HTTPS ist optional und nur bei nachgewiesenem Bedarf aktiv.

## 4.1 Robuste Varianten
1. VPN-first (empfohlen)
- WireGuard oder Tailscale.
- Zugriff nur ueber VPN-IP/FQDN.
- Hohe Sicherheit, weniger offene Ports.

2. Public HTTPS Entry
- Nur Port 443 offen, Reverse Proxy mit TLS.
- Optional davor Cloudflare Tunnel oder Zero-Trust Gateway.

3. Bei dynamischer IP
- DynDNS nutzen.
- Router-Portfreigabe nur fuer 443 (und optional 22 nur via VPN).

## 4.2 Implikation fuer UI-Entwicklung
- Externer Zugriff fuer UI und API erfolgt zentral ueber einen Entry Point (HTTPS).
- Interne Dienstports bleiben intern und werden spaeter nur ueber Reverse-Proxy-Routing genutzt.
- Damit kann die Weboberflaeche gegen stabile Pfade entwickelt werden, ohne interne Ports offenzulegen.

## 4.3 Verfuegbarkeit erhoehen
- USV fuer Server + Router.
- systemd Restart-Policies und Healthchecks.
- Monitoring + Alerting (Uptime, Latenz, Zertifikatsablauf).
- Domain-DNS sauber bei IONOS gepflegt (A/AAAA, optional DynDNS bei wechselnder IP).

## 4.4 IONOS Domain Pruefung
- A/AAAA-Records zeigen auf die aktuelle oeffentliche IP.
- TTL fuer Umstellungen kurz halten (z. B. 300s waehrend Migration).
- Optional API-Key fuer automatisches DynDNS-Update hinterlegen.
- Zertifikatserneuerung (Let's Encrypt) gegen den IONOS-Namen testen.

## 4.5 Router-Bestandsdaten und Setup
- Router-WebUI: http://192.168.0.1
- Seriennummer: 2AL4GH1L9902263
- Firmware: AR01.05.063.15_082825_735.PC20.20.VF
- WAN-Portfreigabe vorbereiten: extern 443/tcp auf Reverse-Proxy-Host:443/tcp.
- Optional extern 80/tcp nur fuer Redirect/ACME auf Host:80/tcp.
- Keine Freigabe fuer interne Service-Ports (3000/4000/8000/8001/6333 etc.).
- SSH-Port 22 nicht oeffentlich freigeben.

### 4.6 Erklaerung: Phase 0 mit Tailscale (VPN-first)
Zielbild:
- Der Server ist ueber Tailnet erreichbar (z. B. `clemi.tail47b116.ts.net`).
- Interne Dienste (WebUI/API) bleiben lokal gebunden und werden nicht direkt im WAN geoeffnet.
- Optional kann fuer kontrollierte Freigaben Tailscale Funnel genutzt werden.

Wie der Zugriff funktioniert:
1. Server und Clients (Linux, Android) sind im selben Tailnet angemeldet.
2. Tailscale baut verschluesselte Verbindungen zwischen den Geraeten auf.
3. Zugriff auf WebUI/API erfolgt ueber Tailnet-Name oder Tailscale-IP.
4. Im VPN-first-Modus sind keine Router-Portfreigaben fuer 443/22 noetig.

Warum das in Phase 0 wichtig ist:
- Unabhaengigkeit von CGNAT/Router-Limitierungen fuer den Basiszugriff.
- Geringere Angriffsflaeche, weil keine direkten WAN-Freigaben erforderlich sind.
- Reproduzierbarer Testpfad fuer Linux-Client und Handy schon in der Vorphase.

Technische Mindestnachweise fuer "VPN-first funktionsfaehig":
```bash
tailscale status
tailscale ip -4
tailscale status --json | jq -r '.Self.DNSName'
curl -I http://127.0.0.1:3000
curl -I https://<server>.tailnet.ts.net
```

Optionaler Public-Pfad mit Funnel (ohne Router-Portfreigabe):
```bash
tailscale funnel --bg --https=443 http://127.0.0.1:3000
tailscale funnel status
```

Typische Fehlerbilder in Phase 0 und Bedeutung:
- `Connection refused` auf `127.0.0.1:3000`: Zielservice laeuft nicht.
- `No serve config`: kein aktiver serve/funnel Eintrag.
- `serve config denied`: lokale Rechte/Policy fuer Serve/Funnel fehlen.
- Health-Hinweis zu SSH-ACL: SSH ist aktiv, aber ACL erlaubt noch keinen Zugriff.

Abgrenzung fuer Go/No-Go:
- Go fuer VPN-first-Basisbetrieb ist moeglich, wenn Tailnet-Zugriff, lokaler Dienstpfad und Sicherheitsbaseline nachgewiesen sind.
- NAS/extdisk kann separat zurueckgestellt werden, wenn dies bewusst so beschlossen wurde.


## 7. Konkrete Umsetzung (Beispiele)
0. Voraussetzungen installieren
```bash
sudo apt update
sudo apt -y install curl jq ripgrep smartmontools pciutils
command -v rg jq smartctl lspci curl
```

1. Basis- und Hardwaredaten in Datei sichern
```bash
mkdir -p ~/llm-audit
{
  date
  uname -a
  cat /etc/os-release
  lscpu
  free -h
  lspci | rg -i "vga|3d|display"
  lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL
} | tee ~/llm-audit/phase0_hardware.txt
```

2. GPU- und Kernelstatus pruefen
```bash
{
  lsmod | rg -i "amdgpu|radeon|nvidia"
  dmesg -T | rg -i "amdgpu|kfd|gpu|pcie" | tail -n 120
  rocminfo | head -n 60
  hipInfo | head -n 60
} | tee ~/llm-audit/phase0_gpu_stack.txt
```

3. /data und Mounts validieren
```bash
sudo mkdir -p /data/models /data/hf-cache /data/qdrant /data/webui /data/litellm /data/logs
findmnt /data /mnt/nas/knowledge /mnt/nas/projects /mnt/extdisk/knowledge
sudo touch /data/.phase0_write_test && ls -la /data/.phase0_write_test
```

4. Single-Entry Erreichbarkeit testen
```bash
curl -I https://nas-clemens.de
curl -I https://nas-clemens.de/v1/models
```

5. DNS-Aufloesung fuer die Domain pruefen
```bash
dig +short nas-clemens.de A
dig +short nas-clemens.de AAAA
```

6. Tailscale-Basis pruefen (VPN-first)
```bash
tailscale version
tailscale status
tailscale ip -4
tailscale status --json | jq -r '.Self.DNSName'
```

7. Zugriff intern ueber Tailnet pruefen
```bash
# Variante A: Reverse Proxy lokal auf 443
curl -I https://<server>.tailnet.ts.net
curl -I https://100.x.y.z

# Variante B: WebUI direkt auf 3000
curl -I http://<server>.tailnet.ts.net:3000
curl -I http://100.x.y.z:3000
```

8. SSH ueber Tailscale aktivieren
```bash
sudo tailscale set --ssh
tailscale debug prefs | jq -r '.RunSSH'
```
