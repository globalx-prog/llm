#!/usr/bin/env python3
import fnmatch
import hashlib
import json
import math
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import yaml
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, FieldCondition, Filter, MatchValue, PointStruct, VectorParams


@dataclass
class Chunk:
    chunk_id: str
    text: str
    metadata: dict[str, Any]


class RagPipeline:
    def __init__(self, config_path: str):
        self.config_path = config_path
        with open(config_path, "r", encoding="utf-8") as f:
            self.cfg = yaml.safe_load(f) or {}

        qdrant_cfg = self.cfg.get("qdrant", {})
        self.vector_size = int(self.cfg.get("embedding", {}).get("size", 256))
        self.client = QdrantClient(path=qdrant_cfg.get("local_path", "/data/rag/qdrant"))
        self.collection_prefix = str(qdrant_cfg.get("collection_prefix", "rag_"))

        chunk_cfg = self.cfg.get("chunk", {})
        self.chunk_size = int(chunk_cfg.get("size", 700))
        self.chunk_overlap = int(chunk_cfg.get("overlap", 120))

        self.sources: list[str] = list(self.cfg.get("sources", []))
        self.exclude_globs: list[str] = list(self.cfg.get("exclude_globs", []))
        self.allowed_extensions: set[str] = set(self.cfg.get("allowed_extensions", []))

    def _normalize_project(self, project: str) -> str:
        safe = re.sub(r"[^a-zA-Z0-9_]+", "_", project.strip().lower())
        return safe.strip("_") or "default"

    def _collection_name(self, project: str) -> str:
        return f"{self.collection_prefix}{self._normalize_project(project)}"

    def _ensure_collection(self, collection: str) -> None:
        if not self.client.collection_exists(collection):
            self.client.create_collection(
                collection_name=collection,
                vectors_config=VectorParams(size=self.vector_size, distance=Distance.COSINE),
            )

    def _should_skip(self, path: Path) -> bool:
        if self.allowed_extensions and path.suffix.lower() not in self.allowed_extensions:
            return True
        for pat in self.exclude_globs:
            if fnmatch.fnmatch(path.name.lower(), pat.lower()):
                return True
        return False

    def inventory(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for src in self.sources:
            src_path = Path(src)
            if not src_path.exists():
                rows.append({"source": src, "status": "missing", "files": 0})
                continue

            count = 0
            for p in src_path.rglob("*"):
                if p.is_file() and not self._should_skip(p):
                    count += 1
            rows.append({"source": src, "status": "ok", "files": count})
        return rows

    def _infer_project(self, source_root: Path, full_path: Path) -> str:
        rel = full_path.relative_to(source_root)
        parts = rel.parts
        if not parts:
            return "default"
        return parts[0] if len(parts) > 1 else source_root.name

    def _sha256(self, content: bytes) -> str:
        return "sha256:" + hashlib.sha256(content).hexdigest()

    def _split_chunks(self, text: str) -> list[str]:
        text = text.strip()
        if not text:
            return []
        chunks: list[str] = []
        step = max(1, self.chunk_size - self.chunk_overlap)
        i = 0
        while i < len(text):
            chunks.append(text[i : i + self.chunk_size])
            i += step
        return chunks

    def _hash_embedding(self, text: str) -> list[float]:
        vec = [0.0] * self.vector_size
        for token in re.findall(r"\w+", text.lower()):
            h = int(hashlib.sha1(token.encode("utf-8")).hexdigest(), 16)
            idx = h % self.vector_size
            sign = -1.0 if ((h >> 8) & 1) else 1.0
            vec[idx] += sign
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def ingest(self) -> dict[str, Any]:
        total_files = 0
        total_chunks = 0
        projects: dict[str, int] = {}
        errors: list[str] = []

        for src in self.sources:
            src_path = Path(src)
            if not src_path.exists():
                continue

            for p in src_path.rglob("*"):
                if not p.is_file() or self._should_skip(p):
                    continue

                try:
                    raw = p.read_bytes()
                    text = raw.decode("utf-8", errors="ignore")
                    chunks = self._split_chunks(text)
                    if not chunks:
                        continue

                    project = self._infer_project(src_path, p)
                    collection = self._collection_name(project)
                    self._ensure_collection(collection)

                    points: list[PointStruct] = []
                    now = datetime.now(timezone.utc).isoformat()
                    version = self._sha256(raw)

                    for idx, ch in enumerate(chunks):
                        chunk_id = f"{p.name}::{idx:04d}"
                        metadata = {
                            "project": project,
                            "source_path": str(p),
                            "chunk_id": chunk_id,
                            "timestamp": now,
                            "version": version,
                            "title": p.name,
                        }
                        points.append(
                            PointStruct(
                                id=str(uuid4()),
                                vector=self._hash_embedding(ch),
                                payload={"text": ch, **metadata},
                            )
                        )

                    self.client.upsert(collection_name=collection, points=points)
                    total_files += 1
                    total_chunks += len(chunks)
                    projects[project] = projects.get(project, 0) + len(chunks)
                except Exception as exc:
                    errors.append(f"{p}: {exc}")

        return {
            "files_ingested": total_files,
            "chunks_ingested": total_chunks,
            "projects": projects,
            "errors": errors,
        }

    def search(self, query: str, top_k: int = 5, project: str | None = None) -> dict[str, Any]:
        if not query.strip():
            return {"query": query, "hits": []}

        vector = self._hash_embedding(query)

        collections: list[str]
        if project:
            collections = [self._collection_name(project)]
        else:
            collections = [c.name for c in self.client.get_collections().collections if c.name.startswith(self.collection_prefix)]

        all_hits: list[dict[str, Any]] = []

        for collection in collections:
            try:
                search_filter = None
                if project:
                    search_filter = Filter(must=[FieldCondition(key="project", match=MatchValue(value=project))])

                result_obj = self.client.query_points(
                    collection_name=collection,
                    query=vector,
                    limit=top_k,
                    query_filter=search_filter,
                )
                for r in result_obj.points:
                    payload = r.payload or {}
                    all_hits.append(
                        {
                            "score": float(r.score),
                            "text": payload.get("text", ""),
                            "source": {
                                "title": payload.get("title", "unknown"),
                                "path": payload.get("source_path", ""),
                                "project": payload.get("project", ""),
                                "timestamp": payload.get("timestamp", ""),
                                "chunk_id": payload.get("chunk_id", ""),
                            },
                        }
                    )
            except Exception:
                continue

        all_hits.sort(key=lambda h: h["score"], reverse=True)
        return {"query": query, "hits": all_hits[:top_k]}


def dump_json(path: str, data: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=True, indent=2)
