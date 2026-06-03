#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
from pathlib import Path
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
RAG_ROUTER_TIMEOUT_S = float(os.getenv("RAG_ROUTER_TIMEOUT_S", "130"))
USER_REGISTRY_PATH = os.getenv("USER_REGISTRY_PATH", "/data/rag/user_registry.json")

try:
    import psutil
except Exception:  # pragma: no cover - optional runtime dependency
    psutil = None

pipeline = RagPipeline(CONFIG_PATH)
app = FastAPI(title="phase3-rag-api")
ACCESS_POLICY = dict(pipeline.cfg.get("access_policy", {}))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:4173", "http://localhost:4173"],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|100\.\d+\.\d+\.\d+|[A-Za-z0-9.-]+\.ts\.net)(:\d+)?$",
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
    model: str = "gemma2-2b"
    top_k: int = 5
    project: str | None = None


class UserUpsertRequest(BaseModel):
    user: str
    role: str
    projects: list[str]


def _audit_event(event_type: str, payload: dict[str, Any]) -> None:
    os.makedirs("/data/rag/jobs", exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    with open(f"/data/rag/jobs/{ts}_{event_type}.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=True, indent=2)


def _load_dynamic_registry() -> dict[str, Any]:
    try:
        with open(USER_REGISTRY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}


def _save_dynamic_registry(data: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(USER_REGISTRY_PATH), exist_ok=True)
    with open(USER_REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=True, indent=2)


def _effective_policy() -> dict[str, Any]:
    merged = dict(ACCESS_POLICY)
    for user, policy in _load_dynamic_registry().items():
        merged[str(user)] = policy
    return merged


def _identity(x_user: str | None, x_role: str | None) -> tuple[str, str]:
    user = (x_user or "").strip()
    role = (x_role or "").strip()
    if not user:
        raise HTTPException(status_code=401, detail="missing user identity")

    policy = _effective_policy().get(user)
    if not policy:
        raise HTTPException(status_code=403, detail="user not allowed")

    expected_role = str(policy.get("role", "")).strip()
    if role and expected_role and role != expected_role:
        raise HTTPException(status_code=403, detail="role mismatch")

    return user, expected_role or role or "unknown"


def _enforce_project(user: str, project: str | None) -> str:
    allowed = list(_effective_policy().get(user, {}).get("projects", []))
    if not allowed:
        raise HTTPException(status_code=403, detail="no projects assigned")

    if project:
        if project not in allowed:
            raise HTTPException(status_code=403, detail="project access denied")
        return project

    if len(allowed) == 1:
        return allowed[0]
    raise HTTPException(status_code=400, detail="project required for multi-project users")


def _read_float(path: str) -> float | None:
    try:
        raw = Path(path).read_text(encoding="utf-8").strip()
        if raw == "":
            return None
        return float(raw)
    except Exception:
        return None


def _collect_nvidia_gpus() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not shutil.which("nvidia-smi"):
        return rows

    try:
        raw = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            timeout=3,
        )
        for line in raw.splitlines():
            cols = [c.strip() for c in line.split(",")]
            if len(cols) >= 5:
                rows.append(
                    {
                        "name": cols[0],
                        "vendor": "nvidia",
                        "backend": "nvidia-smi",
                        "utilization_percent": float(cols[1]),
                        "temperature_c": float(cols[2]),
                        "memory_used_mb": float(cols[3]),
                        "memory_total_mb": float(cols[4]),
                    }
                )
    except Exception:
        return []
    return rows


def _collect_amd_gpus() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    drm_root = Path("/sys/class/drm")
    if not drm_root.exists():
        return rows

    for card in sorted(drm_root.glob("card[0-9]*")):
        device = card / "device"
        if not device.exists():
            continue

        uevent_path = device / "uevent"
        uevent = ""
        try:
            uevent = uevent_path.read_text(encoding="utf-8", errors="ignore").lower()
        except Exception:
            uevent = ""
        if "driver=amdgpu" not in uevent:
            continue

        busy = _read_float(str(device / "gpu_busy_percent"))
        mem_used = _read_float(str(device / "mem_info_vram_used"))
        mem_total = _read_float(str(device / "mem_info_vram_total"))
        mem_used_mb = round(mem_used / (1024 * 1024), 2) if mem_used is not None else None
        mem_total_mb = round(mem_total / (1024 * 1024), 2) if mem_total is not None else None

        temp_c = None
        for temp_file in sorted(device.glob("hwmon/hwmon*/temp*_input")):
            temp_milli = _read_float(str(temp_file))
            if temp_milli is not None:
                temp_c = round(temp_milli / 1000.0, 2)
                break

        card_name = card.name
        if (device / "product_name").exists():
            try:
                card_name = (device / "product_name").read_text(encoding="utf-8").strip() or card_name
            except Exception:
                card_name = card.name

        rows.append(
            {
                "name": card_name,
                "vendor": "amd",
                "backend": "amdgpu-sysfs",
                "card": card.name,
                "utilization_percent": busy,
                "temperature_c": temp_c,
                "memory_used_mb": mem_used_mb,
                "memory_total_mb": mem_total_mb,
            }
        )

    if rows:
        return rows

    if shutil.which("rocm-smi"):
        try:
            raw = subprocess.check_output(["rocm-smi", "--json"], text=True, timeout=3)
            parsed = json.loads(raw)
            for key, value in parsed.items():
                if not str(key).lower().startswith("card"):
                    continue
                rows.append(
                    {
                        "name": str(value.get("Card series") or key),
                        "vendor": "amd",
                        "backend": "rocm-smi",
                        "card": str(key),
                        "utilization_percent": value.get("GPU use (%)"),
                        "temperature_c": value.get("Temperature (Sensor edge) (C)"),
                        "memory_used_mb": value.get("VRAM Total Used Memory (B)"),
                        "memory_total_mb": value.get("VRAM Total Memory (B)"),
                    }
                )
        except Exception:
            return []

    return rows


def _collect_metrics() -> dict[str, Any]:
    if psutil is None:
        return {
            "ok": False,
            "service": "phase3-rag-api",
            "error": "psutil not available",
            "cpu": {},
            "ram": {},
            "gpus": [],
        }

    cpu_total = float(psutil.cpu_percent(interval=0.2))
    cpu_per_core = psutil.cpu_percent(interval=0.0, percpu=True)
    vm = psutil.virtual_memory()

    temps_map: dict[str, Any] = {}
    try:
        temps_map = psutil.sensors_temperatures(fahrenheit=False) or {}
    except Exception:
        temps_map = {}

    def _best_temp(predicate) -> float | None:
        for entries in temps_map.values():
            for entry in entries:
                label = (entry.label or "").lower()
                if predicate(label):
                    return float(entry.current)
        return None

    cpu_pkg_temp = _best_temp(lambda label: "package" in label or "cpu" in label or "tdie" in label)
    ram_temp = _best_temp(lambda label: "dimm" in label or "ram" in label)

    core_temps: list[float | None] = [None] * len(cpu_per_core)
    for entries in temps_map.values():
        for entry in entries:
            label = (entry.label or "").lower()
            if label.startswith("core"):
                parts = label.split()
                try:
                    idx = int(parts[-1])
                    if 0 <= idx < len(core_temps):
                        core_temps[idx] = float(entry.current)
                except Exception:
                    continue

    gpu_rows = _collect_nvidia_gpus()
    if not gpu_rows:
        gpu_rows = _collect_amd_gpus()

    gpu_probe = {
        "nvidia_smi": bool(shutil.which("nvidia-smi")),
        "rocm_smi": bool(shutil.which("rocm-smi")),
        "amdgpu_module_loaded": Path("/sys/module/amdgpu").exists(),
        "drm_cards_detected": len(list(Path("/sys/class/drm").glob("card[0-9]*"))) if Path("/sys/class/drm").exists() else 0,
    }

    return {
        "ok": True,
        "service": "phase3-rag-api",
        "ts": datetime.now(timezone.utc).isoformat(),
        "cpu": {
            "utilization_percent": cpu_total,
            "processor_temperature_c": cpu_pkg_temp,
            "cores": [
                {
                    "id": i,
                    "utilization_percent": float(util),
                    "temperature_c": core_temps[i] if i < len(core_temps) else None,
                }
                for i, util in enumerate(cpu_per_core)
            ],
        },
        "ram": {
            "utilization_percent": float(vm.percent),
            "used_gb": round(vm.used / (1024**3), 2),
            "total_gb": round(vm.total / (1024**3), 2),
            "temperature_c": ram_temp,
        },
        "gpus": gpu_rows,
        "gpu_probe": gpu_probe,
    }


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    inv = pipeline.inventory()
    return {
        "ok": True,
        "service": "phase3-rag-api",
        "sources": inv,
    }


@app.get("/v1/system/metrics")
def system_metrics() -> dict[str, Any]:
    return _collect_metrics()


@app.get("/v1/rag/users")
def list_users(
    x_user: str | None = Header(default=None),
    x_role: str | None = Header(default=None),
) -> dict[str, Any]:
    user, role = _identity(x_user, x_role)
    policy = _effective_policy()
    if role != "admin":
        return {"users": [{"user": user, **policy.get(user, {})}]}
    return {
        "users": [
            {"user": uname, **upolicy}
            for uname, upolicy in sorted(policy.items(), key=lambda item: item[0])
        ]
    }


@app.post("/v1/rag/users")
def upsert_user(
    req: UserUpsertRequest,
    x_user: str | None = Header(default=None),
    x_role: str | None = Header(default=None),
) -> dict[str, Any]:
    user, role = _identity(x_user, x_role)
    if role != "admin":
        raise HTTPException(status_code=403, detail="admin only")

    uname = req.user.strip()
    if not uname:
        raise HTTPException(status_code=400, detail="user required")

    target_role = req.role.strip()
    if target_role not in {"admin", "service", "reviewer"}:
        raise HTTPException(status_code=400, detail="invalid role")

    projects = [p.strip() for p in req.projects if p.strip()]
    if not projects:
        raise HTTPException(status_code=400, detail="at least one project required")

    reg = _load_dynamic_registry()
    reg[uname] = {"role": target_role, "projects": projects}
    _save_dynamic_registry(reg)
    _audit_event("user_upsert", {"by_user": user, "target_user": uname, "role": target_role, "projects": projects})
    return {"ok": True, "user": uname, "role": target_role, "projects": projects}


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

    timeout = httpx.Timeout(
        timeout=RAG_ROUTER_TIMEOUT_S,
        connect=min(10.0, RAG_ROUTER_TIMEOUT_S),
        read=RAG_ROUTER_TIMEOUT_S,
        write=min(30.0, RAG_ROUTER_TIMEOUT_S),
        pool=min(30.0, RAG_ROUTER_TIMEOUT_S),
    )

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                f"{ROUTER_BASE}/v1/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {ROUTER_KEY}"},
            )
            data = r.json()
    except httpx.ReadTimeout as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                f"Router-Timeout nach {RAG_ROUTER_TIMEOUT_S:.0f}s bei Modell {req.model}. "
                "Bitte kleineres Modell waehlen oder Anfrage reduzieren."
            ),
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Router-Verbindungsfehler: {exc}") from exc

    if r.status_code >= 400:
        err_obj = data.get("error", {}) if isinstance(data, dict) else {}
        message = str(err_obj.get("message") or err_obj.get("code") or f"router error status {r.status_code}")
        if "not found" in message.lower() and req.model:
            message = f"{message}. Hinweis: Modell {req.model} ist im Router konfiguriert, aber nicht in Ollama installiert (z. B. `ollama pull ...`)."
        raise HTTPException(status_code=502, detail=message)

    if isinstance(data, dict) and data.get("error"):
        err_obj = data.get("error", {})
        message = str(err_obj.get("message") or err_obj.get("code") or "router returned error payload")
        if "not found" in message.lower() and req.model:
            message = f"{message}. Hinweis: Modell {req.model} ist nicht lokal verfuegbar."
        raise HTTPException(status_code=502, detail=message)

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
