# 00 Vorbereitung

## Ziel
Vorbereitung fuer den Remote-LLM-Dienst mit NAS, RAG, Agenten und zentralem HTTPS-Zugriff.

## Leitentscheidungen
1. Single Entry: standardmaessig VPN-first ueber Tailscale (tailnet), optional Public-HTTPS ueber Reverse Proxy.
2. Interne Services bleiben intern (keine direkte Exposition von Service-Ports).
3. Rollenmodell fuer Solo-Betrieb:
- Admin-Owner
- Service-Account
- Optional read-only Reviewer
4. LLM-Betriebsdaten liegen ausschliesslich unter /data.
5. NAS + externe Festplatte als Quellen fuer RAG.

## Architektur (kompakt)
1. Zugriffsschicht:
- Tailscale als Standard-Zugriffsschicht (MagicDNS + ACL).
- Optional Reverse Proxy mit Public-HTTPS nur bei explizitem Bedarf.

2. API/UI-Schicht:
- Open WebUI als Frontend.
- LiteLLM als einheitlicher API-Router.

3. Inferenz-Schicht:
- Gemma 4 Modellprofil (OpenAI-kompatibler Endpoint).
- Optional Ollama.

4. RAG-Schicht:
- Ingestion, Embeddings, Qdrant, optional Reranker.

5. Agenten-Schicht:
- Projektgebundene Agentenlaeufe, allowlist-basierte Schreibrechte, Diff + Review.

6. Storage-Schicht:
- /mnt/nas/knowledge (ro), /mnt/nas/projects (rw projektbezogen)
- /mnt/extdisk/knowledge (ro)
- /data/models, /data/hf-cache, /data/qdrant, /data/webui, /data/litellm, /data/logs

## Port- und DNS-Basis
- Extern offen: standardmaessig kein WAN-Port (VPN-first).
- Optional Public-Mode: 443/tcp (80 nur Redirect/ACME).
- SSH: nur ueber Tailscale SSH.
- DNS (IONOS): nur fuer optionalen Public-Mode erforderlich.
- Bei dynamischer IP: DynDNS ueber IONOS API/Router.
- Router-WebUI: http://192.168.0.1 (WAN-Portfreigabe und Firewall-Regeln).

## Umsetzungsreihenfolge
1. Phase 0: Hardware, Treiber, Kompatibilitaet, Erreichbarkeit pruefen.
2. Phase 1: Host-Hardening, Netzwerk, IAM, Mounts.
3. Phase 2: Multi-LLM Inferenz und API-Kontrakt.
4. Phase 3: RAG auf NAS/extdisk mit Quellenbezug.
5. Phase 4: Weboberflaeche und Projektkontexte.
6. Phase 5: Agenten, Diff-Workflow, Review-Schutz.
7. Phase 6: Monitoring, Backup/Restore, Governance, Runbooks.

## Referenzdokumente
- Phase 0: Phase_0_Systemkonfiguration_und_Kompatibilitaet.md
- Phase 1: Phase_1_Grundlagen_und_Sicherheit.md
- Phase 2: Phase_2_Multi_LLM_Inferenz.md
- Phase 3: Phase_3_RAG_auf_NAS.md
- Phase 4: Phase_4_Weboberflaeche_und_Projektkontexte.md
- Phase 5: Phase_5_Agenten_und_Dateibearbeitung.md
- Phase 6: Phase_6_Betrieb_Backup_Governance.md

## Globale Abnahme (DoD)
- [ ] Extern ist kein WAN-Port offen (VPN-first) oder alternativ nur 443 im Public-Mode.
- [ ] Interne Service-Ports sind nicht oeffentlich.
- [ ] Tailnet-Zugriff (Linux + Android) ist erfolgreich getestet.
- [ ] Rollen- und Rechtekonzept ist technisch umgesetzt.
- [ ] Schreibende Agentenaktionen sind auditierbar.
- [ ] NAS/extdisk-Ingestion laeuft stabil.
- [ ] Datenpfade liegen unter /data.
- [ ] RAG liefert reproduzierbar Quellenbezug.
- [ ] Backup und Restore wurden erfolgreich getestet.
- [ ] Go/No-Go ist dokumentiert.
