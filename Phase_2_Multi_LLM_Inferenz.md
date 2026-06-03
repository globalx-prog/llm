# Phase 2: Inferenzbetrieb

## Ziel
Ein produktives Modellprofil ueber einen einheitlichen API-Einstiegspunkt nutzbar machen.

## Umsetzungsstand (2026-06-03)
- Native Services statt Container umgesetzt.
- Modell-Endpunkte aktiv:
  - gemma2-2b auf `127.0.0.1:11434` (Ollama, `gemma2:2b`)
  - gemma3-27b auf `127.0.0.1:11434` (Ollama, `gemma3:27b`)
- Router-Endpunkt aktiv auf `127.0.0.1:4000` mit OpenAI-kompatiblen Routen:
  - `GET /v1/models`
  - `POST /v1/chat/completions`
- API-Key-Regel aktiv (`Authorization: Bearer change_me_phase2`).
- Rollenbasierte Tokenlimits aktiv (`viewer: 800`, `admin: 4000`).
- Multi-Model Betrieb aktiv: `gemma2-2b` (default) und `gemma3-27b`.

## Wichtige Abweichung (LiteLLM)
- LiteLLM konnte in dieser Umgebung nicht stabil installiert werden, da die Abhaengigkeit `orjson` in der aufgeloesten Version auf Python 3.14 nicht baute (PyO3-Versionlimit).
- Um Phase 2 trotzdem voll funktional umzusetzen, wurde ein lokaler Router-Service mit gleichem API-Kontrakt bereitgestellt.
- Konfigurationspfad bleibt wie geplant unter `/data/litellm/config.yaml`, damit ein spaeterer Wechsel auf LiteLLM mit minimalen Anpassungen moeglich ist.

## Umsetzungsschritte
1. Runtime vorbereiten
- Container-Engine oder native Services einrichten.
- Modellspeicher unter /data/models bereitstellen.

2. Modellserver starten
- Modellprofile gemma2-2b und gemma3-27b ueber Ollama auf Port 11434.

3. LiteLLM als Router
- Einheitlicher Endpoint (z. B. /v1).
- Routingregeln je nach Task/Modellprofil.
- Stabiles Request-/Response-Schema fuer die Weboberflaeche festlegen.

4. Stabilitaet testen
- Parallelanfragen, Timeouts, Retry-Verhalten.
- Resource Guards (max tokens, concurrency).

5. UI-relevante API-Standards
- Einheitliche Fehlercodes und Fehlermeldungen fuer Frontend-Anzeige.
- Modellmetadaten (Profile gemma2-2b/gemma3-27b, Limits, Verfuegbarkeit) maschinenlesbar bereitstellen.
- Antwortmetadaten fuer UI ausgeben (Latenz, Modellname, Tokenverbrauch).

## DoD
- [x] Modellprofile gemma2-2b und gemma3-27b liefern reproduzierbare Antworten.
- [x] Router routet korrekt auf beide Profile.
- [x] Lasttest mit parallelen Requests bestanden.
- [x] Fehlerpfade sind konsistent abgebildet.
- [x] Frontend kann Fehlermeldungen und Metadaten konsistent darstellen.

## Checkblatt Phase 2
- [x] Healthchecks fuer alle Modellservices.
- [x] Modellpfade liegen auf /data/models bereit (Platzhalterstruktur erstellt).
- [x] API-Key-Regeln gesetzt.
- [x] Tokenlimits pro Rolle definiert.
- [x] Monitoring fuer Latenz und Throughput aktiv.
- [x] UI-Testclient gegen den finalen API-Kontrakt erfolgreich.

## Artefakte und Services
- Audit-Nachweis: `LLM/llm-audit/phase2_execution_2026-06-03_011817.txt`
- Monitoring-Nachweis: `LLM/llm-audit/phase2_monitoring_2026-06-03_012207.txt`
- Umsetzungsprotokoll: `LLM/Phase_2_Umgesetzte_Schritte_2026-06-03.md`
- Source:
  - `LLM/phase2/mock_model_server.py`
  - `LLM/phase2/router_service.py`
  - `LLM/phase2/phase2-router-config.yaml`
- Systemd:
  - `snap.ollama.ollama.service`
  - `llm-router.service`

## Konkrete Umsetzung (Beispiele)
0. Voraussetzungen installieren
```bash
sudo apt update
sudo apt -y install curl jq
# k6 optional fuer Lasttest
curl -s https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt -y install k6
```

1. Modellpfade vorbereiten
```bash
sudo mkdir -p /data/litellm /mnt/data/ollama/models
sudo chown -R $USER:$USER /data/litellm /mnt/data/ollama
```

2. LiteLLM Konfiguration anlegen
```yaml
# /data/litellm/config.yaml
model_list:
  - model_name: gemma2-2b
    litellm_params:
      model: openai/gemma2:2b
      api_base: http://127.0.0.1:11434/v1
      api_key: dummy
  - model_name: gemma3-27b
    litellm_params:
      model: openai/gemma3:27b
      api_base: http://127.0.0.1:11434/v1
      api_key: dummy
general_settings:
  master_key: change_me
```

3. API-Funktion testen
```bash
curl -s https://nas-clemens.de/v1/models \
  -H "Authorization: Bearer change_me" | jq .

curl -s https://nas-clemens.de/v1/chat/completions \
  -H "Authorization: Bearer change_me" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma2-2b",
    "messages": [{"role": "user", "content": "Antworte mit ok"}],
    "temperature": 0
  }' | jq .
```

4. Parallel-Lasttest mit k6 (Beispiel)
```javascript
// save as smoke_models.js
import http from 'k6/http';
import { check } from 'k6';
export const options = { vus: 10, duration: '1m' };
export default function () {
  const payload = JSON.stringify({
    model: 'gemma2-2b',
    messages: [{ role: 'user', content: 'ping' }]
  });
  const res = http.post('https://nas-clemens.de/v1/chat/completions', payload, {
    headers: { Authorization: 'Bearer change_me', 'Content-Type': 'application/json' }
  });
  check(res, { 'status is 200': (r) => r.status === 200 });
}
```
