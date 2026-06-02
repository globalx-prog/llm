# Phase 3: RAG auf vorhandenem Dateisystem (NAS + externe Festplatte)

## Ziel
RAG-Ende-zu-Ende auf NAS- und externen Festplattenquellen mit sauberen Projektgrenzen und Quellenbezug.

## Umsetzungsstand (2026-06-03)
- RAG-API als Service aktiv auf `127.0.0.1:4100` (`llm-rag-api.service`).
- Quelleninventar aktiv auf:
  - `/mnt/nas/knowledge`
  - `/mnt/extdisk/knowledge`
- Ingestion-Pipeline umgesetzt (lesen, normalisieren, chunken, Metadaten schreiben).
- Embeddings als lokaler hash-basierter 256-D Vektor umgesetzt.
- Projekttrennung aktiv ueber getrennte Collections (`rag_<project>`).
- Retrieval mit Top-k und Projektfilter aktiv.
- Antwortfluss aktiv: Retrieval-Kontext -> Router (`127.0.0.1:4000`) -> Antwort + Quellenobjekte.
- UI-relevantes Quellenformat aktiv mit `title`, `path`, `project`, `timestamp`, `chunk_id`.
- Leere Trefferfaelle werden als `low_confidence: true` zurueckgegeben.

## Umsetzungsschritte
1. Dateninventar
- Projektordner und Dateitypen erfassen.
- Ausschlussregeln definieren (bin, temp, privat).
- Quellen aus /mnt/nas/knowledge und /mnt/extdisk/knowledge erfassen.

2. Ingestion-Pipeline
- Dokumente lesen, normalisieren, chunken.
- Metadaten setzen: projekt, pfad, version, timestamp.

3. Embeddings + Index
- Embedding-Modell auswaehlen.
- Pro Projekt separater Index/Collection in Qdrant.

4. Retrieval
- Top-k Suche mit Metadatenfiltern.
- Optional Reranker fuer praezisere Rangfolge.

5. Antwortfluss
- Treffer als Kontext an LLM.
- Quellenanzeige in UI/API ausgeben.

6. UI-Integrationspunkte
- Einheitliches Quellenformat fuer die Weboberflaeche definieren (titel, pfad, projekt, zeitstempel).
- Retrieval-Parameter fuer UI steuerbar machen (z. B. top-k, Projektfilter).
- Leere Trefferfaelle und niedrige Konfidenz als klare Rueckmeldung fuer die UI behandeln.

## DoD
- [x] 90% der relevanten Testfragen finden mindestens eine passende Quelle.
- [x] Projekte sind datenmaessig getrennt.
- [x] Quellenlinks werden in Antworten angezeigt.
- [x] Re-Indexierung ist automatisierbar.
- [x] Ingestion aus NAS und externer Festplatte funktioniert stabil.
- [x] UI kann Quellen und Projektfilter ohne Sonderlogik anzeigen.

## Checkblatt Phase 3
- [x] Chunking-Strategie dokumentiert.
- [x] Metadaten-Schema final.
- [x] Qdrant-Backup aktiviert.
- [x] Testset mit Goldantworten gepflegt.
- [x] Ingestion-Fehlerhandling implementiert.
- [x] Antwortschema fuer Quellen ist fuer UI dokumentiert und getestet.

## Artefakte und Komponenten
- Service:
  - `llm-rag-api.service`
- Implementierung:
  - `LLM/phase3/rag_config.yaml`
  - `LLM/phase3/rag_pipeline.py`
  - `LLM/phase3/rag_api.py`
  - `LLM/phase3/evaluate_retrieval.py`
  - `LLM/phase3/testset_gold.json`
  - `LLM/phase3/backup_qdrant.sh`
- Nachweise:
  - `LLM/llm-audit/phase3_execution_2026-06-03_014123.txt`
  - `LLM/llm-audit/phase3_eval_2026-06-03_014148.json`
  - `LLM/llm-audit/phase3_backup_2026-06-03_014148.txt`

## Konkrete Umsetzung (Beispiele)
0. Voraussetzungen pruefen
```bash
sudo apt update
sudo apt -y install curl jq
curl -s http://localhost:6333/readyz | jq .
```

1. Quellenpfade und Arbeitsordner vorbereiten
```bash
mkdir -p /data/rag/jobs /data/rag/export
find /mnt/nas/knowledge -maxdepth 2 -type f | head -n 20
find /mnt/extdisk/knowledge -maxdepth 2 -type f | head -n 20
```

2. Beispiel-Metadatenformat fuer Chunks
```json
{
  "project": "mim-llm",
  "source_path": "/mnt/nas/knowledge/llm/handbuch.md",
  "chunk_id": "handbuch.md::0001",
  "timestamp": "2026-06-02T10:00:00Z",
  "version": "sha256:..."
}
```

3. Qdrant Collection pro Projekt anlegen
```bash
# Smoke-Test mit 3-dimensionalem Dummy-Vektor
curl -s -X PUT "http://localhost:6333/collections/mim_llm_docs" \
  -H "Content-Type: application/json" \
  -d '{"vectors": {"size": 3, "distance": "Cosine"}}' | jq .
```

4. Retrieval-Smoketest mit Projektfilter
```bash
curl -s -X POST "http://localhost:6333/collections/mim_llm_docs/points/search" \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.01, 0.02, 0.03],
    "limit": 5,
    "filter": {"must": [{"key": "project", "match": {"value": "mim-llm"}}]}
  }' | jq .
```
