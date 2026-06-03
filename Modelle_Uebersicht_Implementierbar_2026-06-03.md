# Uebersicht implementierbarer Modelle (lokal)

## Aktuell produktiv implementiert
- Profil-ID: `gemma2-2b`
- Laufzeit: `Ollama`
- Backend-Modell: `gemma2:2b`
- Modelltyp: `gemma2`
- Parameterzahl: `2.6B`
- Endpoint (OpenAI-kompatibel): `http://127.0.0.1:11434/v1`

## Direkt implementierbare Gemma-Modelle ueber Ollama
1. `gemma2:2b`
- Modelltyp: gemma2
- Parameterzahl: 2.6B
- Pull: `ollama pull gemma2:2b`

2. `gemma2:9b`
- Modelltyp: gemma2
- Parameterzahl: 9B
- Pull: `ollama pull gemma2:9b`

3. `gemma3:4b`
- Modelltyp: gemma3
- Parameterzahl: 4B
- Pull: `ollama pull gemma3:4b`

4. `gemma3:12b`
- Modelltyp: gemma3
- Parameterzahl: 12B
- Pull: `ollama pull gemma3:12b`

5. `gemma3:27b`
- Modelltyp: gemma3
- Parameterzahl: 27B
- Pull: `ollama pull gemma3:27b`

## Hinweis zur Auswahl
- Fuer stabile lokale Inferenz mit moderatem Bedarf ist `gemma2:2b` ein robuster Start.
- Fuer bessere Qualitaet bei mehr RAM/VRAM sind `9B`, `12B` oder `27B` sinnvoll.
- Der Router kann pro Profil-ID ein konkretes Backend-Modell mappen (`backend_model`).
