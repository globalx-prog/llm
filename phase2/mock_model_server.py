#!/usr/bin/env python3
import os
import time
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

MODEL_ID = os.getenv("MODEL_ID", "quality")
PROFILE = os.getenv("PROFILE", "quality")
BASE_DELAY_MS = int(os.getenv("BASE_DELAY_MS", "180"))

app = FastAPI(title=f"mock-{MODEL_ID}")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str | None = None
    messages: list[ChatMessage]
    temperature: float | None = 0
    max_tokens: int | None = 256


def _estimate_tokens(messages: list[ChatMessage], answer: str) -> tuple[int, int]:
    prompt_chars = sum(len(m.content) for m in messages)
    prompt_tokens = max(1, prompt_chars // 4)
    completion_tokens = max(1, len(answer) // 4)
    return prompt_tokens, completion_tokens


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"ok": True, "model": MODEL_ID, "profile": PROFILE}


@app.get("/v1/models")
def models() -> dict[str, Any]:
    return {
        "object": "list",
        "data": [
            {
                "id": MODEL_ID,
                "object": "model",
                "owned_by": "local",
                "profile": PROFILE,
                "available": True,
            }
        ],
    }


@app.post("/v1/chat/completions")
def chat(req: ChatRequest) -> dict[str, Any]:
    started = time.perf_counter()
    user_last = next((m.content for m in reversed(req.messages) if m.role == "user"), "")

    if "__force_timeout__" in user_last and PROFILE == "quality":
        time.sleep(5)
    else:
        time.sleep(BASE_DELAY_MS / 1000.0)

    answer = f"ok-{PROFILE}"
    if user_last.startswith("echo:"):
        answer = user_last.replace("echo:", "", 1).strip() or answer

    prompt_tokens, completion_tokens = _estimate_tokens(req.messages, answer)
    latency_ms = int((time.perf_counter() - started) * 1000)

    return {
        "id": f"chatcmpl-{int(time.time() * 1000)}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": MODEL_ID,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": answer},
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
        "response_meta": {
            "latency_ms": latency_ms,
            "profile": PROFILE,
            "backend": MODEL_ID,
        },
    }
