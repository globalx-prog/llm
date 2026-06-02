# Phase 0 Auswertung (02.06.2026)

## Entscheidung
No-Go (aktuell)

Begruendung:
- Single-Entry ueber HTTPS auf der Domain ist von diesem Host aus nicht erreichbar (Timeout auf Port 443).
- NAS- und extdisk-Quellpfade fuer RAG sind nicht vorhanden/gemountet.

## Nachweise (Kurzfassung)

### BIOS/UEFI
- Vendor: American Megatrends Inc.
- Version: 3811
- Release Date: 2025-10-22
- UEFI: aktiv

Quelle: phase0_bios_firmware.txt

### GPU/ROCm
- AMD GPU erkannt (PCI: Device 7449).
- Kernelmodul amdgpu geladen.
- ROCm Runtime meldet "ROCk module is loaded".
- HIP Tooling vorhanden (hipconfig/hipcc; hipInfo als Wrapper).

Quelle: phase0_gpu_stack.txt

### Storage
- /data vorhanden und auf ext4 gemountet (/dev/nvme0n1p9).
- Schreibtest auf /data erfolgreich.
- NVMe SMART: PASSED, keine Integrity Errors.

Quelle: phase0_storage_mounts.txt

### RAG-Mounts
- /mnt/nas/knowledge: MISS
- /mnt/nas/projects: MISS
- /mnt/extdisk/knowledge: MISS

Quelle: phase0_storage_mounts.txt

### DNS/HTTPS
- A-Records fuer nas-clemens.de: 79.236.99.17 und 192.168.178.83.
- AAAA: leer.
- HTTPS auf / und /v1/models: Timeout.
- TLS-Zertifikat konnte nicht gelesen werden (kein erfolgreicher TLS-Handshake auf 443).

Quelle: phase0_connectivity.txt

## Checkblatt-Status (Phase 0)
- [x] BIOS/UEFI Version dokumentiert
- [ ] BIOS-Updatebedarf bewertet (Changelog-Check ausstehend)
- [x] Linux-Kernel/Firmware grundsaetzlich lauffaehig
- [x] GPU/ROCm Basis-Funktionstest bestanden
- [ ] NAS-Mounts stabil nach Reboot (nicht vorhanden)
- [ ] Externe Festplatte als Knowledge-Tier stabil nach Reboot (nicht vorhanden)
- [ ] Optionaler Knowledge-Tier (NAS + extdisk) lauffaehig
- [ ] Reverse Proxy ueber HTTPS erreichbar
- [x] DNS-A-Record aufloesbar
- [ ] Zugriff von Linux-Client extern verifiziert (HTTPS Timeout)
- [ ] Zugriff von iOS/Android getestet (offen)
- [ ] VPN- oder Public-Entry final validiert
- [x] LLM-Datenpfade unter /data angelegt
- [ ] Go/No-Go = Go (aktuell No-Go)

## IONOS-spezifische Bewertung
Aktueller Risikobefund:
- Es sind gleichzeitig ein oeffentlicher und ein privater A-Record aktiv (79.236.99.17 und 192.168.178.83).
- Der private Record 192.168.178.83 ist fuer externen DNS-Zugriff ungueltig und fuehrt je nach Resolver zu Fehlrouting/Timeouts.

Empfehlung fuer IONOS DNS:
1. Fuer nas-clemens.de nur den oeffentlichen A-Record belassen.
2. Privaten A-Record 192.168.178.83 entfernen.
3. TTL waehrend Umstellung auf 300 setzen.
4. Nach Korrektur erneut pruefen: dig +short nas-clemens.de A und curl -I https://nas-clemens.de
5. Optional: split DNS nur intern via lokalem DNS-Resolver, nicht oeffentlich in IONOS.

## Priorisierte Massnahmen bis Go
1. IONOS DNS bereinigen (kein privater RFC1918-Record im oeffentlichen DNS).
2. Router/NAT pruefen: externe 443/tcp Weiterleitung auf Reverse-Proxy-Host:443.
3. Reverse Proxy lokal pruefen (Dienst aktiv, Zertifikat, vHost fuer nas-clemens.de).
4. NAS-/extdisk-Mounts unter /mnt/nas/* und /mnt/extdisk/* einrichten.
5. End-to-End Re-Test der Phase-0 Connectivity und Mount-Kriterien.

## Re-Test Kommandos
- dig +short nas-clemens.de A
- curl -I -m 20 https://nas-clemens.de
- curl -I -m 20 https://nas-clemens.de/v1/models
- findmnt /mnt/nas/knowledge /mnt/nas/projects /mnt/extdisk/knowledge

