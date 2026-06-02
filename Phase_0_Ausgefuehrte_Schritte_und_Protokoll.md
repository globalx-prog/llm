# Phase 0: Ausgefuehrte Schritte und Protokoll (Kurzfassung)

## Scope
- Diese Kurzfassung enthaelt nur ausgefuehrte Schritte, aktuellen Check-Status und das ausgefuellte Protokoll.
- NAS/extdisk ist bewusst zurueckgestellt.

## Ausgefuehrte Schritte
1. BIOS/UEFI, Kernel, GPU/ROCm und /data geprueft.
2. VPN-first mit Tailscale eingerichtet und verifiziert.
3. Tailnet-Zugriff mit MagicDNS getestet.
4. Funnel auf `https://clemi.tail47b116.ts.net` eingerichtet und getestet.
5. Lokaler Dienst auf Port 3000 persistent als systemd-Unit bereitgestellt.
6. Security-Baseline umgesetzt:
- UFW aktiv, inbound nur auf `tailscale0`.
- fail2ban aktiv.

# TODO NAS Festplatte

## Checkblatt (Ist-Stand)
- [x] BIOS/UEFI Version dokumentiert.
- [ ] BIOS-Updatebedarf bewertet.
- [x] Linux-Kernel/Firmware aktuell.
- [x] GPU/ROCm Funktionstest bestanden.
- [ ] NAS-Mounts stabil nach Reboot (zurueckgestellt).
- [ ] Externe Festplatte stabil nach Reboot gemountet (zurueckgestellt).
- [ ] Optionaler Knowledge-Tier (NAS + extdisk) lauffaehig (zurueckgestellt).
- [x] Reverse Proxy/Funnel ueber HTTPS erreichbar.
- [x] Tailscale ist verbunden (tailscale status ohne Fehler).
- [x] Tailnet-Hostname aufloesbar (MagicDNS).
- [x] Zugriff von Linux-Client getestet.
- [x] Zugriff von iOS/Android getestet.
- [x] SSH ueber Tailscale konfiguriert und geprueft (derzeit bewusst deaktiviert bis finale ACL).
- [ ] IONOS DNS (A/AAAA, optional DynDNS) final getestet.
- [x] VPN- oder Public-Entry-Konzept festgelegt.
- [x] Alle LLM-Datenpfade liegen auf /data.
- [x] Go/No-Go Entscheidung protokolliert.
- [x] Single-Entry-Prinzip fuer UI/API verbindlich festgelegt.

## Protokoll (ausgefuellt)
- Datum: 2026-06-03
- Hostname: clemi
- BIOS-Version: American Megatrends Inc. 3811 (Release 2025-10-22)
- Kernel: Linux 7.0.0-22-generic (Ubuntu 26.04)
- GPU: AMD/ATI Device 7449 (amdgpu geladen)
- ROCm-Status: ROCk module loaded; rocminfo/hipInfo funktionsfaehig
- NAS-Status: zurueckgestellt (Mountpoints vorbereitet)
- Erreichbarkeit extern:
- VPN-first: `clemi.tail47b116.ts.net` erreichbar
- Funnel: `https://clemi.tail47b116.ts.net` liefert HTTP 200
- Offene Risiken:
- Produktiver WebUI/API-Stack noch nicht final ausgerollt (aktuell Platzhalterdienst)
- NAS/extdisk noch nicht eingehangen
- Finale SSH-ACL-Richtlinie noch auszurollen
- Entscheidung: Go fuer Phase-0-Scope ohne NAS/extdisk

## Referenz-Audits
- llm-audit/phase0_recheck_2026-06-03.txt
- llm-audit/phase0_closure_recheck_no_nas.txt
- llm-audit/phase0_abschluss_ohne_nas_2026-06-03.md
- llm-audit/phase1_service_and_funnel_apply.txt
