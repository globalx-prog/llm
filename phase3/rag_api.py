#!/usr/bin/env python3
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rag_pipeline import RagPipeline

CONFIG_PATH = os.getenv("RAG_CONFIG", "/home/clemi/projekte/LLM/phase3/rag_config.yaml")
ROUTER_BASE = os.getenv("ROUTER_BASE", "http://127.0.0.1:4000")
ROUTER_KEY = os.getenv("ROUTER_KEY", "change_me_phase2")

pipeline = RagPipeline(CONFIG_PATH)
app = FastAPI(title="phase3-rag-api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:4173", "http://localhost:4173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    project: str | None = None


class AnswerRequest(BaseModel):
    query: str
    model: str = "fast"
    top_k: int = 5
    project: str | None = None


def _audit_event(event_type: str, payload: dict[str, Any]) -> None:
    os.makedirs("/data/rag/jobs", exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    with open(f"/data/rag/jobs/{ts}_{event_type}.json", "w", encoding="utf-8") as f:
        import json

        json.dump(payload, f, ensure_ascii=True, indent=2)


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    inv = pipeline.inventory()
    return {
        "ok": True,
        "service": "phase3-rag-api",
        "sources": inv,
    }


@app.post("/v1/rag/inventory")
def inventory() -> dict[str, Any]:
    data = {"inventory": pipeline.inventory()}
    _audit_event("inventory", data)
    return data


@app.post("/v1/rag/ingest")
def ingest(x_reason: str = Header(default="manual"), x_task_id: str = Header(default="none")) -> dict[str, Any]:
    result = pipeline.ingest()
    result["reason"] = x_reason
    result["task_id"] = x_task_id
    _audit_event("ingest", result)
    return result


@app.post("/v1/rag/search")
def search(req: SearchRequest) -> dict[str, Any]:
    result = pipeline.search(req.query, req.top_k, req.project)
    _audit_event("search", {"query": req.query, "project": req.project, "top_k": req.top_k, "hits": len(result["hits"])})
    return result


@app.post("/v1/rag/answer")
async def answer(req: AnswerRequest) -> dict[str, Any]:
    retrieval = pipeline.search(req.query, req.top_k, req.project)
    hits = retrieval.get("hits", [])

    context_blocks = []
    for i, hit in enumerate(hits, start=1):
        src = hit.get("source", {})
        context_blocks.append(
            f"[{i}] ({src.get('project','')}) {src.get('path','')}\n{hit.get('text','')}"
        )

    if not context_blocks:
        return {
            "answer": "Keine passenden Quellen gefunden.",
            "sources": [],
            "retrieval": retrieval,
            "low_confidence": True,
        }

    system_prompt = (
        "Du bist ein Assistent. Nutze nur den gegebenen Kontext. "
        "Wenn die Information nicht aus dem Kontext hervorgeht, sage das klar."
    )
    user_prompt = (
        "Frage:\n" + req.query + "\n\nKontext:\n" + "\n\n".join(context_blocks) + "\n\n"
        "Antworte kurz und nenne die Quellenverweise [1], [2], ..."
    )

    payload = {
        "model": req.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 400,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            f"{ROUTER_BASE}/v1/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {ROUTER_KEY}"},
        )
        data = r.json()

    answer_text = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "Keine Antwort vom Modell erhalten.")
    )

    response = {
        "answer": answer_text,
        "sources": [h.get("source", {}) for h in hits],
        "retrieval": retrieval,
        "model": data.get("model", req.model),
        "router_meta": data.get("router_meta", {}),
        "low_confidence": False,
    }
    _audit_event("answer", {"query": req.query, "project": req.project, "sources": len(response["sources"])})
    return response
