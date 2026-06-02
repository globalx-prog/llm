#!/usr/bin/env python3
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rag_pipeline import RagPipeline

CONFIG_PATH = os.getenv("RAG_CONFIG", "/home/clemi/projekte/LLM/phase3/rag_config.yaml")
ROUTER_BASE = os.getenv("ROUTER_BASE", "http://127.0.0.1:4000")
ROUTER_KEY = os.getenv("ROUTER_KEY", "change_me_phase2")

pipeline = RagPipeline(CONFIG_PATH)
app = FastAPI(title="phase3-rag-api")
ACCESS_POLICY = dict(pipeline.cfg.get("access_policy", {}))

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


def _identity(x_user: str | None, x_role: str | None) -> tuple[str, str]:
    user = (x_user or "").strip()
    role = (x_role or "").strip()
    if not user:
        raise HTTPException(status_code=401, detail="missing user identity")

    policy = ACCESS_POLICY.get(user)
    if not policy:
        raise HTTPException(status_code=403, detail="user not allowed")

    expected_role = str(policy.get("role", "")).strip()
    if role and expected_role and role != expected_role:
        raise HTTPException(status_code=403, detail="role mismatch")

    return user, expected_role or role or "unknown"


def _enforce_project(user: str, project: str | None) -> str:
    allowed = list(ACCESS_POLICY.get(user, {}).get("projects", []))
    if not allowed:
        raise HTTPException(status_code=403, detail="no projects assigned")

    if project:
        if project not in allowed:
            raise HTTPException(status_code=403, detail="project access denied")
        return project

    if len(allowed) == 1:
        return allowed[0]
    raise HTTPException(status_code=400, detail="project required for multi-project users")


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    inv = pipeline.inventory()
    return {
        "ok": True,
        "service": "phase3-rag-api",
        "sources": inv,
    }


@app.post("/v1/rag/inventory")
def inventory(
    x_user: str | None = Header(default=None),
    x_role: str | None = Header(default=None),
) -> dict[str, Any]:
    user, role = _identity(x_user, x_role)
    allowed_projects = list(ACCESS_POLICY.get(user, {}).get("projects", []))
    data = {"inventory": pipeline.inventory()}
    data["allowed_projects"] = allowed_projects
    _audit_event("inventory", {"user": user, "role": role, **data})
    return data


@app.post("/v1/rag/ingest")
def ingest(
    x_reason: str = Header(default="manual"),
    x_task_id: str = Header(default="none"),
    x_user: str | None = Header(default=None),
    x_role: str | None = Header(default=None),
) -> dict[str, Any]:
    user, role = _identity(x_user, x_role)
    if role not in {"admin", "service"}:
        raise HTTPException(status_code=403, detail="write action not allowed for role")
    if not x_reason.strip() or not x_task_id.strip():
        raise HTTPException(status_code=400, detail="reason and task-id are required")

    result = pipeline.ingest()
    result["reason"] = x_reason
    result["task_id"] = x_task_id
    result["user"] = user
    result["role"] = role
    _audit_event("ingest", result)
    return result


@app.post("/v1/rag/search")
def search(
    req: SearchRequest,
    x_user: str | None = Header(default=None),
    x_role: str | None = Header(default=None),
) -> dict[str, Any]:
    user, role = _identity(x_user, x_role)
    project = _enforce_project(user, req.project)
    result = pipeline.search(req.query, req.top_k, project)
    _audit_event(
        "search",
        {"user": user, "role": role, "query": req.query, "project": project, "top_k": req.top_k, "hits": len(result["hits"])},
    )
    return result


@app.post("/v1/rag/answer")
async def answer(
    req: AnswerRequest,
    x_user: str | None = Header(default=None),
    x_role: str | None = Header(default=None),
) -> dict[str, Any]:
    user, role = _identity(x_user, x_role)
    project = _enforce_project(user, req.project)
    retrieval = pipeline.search(req.query, req.top_k, project)
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
        "project": project,
        "low_confidence": False,
    }
    _audit_event(
        "answer",
        {"user": user, "role": role, "query": req.query, "project": project, "sources": len(response["sources"])},
    )
    return response
