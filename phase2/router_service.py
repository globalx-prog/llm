#!/usr/bin/env python3
import asyncio
import os
import time
from collections import defaultdict
from collections.abc import Mapping
from typing import Any

import httpx
import yaml
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel

CONFIG_PATH = os.getenv("ROUTER_CONFIG", "/data/litellm/config.yaml")


def _load_config(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, Mapping):
        raise ValueError("config root must be a mapping")
    return dict(data)


CFG = _load_config(CONFIG_PATH)
MASTER_KEY = str(CFG.get("master_key", "change_me"))
MODELS = dict(CFG.get("models", {}))
DEFAULT_MODEL = str(CFG.get("default_model", "gemma2-2b"))
FALLBACKS = dict(CFG.get("fallbacks", {}))
ROLE_TOKEN_LIMITS = dict(CFG.get("role_token_limits", {"viewer": 800, "admin": 4000}))
GLOBAL_MAX_TOKENS = int(CFG.get("global_max_tokens", 4096))
REQUEST_TIMEOUT_S = float(CFG.get("request_timeout_s", 2.5))
CONCURRENCY_LIMIT = int(CFG.get("concurrency_limit", 16))

app = FastAPI(title="phase2-router")
sem = asyncio.Semaphore(CONCURRENCY_LIMIT)
METRICS_STARTED_AT = time.time()
METRICS = {
    "requests_total": 0,
    "requests_success_total": 0,
    "requests_error_total": 0,
    "fallback_total": 0,
    "latency_sum_ms": 0,
    "latency_count": 0,
    "latency_max_ms": 0,
    "by_model_success": defaultdict(int),
    "by_model_error": defaultdict(int),
}


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str | None = None
    messages: list[ChatMessage]
    temperature: float | None = 0
    max_tokens: int | None = 256


def _err(status: int, code: str, message: str, details: dict[str, Any] | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={
            "error": {
                "type": "router_error",
                "code": code,
                "message": message,
                "details": details or {},
            }
        },
    )


def _require_key(auth_header: str | None) -> JSONResponse | None:
    if not auth_header or not auth_header.startswith("Bearer "):
        return _err(401, "missing_api_key", "Authorization header missing or invalid")
    key = auth_header.split(" ", 1)[1].strip()
    if key != MASTER_KEY:
        return _err(401, "invalid_api_key", "Provided API key is not valid")
    return None


def _token_limit_for_role(role: str) -> int:
    return int(ROLE_TOKEN_LIMITS.get(role, ROLE_TOKEN_LIMITS.get("viewer", 800)))


def _observe_request(*, latency_ms: int, success: bool, model: str, used_fallback: bool = False) -> None:
    METRICS["requests_total"] += 1
    METRICS["latency_sum_ms"] += max(0, latency_ms)
    METRICS["latency_count"] += 1
    METRICS["latency_max_ms"] = max(METRICS["latency_max_ms"], max(0, latency_ms))
    if success:
        METRICS["requests_success_total"] += 1
        METRICS["by_model_success"][model] += 1
    else:
        METRICS["requests_error_total"] += 1
        METRICS["by_model_error"][model] += 1
    if used_fallback:
        METRICS["fallback_total"] += 1


def _snapshot_metrics() -> dict[str, Any]:
    elapsed = max(1e-6, time.time() - METRICS_STARTED_AT)
    latency_count = max(1, METRICS["latency_count"])
    avg_latency = METRICS["latency_sum_ms"] / latency_count
    return {
        "uptime_seconds": int(elapsed),
        "requests_total": int(METRICS["requests_total"]),
        "requests_success_total": int(METRICS["requests_success_total"]),
        "requests_error_total": int(METRICS["requests_error_total"]),
        "fallback_total": int(METRICS["fallback_total"]),
        "latency_avg_ms": round(avg_latency, 2),
        "latency_max_ms": int(METRICS["latency_max_ms"]),
        "throughput_rps": round(METRICS["requests_total"] / elapsed, 3),
        "by_model_success": dict(METRICS["by_model_success"]),
        "by_model_error": dict(METRICS["by_model_error"]),
    }


def _resolve_route(requested_model: str | None) -> tuple[str, str, str]:
    model_name = requested_model or DEFAULT_MODEL
    if model_name in MODELS:
        cfg = MODELS[model_name]
        backend_model = str(cfg.get("backend_model", model_name))
        return model_name, str(cfg["api_base"]), backend_model
    cfg = MODELS[DEFAULT_MODEL]
    backend_model = str(cfg.get("backend_model", DEFAULT_MODEL))
    return DEFAULT_MODEL, str(cfg["api_base"]), backend_model


async def _forward(base_url: str, body: dict[str, Any]) -> tuple[dict[str, Any], int]:
    timeout = httpx.Timeout(REQUEST_TIMEOUT_S)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(f"{base_url}/chat/completions", json=body)
        return r.json(), r.status_code


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    m = _snapshot_metrics()
    return {
        "ok": True,
        "service": "phase2-router",
        "models": list(MODELS.keys()),
        "default_model": DEFAULT_MODEL,
        "timeout_s": REQUEST_TIMEOUT_S,
        "concurrency_limit": CONCURRENCY_LIMIT,
        "monitoring": {
            "enabled": True,
            "requests_total": m["requests_total"],
            "throughput_rps": m["throughput_rps"],
            "latency_avg_ms": m["latency_avg_ms"],
        },
    }


