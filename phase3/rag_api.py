#!/usr/bin/env python3
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote, quote_plus

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
RAG_WEB_VERIFY_TLS = str(os.getenv("RAG_WEB_VERIFY_TLS", "false")).strip().lower() in {"1", "true", "yes", "on"}
FS_WRITE_ROOTS = [
    p.strip()
    for p in os.getenv("RAG_FS_WRITE_ROOTS", "/mnt/nas/knowledge:/home/clemi/projekte").split(":")
    if p.strip()
]

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
    use_web: bool = False
    web_top_k: int = 3


class FileWriteRequest(BaseModel):
    path: str
    content: str
    project: str | None = None
    append: bool = False
    ensure_parent: bool = True


class ModelProbeRequest(BaseModel):
    model: str = "gemma2-2b"


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


def _user_aliases(user: str) -> list[str]:
    raw = str(user or "").strip()
    if not raw:
        return []

    aliases: list[str] = [raw]
    if "@" in raw:
        aliases.append(raw.split("@", 1)[0].strip())
    if "\\" in raw:
        aliases.append(raw.rsplit("\\", 1)[-1].strip())

    seen: set[str] = set()
    deduped: list[str] = []
    for alias in aliases:
        key = alias.lower()
        if alias and key not in seen:
            seen.add(key)
            deduped.append(alias)
    return deduped


def _policy_entry_for_user(user: str, policy: dict[str, Any]) -> tuple[str, dict[str, Any]] | tuple[None, None]:
    if not user:
        return None, None

    # Fast path: exact key lookup.
    if user in policy and isinstance(policy[user], dict):
        return user, policy[user]

    lower_index = {str(k).lower(): str(k) for k in policy.keys()}
    for alias in _user_aliases(user):
        alias_l = alias.lower()
        key = lower_index.get(alias_l)
        if key and isinstance(policy.get(key), dict):
            return key, policy[key]
    return None, None


def _identity(x_user: str | None, x_role: str | None) -> tuple[str, str]:
    user = (x_user or "").strip()
    role = (x_role or "").strip()
    if not user:
        raise HTTPException(status_code=401, detail="missing user identity")

    effective = _effective_policy()
    matched_user, policy = _policy_entry_for_user(user, effective)
    if not policy or not matched_user:
        raise HTTPException(status_code=403, detail="user not allowed")

    expected_role = str(policy.get("role", "")).strip()
    if role and expected_role and role != expected_role:
        raise HTTPException(status_code=403, detail="role mismatch")

    return matched_user, expected_role or role or "unknown"


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


