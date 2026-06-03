# Phase 7 - Smoketests und Modellverfuegbarkeit

## Ziel
Diese Phase stellt zwei Dinge sicher:
1. Modellstatus ist transparent in der Weboberflaeche sichtbar (nutzbar/nicht nutzbar).
2. Kernfunktionen der Hauptseite werden mit Smoke-Tests geprueft.

## Umgesetzte Aenderungen

### 1) Modellverfuegbarkeit im UI
- Neue Sektion **Modellverfuegbarkeit** in der Hauptseite.
- Button **Modelle pruefen** triggert Live-Checks gegen `POST /v1/rag/answer`.
- Nutzbare Modelle werden in der Liste gruen (`NUTZBAR`) markiert.
- Nicht nutzbare Modelle werden rot (`NICHT NUTZBAR`) markiert.
- Fuer nicht nutzbare Modelle wird eine Alternative angezeigt.
- Das aktuell ausgewaehlte Modell wird zusaetzlich am Select-Feld visuell markiert:
  - Gruener Rahmen: nutzbar
  - Roter Rahmen: nicht nutzbar

### 2) Button-/Funktions-Smoke-Tests
- Neue Sektion **Smoke-Tests** in der Hauptseite.
- Button **Smoke-Tests ausfuehren** prueft relevante UI-Funktionen automatisiert.
- Ergebnisliste mit `PASS`/`FAIL` pro Testfall.

Getestete Bereiche:
- Existenz aller Haupt-Buttons
- Workspace-Browse Ablauf
- Neuer Chat
- Aktiven Chat leeren
- Manuellen Kontextpfad hinzufuegen
- Kontextdateien leeren
- Senden-Button (mit Mock fuer API)
- Re-Index-Button (mit Mock fuer API)
- Logout

Hinweis:
- Fuer `Senden` und `Re-Index` wird in den Smoke-Tests absichtlich ein Mock verwendet, damit die Tests nicht an externer API-Erreichbarkeit scheitern.

## Behebung "Buttons funktionieren nicht"
Es wurde die API-Basisberechnung fuer lokalen Dateibetrieb (`file://`) korrigiert.

Vorher:
- Es entstand bei lokal geoeffneter Seite ein ungueltiger API-Pfad (`file://:4100`).

Jetzt:
- Bei `file://` wird automatisch `http://127.0.0.1:4100` genutzt.

## Aktueller Modellstatus (Live-Check)
Stand waehrend der Umsetzung:
- `gemma2-2b`: nutzbar
- `gemma3-27b`: nutzbar
- `mistral-7b`: nutzbar
- `llama3.3-70b`: aktuell nicht nutzbar (noch nicht vollstaendig lokal)
- `deepseek-r1-32b`: aktuell nicht nutzbar (Download laeuft)
- `deepseek-coder-16b`: aktuell nicht nutzbar (Tag nicht verfuegbar im Registry)

## Alternative Modellvorschlaege
Wenn ein Modell nicht nutzbar ist, zeigt das UI automatisch Alternativen an. Praktisch:
- Fuer `llama3.3-70b`: `gemma3-27b`, `gemma2-2b`
- Fuer `deepseek-r1-32b`: `gemma3-27b`, `mistral-7b`
- Fuer `deepseek-coder-16b`: `gemma2-2b`, `mistral-7b`

Zusatzempfehlung fuer Coder-Use-Cases:
- `deepseek-coder-v2:16b` kann als Alternativ-Tag geladen werden (falls `deepseek-coder:16b` nicht verfuegbar ist),
  benoetigt dann aber eine Router-Mapping-Anpassung.

## Operative Kommandos
Modellstatus pruefen:
```bash
curl -sS http://127.0.0.1:11434/api/tags | jq -r '.models[].name'
```

Router-Modelle pruefen:
```bash
for m in gemma2-2b gemma3-27b llama3.3-70b deepseek-r1-32b deepseek-coder-16b mistral-7b; do
  printf '%s: ' "$m"
  curl -sS -X POST http://127.0.0.1:4000/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer change_me_phase2' \
    -d "{\"model\":\"$m\",\"messages\":[{\"role\":\"user\",\"content\":\"OK\"}],\"max_tokens\":8}" \
  | jq -r 'if .error then "FAIL - " + (.error.message // "error") else "OK" end'
done
```

## Offene Punkte
- Sehr grosse Modelle (`llama3.3:70b`) benoetigen langen Download und ausreichend Speicher/VRAM.
- `deepseek-coder:16b` scheint als Tag nicht verfuegbar; hier sollte das Router-Mapping auf einen verifizierten Tag umgestellt werden (z. B. `deepseek-coder-v2:16b`).