@app.get("/metrics", response_class=PlainTextResponse)
def metrics() -> str:
    m = _snapshot_metrics()
    lines = [
        "# HELP llm_router_requests_total Total requests processed by router",
        "# TYPE llm_router_requests_total counter",
        f"llm_router_requests_total {m['requests_total']}",
        "# HELP llm_router_requests_success_total Successful requests",
        "# TYPE llm_router_requests_success_total counter",
        f"llm_router_requests_success_total {m['requests_success_total']}",
        "# HELP llm_router_requests_error_total Failed requests",
        "# TYPE llm_router_requests_error_total counter",
        f"llm_router_requests_error_total {m['requests_error_total']}",
        "# HELP llm_router_fallback_total Fallback activations",
        "# TYPE llm_router_fallback_total counter",
        f"llm_router_fallback_total {m['fallback_total']}",
        "# HELP llm_router_latency_avg_ms Average end-to-end latency in ms",
        "# TYPE llm_router_latency_avg_ms gauge",
        f"llm_router_latency_avg_ms {m['latency_avg_ms']}",
        "# HELP llm_router_latency_max_ms Max observed latency in ms",
        "# TYPE llm_router_latency_max_ms gauge",
        f"llm_router_latency_max_ms {m['latency_max_ms']}",
        "# HELP llm_router_throughput_rps Average requests per second since start",
        "# TYPE llm_router_throughput_rps gauge",
        f"llm_router_throughput_rps {m['throughput_rps']}",
        "# HELP llm_router_uptime_seconds Router process uptime in seconds",
        "# TYPE llm_router_uptime_seconds gauge",
        f"llm_router_uptime_seconds {m['uptime_seconds']}",
    ]

    for model, count in m["by_model_success"].items():
        lines.append(f'llm_router_model_success_total{{model="{model}"}} {count}')
    for model, count in m["by_model_error"].items():
        lines.append(f'llm_router_model_error_total{{model="{model}"}} {count}')

    return "\n".join(lines) + "\n"


@app.get("/v1/models")
async def models(authorization: str | None = Header(default=None)) -> Any:
    auth_err = _require_key(authorization)
    if auth_err:
        return auth_err

    data = []
    timeout = httpx.Timeout(1.5)
    async with httpx.AsyncClient(timeout=timeout) as client:
        for name, model_cfg in MODELS.items():
            api_base = str(model_cfg["api_base"])
            available = False
            try:
                r = await client.get(f"{api_base}/models")
                available = r.status_code == 200
            except Exception:
                available = False
            data.append(
                {
                    "id": name,
                    "object": "model",
                    "profile": model_cfg.get("profile", name),
                    "model_type": model_cfg.get("model_type", "unknown"),
                    "parameter_count_b": model_cfg.get("parameter_count_b", None),
                    "api_base": api_base,
                    "available": available,
                }
            )
    return {"object": "list", "data": data}


@app.post("/v1/chat/completions")
async def chat(
    req: ChatRequest,
    request: Request,
    authorization: str | None = Header(default=None),
    x_role: str = Header(default="viewer"),
) -> Any:
    started = time.perf_counter()

    auth_err = _require_key(authorization)
    if auth_err:
        _observe_request(latency_ms=int((time.perf_counter() - started) * 1000), success=False, model="auth")
        return auth_err

    if not req.messages:
        _observe_request(latency_ms=int((time.perf_counter() - started) * 1000), success=False, model="validation")
        return _err(400, "invalid_request", "messages must not be empty")

    role_limit = _token_limit_for_role(x_role)
    max_tokens = int(req.max_tokens or 256)
    if max_tokens > role_limit or max_tokens > GLOBAL_MAX_TOKENS:
        _observe_request(latency_ms=int((time.perf_counter() - started) * 1000), success=False, model=req.model or DEFAULT_MODEL)
        return _err(
            400,
            "token_limit_exceeded",
            "Requested max_tokens exceeds role or global limit",
            {
                "requested": max_tokens,
                "role": x_role,
                "role_limit": role_limit,
                "global_limit": GLOBAL_MAX_TOKENS,
            },
        )

    body = req.model_dump()
    requested_model = req.model
    selected_model, api_base, backend_model = _resolve_route(requested_model)
    body["model"] = backend_model
    fallback_chain = list(FALLBACKS.get(selected_model, []))

    async with sem:
        attempted: list[str] = [selected_model]
        try:
            payload, status = await _forward(api_base, body)
            if status >= 500:
                raise RuntimeError(f"upstream status {status}")
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            _observe_request(latency_ms=elapsed_ms, success=True, model=selected_model)
            payload["router_meta"] = {
                "requested_model": requested_model,
                "selected_model": selected_model,
                "attempted_models": attempted,
                "latency_ms": elapsed_ms,
                "request_id": request.headers.get("x-request-id", "n/a"),
                "fallback_used": False,
            }
            return payload
        except Exception as first_exc:
            for fb in fallback_chain:
                if fb not in MODELS:
                    continue
                attempted.append(fb)
                try:
                    fb_payload, fb_status = await _forward(str(MODELS[fb]["api_base"]), body)
                    if fb_status >= 500:
                        continue
                    elapsed_ms = int((time.perf_counter() - started) * 1000)
                    _observe_request(latency_ms=elapsed_ms, success=True, model=fb, used_fallback=True)
                    fb_payload["router_meta"] = {
                        "requested_model": requested_model,
                        "selected_model": selected_model,
                        "attempted_models": attempted,
                        "latency_ms": elapsed_ms,
                        "request_id": request.headers.get("x-request-id", "n/a"),
                        "fallback_used": True,
                    }
                    return fb_payload
                except Exception:
                    continue

            _observe_request(latency_ms=int((time.perf_counter() - started) * 1000), success=False, model=selected_model)
            return _err(
                504,
                "upstream_timeout_or_failure",
                "All model attempts failed",
                {
                    "attempted_models": attempted,
                    "timeout_s": REQUEST_TIMEOUT_S,
                    "first_error": str(first_exc),
                },
            )