def _path_is_under(candidate: Path, root: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def _resolve_write_path(path_value: str, project: str) -> Path:
    raw = str(path_value or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="path required")

    if os.path.isabs(raw):
        target = Path(raw).expanduser().resolve(strict=False)
    else:
        target = Path(f"/mnt/nas/knowledge/{project}", raw).expanduser().resolve(strict=False)

    allowed_roots = [Path(root).expanduser().resolve(strict=False) for root in FS_WRITE_ROOTS]
    if not any(_path_is_under(target, root) for root in allowed_roots):
        raise HTTPException(status_code=403, detail="path outside allowed write roots")

    return target


def _dedupe_local_hits(hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for hit in hits:
        src = hit.get("source", {}) if isinstance(hit, dict) else {}
        project = str(src.get("project", "") or "")
        path = str(src.get("path", "") or "")
        title = str(src.get("title", "") or "")
        key = f"{project}|{path}|{title}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append(hit)
    return deduped


def _prefer_web_sources(query: str, use_web: bool, web_hits: list[dict[str, str]]) -> bool:
    if not use_web or not web_hits:
        return False
    q = str(query or "").lower()
    markers = (
        "wer ",
        "was ",
        "wann ",
        "wo ",
        "champions league",
        "bundesliga",
        "weltmeister",
        "wahl",
        "aktuell",
        "heute",
        "news",
    )
    return any(marker in q for marker in markers)


def _years_in_text(text: str) -> list[str]:
    return re.findall(r"\b(19\d{2}|20\d{2}|21\d{2})\b", str(text or ""))


async def _web_search_snippets(query: str, top_k: int) -> list[dict[str, str]]:
    q = str(query or "").strip()
    if not q:
        return []

    limit = max(1, min(int(top_k or 3), 10))
    timeout = httpx.Timeout(timeout=10.0, connect=5.0, read=10.0, write=10.0, pool=10.0)
    url = "https://api.duckduckgo.com/"
    params = {
        "q": q,
        "format": "json",
        "no_html": "1",
        "no_redirect": "1",
        "skip_disambig": "1",
    }

    web_headers = {
        "User-Agent": "LLM-RAG/1.0 (+local)",
        "Accept": "application/json,text/plain,*/*",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, verify=RAG_WEB_VERIFY_TLS, headers=web_headers) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                return []
            data = r.json() if r.text else {}
    except Exception:
        return []

    results: list[dict[str, str]] = []

    abstract_text = str(data.get("AbstractText") or "").strip()
    abstract_url = str(data.get("AbstractURL") or "").strip()
    heading = str(data.get("Heading") or "").strip() or "DuckDuckGo"
    if abstract_text:
        results.append(
            {
                "title": heading,
                "url": abstract_url,
                "snippet": abstract_text,
            }
        )

    def add_related(items: list[Any]) -> None:
        for item in items:
            if len(results) >= limit:
                return
            if isinstance(item, dict) and isinstance(item.get("Topics"), list):
                add_related(item.get("Topics") or [])
                continue
            if not isinstance(item, dict):
                continue
            text = str(item.get("Text") or "").strip()
            first_url = str(item.get("FirstURL") or "").strip()
            if text:
                title = text.split(" - ", 1)[0].strip() or "Web"
                results.append(
                    {
                        "title": title,
                        "url": first_url,
                        "snippet": text,
                    }
                )

    add_related(data.get("RelatedTopics") or [])

    if len(results) >= limit:
        return results[:limit]

    # Fallback: Wikipedia search + summary (de, then en) improves factual queries.
    async def wiki_hits(lang: str) -> list[dict[str, str]]:
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, verify=RAG_WEB_VERIFY_TLS, headers=web_headers) as client:
                search_resp = await client.get(
                    f"https://{lang}.wikipedia.org/w/api.php",
                    params={
                        "action": "query",
                        "list": "search",
                        "srsearch": q,
                        "format": "json",
                        "srlimit": min(limit, 5),
                        "utf8": "1",
                    },
                )
                if search_resp.status_code != 200:
                    return []
                search_data = search_resp.json() if search_resp.text else {}
                entries = (search_data.get("query", {}) or {}).get("search", []) or []

                wiki_results: list[dict[str, str]] = []
                for entry in entries:
                    title = str((entry or {}).get("title") or "").strip()
                    if not title:
                        continue
                    summary_resp = await client.get(
                        f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{quote(title, safe='')}"
                    )
                    if summary_resp.status_code != 200:
                        continue
                    summary_data = summary_resp.json() if summary_resp.text else {}
                    snippet = str(summary_data.get("extract") or "").strip()
                    page_url = str(((summary_data.get("content_urls") or {}).get("desktop") or {}).get("page") or "").strip()
                    if snippet:
                        wiki_results.append(
                            {
                                "title": title,
                                "url": page_url,
                                "snippet": snippet,
                            }
                        )
                    if len(wiki_results) >= limit:
                        break
                return wiki_results
        except Exception:
            return []

    for lang in ("de", "en"):
        if len(results) >= limit:
            break
        for item in await wiki_hits(lang):
            key = f"{item.get('title','')}|{item.get('url','')}"
            seen = {f"{r.get('title','')}|{r.get('url','')}" for r in results}
            if key in seen:
                continue
            results.append(item)
            if len(results) >= limit:
                break

    if len(results) >= limit:
        return results[:limit]

    # Last resort fallback: use curl subprocess (works when service Python TLS stack fails).
    def curl_json(url: str) -> dict[str, Any] | None:
        if not shutil.which("curl"):
            return None
        try:
            raw = subprocess.check_output(["curl", "-sS", url], text=True, timeout=10)
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None

    q_enc = quote_plus(q)
    search_url = (
        "https://de.wikipedia.org/w/api.php"
        f"?action=query&list=search&srsearch={q_enc}&format=json&srlimit={min(limit, 5)}&utf8=1"
    )
    search_data = curl_json(search_url) or {}
    entries = ((search_data.get("query") or {}).get("search") or []) if isinstance(search_data, dict) else []
    for entry in entries:
        if len(results) >= limit:
            break
        title = str((entry or {}).get("title") or "").strip()
        if not title:
            continue
        sum_url = f"https://de.wikipedia.org/api/rest_v1/page/summary/{quote(title, safe='')}"
        sum_data = curl_json(sum_url) or {}
        snippet = str(sum_data.get("extract") or "").strip()
        page_url = str(((sum_data.get("content_urls") or {}).get("desktop") or {}).get("page") or "").strip()
        if not snippet:
            continue
        key = f"{title}|{page_url}"
        seen = {f"{r.get('title','')}|{r.get('url','')}" for r in results}
        if key in seen:
            continue
        results.append({"title": title, "url": page_url, "snippet": snippet})

    return results[:limit]


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


@app.post("/v1/rag/fs/write")
def fs_write(
    req: FileWriteRequest,
    x_reason: str = Header(default="agent-write"),
    x_task_id: str = Header(default="none"),
    x_user: str | None = Header(default=None),
    x_role: str | None = Header(default=None),
) -> dict[str, Any]:
    user, role = _identity(x_user, x_role)
    if role not in {"admin", "service"}:
        raise HTTPException(status_code=403, detail="write action not allowed for role")
    if not x_reason.strip() or not x_task_id.strip():
        raise HTTPException(status_code=400, detail="reason and task-id are required")

    project = _enforce_project(user, req.project)
    target = _resolve_write_path(req.path, project)

    if req.ensure_parent:
        target.parent.mkdir(parents=True, exist_ok=True)

    mode = "a" if req.append else "w"
    with open(target, mode, encoding="utf-8") as f:
        f.write(req.content)

    result = {
        "ok": True,
        "path": str(target),
        "project": project,
        "append": bool(req.append),
        "bytes_written": len(req.content.encode("utf-8")),
        "reason": x_reason,
        "task_id": x_task_id,
    }
    _audit_event("fs_write", {"user": user, "role": role, **result})
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
    hits = _dedupe_local_hits(retrieval.get("hits", []))
    web_hits = await _web_search_snippets(req.query, req.web_top_k) if req.use_web else []
    prefer_web = _prefer_web_sources(req.query, req.use_web, web_hits)

    if prefer_web:
        ordered_sources = [
            {
                "project": "web",
                "title": item.get("title", "Web"),
                "path": item.get("url", ""),
                "snippet": item.get("snippet", ""),
            }
            for item in web_hits
        ] + [h.get("source", {}) for h in hits]
    else:
        ordered_sources = [h.get("source", {}) for h in hits] + [
            {
                "project": "web",
                "title": item.get("title", "Web"),
                "path": item.get("url", ""),
                "snippet": item.get("snippet", ""),
            }
            for item in web_hits
        ]

    context_blocks = []
    for i, src in enumerate(ordered_sources, start=1):
        proj = str(src.get("project", "") or "")
        title = str(src.get("title", "") or src.get("path", "") or "")
        path = str(src.get("path", "") or "")
        snippet = str(src.get("snippet", "") or "")
        source_text = snippet
        if not source_text:
            # Local retrieval chunks provide text in hits, not in sources.
            match = next((h for h in hits if h.get("source", {}).get("path") == path and h.get("source", {}).get("project") == proj), None)
            source_text = str((match or {}).get("text", ""))
        context_blocks.append(f"[{i}] ({proj}) {title} | {path}\n{source_text}")

    if not context_blocks:
        return {
            "answer": "Keine passenden Quellen gefunden.",
            "sources": [],
            "retrieval": retrieval,
            "web_used": bool(req.use_web),
            "web_hits": len(web_hits),
            "low_confidence": True,
        }

    system_prompt = (
        "Du bist ein Assistent. Nutze nur den gegebenen Kontext. "
        "Wenn die Information nicht aus dem Kontext hervorgeht, sage das klar. "
        "Wenn in der Frage ein konkretes Jahr vorkommt, nenne Gewinner/Fakten nur dann, "
        "wenn genau dieses Jahr im Kontext eindeutig belegt ist; sonst antworte 'Unklar im Kontext'."
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

    query_years = _years_in_text(req.query)
    if query_years:
        qy = query_years[0]
        answer_years = _years_in_text(answer_text)
        if qy not in answer_years:
            answer_text = f"Unklar im Kontext fuer das Jahr {qy}."

    response = {
        "answer": answer_text,
        "sources": ordered_sources,
        "retrieval": retrieval,
        "model": data.get("model", req.model),
        "router_meta": data.get("router_meta", {}),
        "project": project,
        "web_used": bool(req.use_web),
        "web_hits": len(web_hits),
        "source_strategy": "web_first" if prefer_web else "local_first",
        "low_confidence": False,
    }
    _audit_event(
        "answer",
        {"user": user, "role": role, "query": req.query, "project": project, "sources": len(response["sources"])},
    )
    return response


@app.post("/v1/rag/model_probe")
async def model_probe(
    req: ModelProbeRequest,
    x_user: str | None = Header(default=None),
    x_role: str | None = Header(default=None),
) -> dict[str, Any]:
    user, role = _identity(x_user, x_role)

    payload = {
        "model": req.model,
        "messages": [{"role": "user", "content": "OK"}],
        "max_tokens": 8,
    }

    probe_timeout = min(max(RAG_ROUTER_TIMEOUT_S, 10.0), 35.0)
    timeout = httpx.Timeout(
        timeout=probe_timeout,
        connect=min(8.0, probe_timeout),
        read=probe_timeout,
        write=min(15.0, probe_timeout),
        pool=min(15.0, probe_timeout),
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
        raise HTTPException(status_code=504, detail=f"Probe-Timeout bei Modell {req.model}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Router-Verbindungsfehler: {exc}") from exc

    if r.status_code >= 400:
        err_obj = data.get("error", {}) if isinstance(data, dict) else {}
        message = str(err_obj.get("message") or err_obj.get("code") or f"router error status {r.status_code}")
        raise HTTPException(status_code=502, detail=message)

    if isinstance(data, dict) and data.get("error"):
        err_obj = data.get("error", {})
        message = str(err_obj.get("message") or err_obj.get("code") or "router returned error payload")
        raise HTTPException(status_code=502, detail=message)

    answer_text = str(
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    ).strip()
    if not answer_text:
        raise HTTPException(status_code=502, detail="keine modellantwort")

    _audit_event("model_probe", {"user": user, "role": role, "model": req.model})
    return {
        "ok": True,
        "model": req.model,
        "router_model": data.get("model", req.model),
    }
