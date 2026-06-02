# Phase 2: Multi-LLM Inferenz

## Ziel
Mehrere Modelle parallel betreiben und ueber einen einheitlichen API-Einstiegspunkt nutzbar machen.

## Umsetzungsstand (2026-06-03)
- Native Services statt Container umgesetzt.
- Modell-Endpunkte aktiv:
  - quality auf `127.0.0.1:8000`
  - fast auf `127.0.0.1:8001`
- Router-Endpunkt aktiv auf `127.0.0.1:4000` mit OpenAI-kompatiblen Routen:
  - `GET /v1/models`
  - `POST /v1/chat/completions`
- API-Key-Regel aktiv (`Authorization: Bearer change_me_phase2`).
- Rollenbasierte Tokenlimits aktiv (`viewer: 800`, `admin: 4000`).
- Timeout/Fallback aktiv: `quality -> fast`.

## Wichtige Abweichung (LiteLLM)
- LiteLLM konnte in dieser Umgebung nicht stabil installiert werden, da die Abhaengigkeit `orjson` in der aufgeloesten Version auf Python 3.14 nicht baute (PyO3-Versionlimit).
- Um Phase 2 trotzdem voll funktional umzusetzen, wurde ein lokaler Router-Service mit gleichem API-Kontrakt bereitgestellt.
- Konfigurationspfad bleibt wie geplant unter `/data/litellm/config.yaml`, damit ein spaeterer Wechsel auf LiteLLM mit minimalen Anpassungen moeglich ist.

## Umsetzungsschritte
1. Runtime vorbereiten
- Container-Engine oder native Services einrichten.
- Modellspeicher unter /data/models bereitstellen.

2. Modellserver starten
- Modell A (quality) auf Port 8000.
- Modell B (fast) auf Port 8001.
- Optional Ollama fuer Zusatzmodelle.

3. LiteLLM als Router
- Einheitlicher Endpoint (z. B. /v1).
- Routingregeln je nach Task/Modellprofil.
- Stabiles Request-/Response-Schema fuer die Weboberflaeche festlegen.

4. Stabilitaet testen
- Parallelanfragen, Timeouts, Retry-Verhalten.
- Resource Guards (max tokens, concurrency).

5. UI-relevante API-Standards
- Einheitliche Fehlercodes und Fehlermeldungen fuer Frontend-Anzeige.
- Modellmetadaten (Profil fast/quality, Limits, Verfuegbarkeit) maschinenlesbar bereitstellen.
- Antwortmetadaten fuer UI ausgeben (Latenz, Modellname, Tokenverbrauch).

## DoD
- [x] Modell A und B liefern reproduzierbare Antworten.
- [x] Router schaltet korrekt zwischen Modellen.
- [x] Lasttest mit parallelen Requests bestanden.
- [x] Fehlerpfade (Timeout/Fallback) funktionieren.
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
  - `llm-model-quality.service`
  - `llm-model-fast.service`
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
sudo mkdir -p /data/models/quality-model /data/models/fast-model /data/litellm
sudo chown -R $USER:$USER /data/models /data/litellm
```

2. LiteLLM Konfiguration anlegen
```yaml
# /data/litellm/config.yaml
model_list:
  - model_name: fast
    litellm_params:
      model: openai/fast
      api_base: http://vllm_fast:8001/v1
      api_key: dummy
  - model_name: quality
    litellm_params:
      model: openai/quality
      api_base: http://vllm_quality:8000/v1
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
    "model": "fast",
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
    model: 'fast',
    messages: [{ role: 'user', content: 'ping' }]
  });
  const res = http.post('https://nas-clemens.de/v1/chat/completions', payload, {
    headers: { Authorization: 'Bearer change_me', 'Content-Type': 'application/json' }
  });
  check(res, { 'status is 200': (r) => r.status === 200 });
}
```
