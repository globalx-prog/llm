# Phase 4: Weboberflaeche und Projektkontexte

## Ziel
Eine zentrale Weboberflaeche mit Login, Rollen und projektbezogenem Zugriff auf Modelle und RAG, entwickelt als klarer MVP-zu-Produktion-Pfad.

## Zielbild der UI
1. Linke Navigation
- Projektwahl, Quellen, Agenten-Tasks und Einstellungen.

2. Hauptbereich
- Chat mit Modellprofilwahl (fast/quality), Kontext-Badges und Quellenanzeige.

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
- [ ] MVP-Nutzerfluss ist ohne Mock-Brueche durchgaengig.
- [ ] Login und Rollensteuerung funktionieren.
- [ ] Nutzer sehen nur eigene Projektkontexte.
- [ ] Chat kann fast/quality Modellprofile waehlen.
- [ ] Quellen sind fuer RAG-Antworten sichtbar.
- [ ] Schreibende Aktionen erzeugen Audit-Eintrag mit Grund/Task-ID.
- [ ] UI ist auf Desktop und mobil funktional.

## Checkblatt Phase 4
- [ ] Reverse Proxy Routen korrekt.
- [ ] CORS/CSRF Regeln geprueft.
- [ ] Session-Policy dokumentiert.
- [ ] Upload- und Dateitypgrenzen gesetzt.
- [ ] UI-Fehlerpfade getestet.
- [ ] Prototyp-Iteration A/B/C/D jeweils abgeschlossen und dokumentiert.

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

3. Chat-Request fuer Modellprofil fast/quality
```ts
// src/features/chat/sendMessage.ts
import { api } from '../../lib/api';

export async function sendMessage(model: 'fast' | 'quality', content: string, token: string) {
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
