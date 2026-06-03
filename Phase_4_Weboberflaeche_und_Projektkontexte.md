# Phase 4: Weboberflaeche und Projektkontexte

## Ziel
Eine zentrale Weboberflaeche mit Login, Rollen und projektbezogenem Zugriff auf Modelle und RAG, entwickelt als klarer MVP-zu-Produktion-Pfad.

## Umsetzungsstand (2026-06-03)
- UI-MVP als lauffaehige Weboberflaeche umgesetzt unter `LLM/phase4/ui`.
- UI ist lokal erreichbar auf `http://127.0.0.1:4173`.
- Chatfluss integriert mit RAG-Antwortendpoint (`POST /v1/rag/answer`) inkl. Modellwahl `gemma4`.
- Projektkontext und Top-k in UI steuerbar.
- Quellenanzeige in der UI aktiv (Titel, Pfad, Projekt, Zeitstempel, Chunk-ID).
- Rollensicht im UI aktiv (`admin-owner`, `service-context`, `review-only`).
- Schreibaktionen mit Pflichtfeldern `Grund` + `Task-ID` im UI umgesetzt.
- Governancefluss umgesetzt:
  - reviewer wird fuer write action blockiert.
  - admin/service kann write action (Re-Index) ausloesen.
- Audit-Events in UI sichtbar (Login, Antwort, Blockierung, Write Action, Fehler).
- Responsives Layout fuer Desktop/Mobil umgesetzt.

## Zielbild der UI
1. Linke Navigation
- Projektwahl, Quellen, Agenten-Tasks und Einstellungen.

2. Hauptbereich
- Chat mit Modellwahl (`gemma4`), Kontext-Badges und Quellenanzeige.

3. Transparenzbereich
- Rolle, Freigabestatus fuer schreibende Aktionen, Audit-Ereignisse und Jobstatus.

## Umsetzungsschritte
1. Iteration A: UX-MVP
- Klickbarer Prototyp mit Mock-Daten fuer Chat, Quellen, Job-Log, Einstellungen.
- Informationsarchitektur und Nutzerfluss validieren.

2. Iteration B: API-Integration
- Chat an den einheitlichen Inferenz-Endpunkt anbinden.
- Quellen und Projektfilter aus RAG-Endpunkten anbinden.
- Jobstart fuer Ingestion/Indexierung integrieren.

3. Iteration C: Governance in der UI
- Rollensicht (Admin-Owner, Service-Kontext, optional read-only Reviewer) anzeigen.
- Schreibende Aktionen nur mit Freigabelogik und Pflichtmetadaten (Grund/Task-ID).
- Audit-Events in der Oberflaeche sichtbar machen.

4. Iteration D: Betriebsreife UX
- Fehlerbehandlung, Retry-Faelle, Timeout-Hinweise.
- Nutzungsgrenzen (Uploads, Prompt-Laenge, Sessions) klar rueckmelden.
- Responsives Verhalten fuer Desktop und mobile Endgeraete.

## DoD
- [x] MVP-Nutzerfluss ist ohne Mock-Brueche durchgaengig.
- [x] Login und Rollensteuerung funktionieren.
- [x] Nutzer sehen nur eigene Projektkontexte.
- [x] Chat kann das aktive Modellprofil (`gemma4`) waehlen.
- [x] Quellen sind fuer RAG-Antworten sichtbar.
- [x] Schreibende Aktionen erzeugen Audit-Eintrag mit Grund/Task-ID.
- [x] UI ist auf Desktop und mobil funktional.

## Checkblatt Phase 4
- [x] Reverse Proxy Routen korrekt.
- [x] CORS/CSRF Regeln geprueft.
- [x] Session-Policy dokumentiert.
- [x] Upload- und Dateitypgrenzen gesetzt.
- [x] UI-Fehlerpfade getestet.
- [x] Prototyp-Iteration A/B/C/D jeweils abgeschlossen und dokumentiert.

## Artefakte und Komponenten
- UI-Dateien:
  - `LLM/phase4/ui/index.html`
  - `LLM/phase4/ui/styles.css`
  - `LLM/phase4/ui/app.js`
- Reverse Proxy:
  - `LLM/phase4/reverse-proxy/Caddyfile.phase4`
- Nachweise:
  - `LLM/llm-audit/phase4_execution_2026-06-03_014130.txt`
  - `LLM/llm-audit/phase4_isolation_2026-06-03_014558.txt`

## Konkrete Umsetzung (Beispiele)
1. UI-Projekt starten (Beispiel mit Vite + React)
```bash
cd /opt
npm create vite@latest llm-ui -- --template react-ts
cd llm-ui
npm install
npm install axios @tanstack/react-query react-router-dom
```

2. API-Client zentral definieren
```ts
// src/lib/api.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: '/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});
```

3. Chat-Request fuer Modellprofil gemma4
```ts
// src/features/chat/sendMessage.ts
import { api } from '../../lib/api';

export async function sendMessage(model: 'gemma4', content: string, token: string) {
  const res = await api.post(
    '/chat/completions',
    { model, messages: [{ role: 'user', content }] },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}
```

4. Reverse-Proxy Route fuer SPA + API
```caddy
nas-clemens.de {
  @api path /v1/*
  reverse_proxy @api litellm:4000
  reverse_proxy llm-ui:5173
}
```

5. Produktiver Build und Start
```bash
cd /opt/llm-ui
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

```caddy
nas-clemens.de {
  @api path /v1/*
  reverse_proxy @api litellm:4000
  reverse_proxy 127.0.0.1:4173
}
```
